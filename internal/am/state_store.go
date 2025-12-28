// Package am provides the StateStore for Time-Travel Scrubber functionality.
// Stores periodic terminal snapshots in a ring buffer for state reconstruction.
package am

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// StateSnapshot represents terminal state at a point in time.
type StateSnapshot struct {
	Timestamp        time.Time `json:"timestamp"`
	TabID            string    `json:"tabId"`
	SequenceNum      int64     `json:"sequenceNum"`

	// Terminal State
	CleanedContent   string    `json:"cleanedContent"`   // ANSI-stripped text
	ContentHash      string    `json:"contentHash"`      // For deduplication
	ScrollbackLines  int       `json:"scrollbackLines"`

	// Context
	WorkingDirectory string    `json:"workingDirectory"`
	LastCommand      string    `json:"lastCommand"`
	LastExitCode     int       `json:"lastExitCode"`

	// Diff Optimization
	DiffFromPrev     string    `json:"diffFromPrev,omitempty"`  // Delta encoding
	FullSnapshot     bool      `json:"fullSnapshot"`            // Every Nth is full
	PrevSequence     int64     `json:"prevSequence,omitempty"`  // Reference for delta

	// Size tracking
	CompressedSize   int       `json:"compressedSize,omitempty"`
}

// SnapshotContext provides context for snapshot capture.
type SnapshotContext struct {
	WorkingDirectory string
	LastCommand      string
	LastExitCode     int
	ScrollbackLines  int
}

// StateStore manages the ring buffer and persistence for time-travel.
type StateStore struct {
	tabID      string
	amDir      string

	// Ring buffer (fixed size)
	buffer     []StateSnapshot
	bufferSize int
	writeIdx   int64
	seqNum     int64

	// Persistence
	flushTicker *time.Ticker
	lastFlush   time.Time
	dirty       bool

	// Control
	stopCh     chan struct{}
	running    bool
	mu         sync.RWMutex
	wg         sync.WaitGroup
}

// StateStore configuration constants
const (
	DefaultSnapshotInterval  = 3 * time.Second   // Capture every 3s
	DefaultBufferSize        = 100               // ~5 min history in-memory
	FlushToDiskInterval      = 5 * time.Minute   // Persist to disk
	FullSnapshotEvery        = 10                // Every 10th is full (not delta)
	MaxSnapshotContentSize   = 64 * 1024         // 64KB per snapshot
	MaxStoredSnapshots       = 1000              // Max snapshots on disk
)

// Global state store registry
var (
	stateStores   = make(map[string]*StateStore)
	stateStoresMu sync.RWMutex
)

// GetStateStore retrieves or creates a StateStore for a tab.
func GetStateStore(tabID string) *StateStore {
	stateStoresMu.RLock()
	store, exists := stateStores[tabID]
	stateStoresMu.RUnlock()

	if exists {
		return store
	}

	stateStoresMu.Lock()
	defer stateStoresMu.Unlock()

	// Double-check after acquiring write lock
	if store, exists = stateStores[tabID]; exists {
		return store
	}

	// Create new store
	store = NewStateStore(tabID, getAMDir())
	stateStores[tabID] = store
	store.Start()

	return store
}

// CloseStateStore closes and removes a StateStore for a tab.
func CloseStateStore(tabID string) {
	stateStoresMu.Lock()
	store, exists := stateStores[tabID]
	if exists {
		delete(stateStores, tabID)
	}
	stateStoresMu.Unlock()

	if store != nil {
		store.Stop()
	}
}

// NewStateStore creates a new state store for a tab.
func NewStateStore(tabID, amDir string) *StateStore {
	return &StateStore{
		tabID:      tabID,
		amDir:      amDir,
		buffer:     make([]StateSnapshot, DefaultBufferSize),
		bufferSize: DefaultBufferSize,
		stopCh:     make(chan struct{}),
	}
}

// Start begins the background persistence goroutine.
func (s *StateStore) Start() {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return
	}
	s.running = true
	s.mu.Unlock()

	s.flushTicker = time.NewTicker(FlushToDiskInterval)
	s.wg.Add(1)
	go s.persistenceLoop()

	log.Printf("[StateStore] Started for tab %s", s.tabID)
}

// Stop gracefully shuts down the state store.
func (s *StateStore) Stop() {
	s.mu.Lock()
	if !s.running {
		s.mu.Unlock()
		return
	}
	s.running = false
	s.mu.Unlock()

	if s.flushTicker != nil {
		s.flushTicker.Stop()
	}
	close(s.stopCh)
	s.wg.Wait()

	// Final flush
	s.flushToDisk()

	log.Printf("[StateStore] Stopped for tab %s", s.tabID)
}

// CaptureSnapshot is called from ProcessLoop (async pipeline).
// Must complete in <1ms to not affect 402 MB/s throughput.
func (s *StateStore) CaptureSnapshot(cleanedContent string, ctx SnapshotContext) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.running {
		return
	}

	// Truncate if too large
	if len(cleanedContent) > MaxSnapshotContentSize {
		cleanedContent = cleanedContent[len(cleanedContent)-MaxSnapshotContentSize:]
	}

	// Compute content hash for deduplication
	contentHash := computeContentHash(cleanedContent)

	// Check if content changed from last snapshot
	prevIdx := (s.writeIdx - 1 + int64(s.bufferSize)) % int64(s.bufferSize)
	if s.writeIdx > 0 && s.buffer[prevIdx].ContentHash == contentHash {
		// Content unchanged, skip
		return
	}

	s.seqNum++
	isFullSnapshot := s.seqNum%FullSnapshotEvery == 0 || s.writeIdx == 0

	snapshot := StateSnapshot{
		Timestamp:        time.Now(),
		TabID:            s.tabID,
		SequenceNum:      s.seqNum,
		CleanedContent:   cleanedContent,
		ContentHash:      contentHash,
		WorkingDirectory: ctx.WorkingDirectory,
		LastCommand:      ctx.LastCommand,
		LastExitCode:     ctx.LastExitCode,
		ScrollbackLines:  ctx.ScrollbackLines,
		FullSnapshot:     isFullSnapshot,
	}

	// Delta encoding for non-full snapshots
	if !isFullSnapshot && s.writeIdx > 0 {
		prevSnap := s.buffer[prevIdx]
		if prevSnap.CleanedContent != "" {
			snapshot.DiffFromPrev = computeSimpleDiff(prevSnap.CleanedContent, cleanedContent)
			snapshot.PrevSequence = prevSnap.SequenceNum
			// Keep full content for fast access (memory tradeoff for speed)
			// snapshot.CleanedContent = "" // Uncomment to save memory
		}
	}

	// Write to ring buffer
	idx := s.writeIdx % int64(s.bufferSize)
	s.buffer[idx] = snapshot
	s.writeIdx++
	s.dirty = true
}

// RewindToTimestamp reconstructs terminal state at a specific time.
func (s *StateStore) RewindToTimestamp(targetTime time.Time) (*StateSnapshot, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// Find nearest snapshot in ring buffer
	var nearest *StateSnapshot
	var minDelta time.Duration = time.Hour * 24

	// Calculate valid range in ring buffer
	start := int64(0)
	if s.writeIdx > int64(s.bufferSize) {
		start = s.writeIdx - int64(s.bufferSize)
	}

	for i := start; i < s.writeIdx; i++ {
		idx := i % int64(s.bufferSize)
		snap := &s.buffer[idx]

		if snap.Timestamp.IsZero() {
			continue
		}

		delta := absTimeDelta(snap.Timestamp, targetTime)
		if delta < minDelta {
			minDelta = delta
			nearest = snap
		}
	}

	if nearest == nil {
		// Try loading from disk
		return s.loadFromDisk(targetTime)
	}

	// Return a copy to avoid race conditions
	result := *nearest
	return &result, nil
}

// GetTimeRange returns the available time range in the buffer.
func (s *StateStore) GetTimeRange() (earliest, latest time.Time) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if s.writeIdx == 0 {
		return time.Time{}, time.Time{}
	}

	// Find earliest and latest
	start := int64(0)
	if s.writeIdx > int64(s.bufferSize) {
		start = s.writeIdx - int64(s.bufferSize)
	}

	for i := start; i < s.writeIdx; i++ {
		idx := i % int64(s.bufferSize)
		snap := &s.buffer[idx]
		if snap.Timestamp.IsZero() {
			continue
		}

		if earliest.IsZero() || snap.Timestamp.Before(earliest) {
			earliest = snap.Timestamp
		}
		if latest.IsZero() || snap.Timestamp.After(latest) {
			latest = snap.Timestamp
		}
	}

	return earliest, latest
}

// GetSnapshotCount returns the number of snapshots in the buffer.
func (s *StateStore) GetSnapshotCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if s.writeIdx > int64(s.bufferSize) {
		return s.bufferSize
	}
	return int(s.writeIdx)
}

// GetAllSnapshots returns all snapshots in chronological order.
func (s *StateStore) GetAllSnapshots() []StateSnapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]StateSnapshot, 0, s.bufferSize)

	start := int64(0)
	if s.writeIdx > int64(s.bufferSize) {
		start = s.writeIdx - int64(s.bufferSize)
	}

	for i := start; i < s.writeIdx; i++ {
		idx := i % int64(s.bufferSize)
		snap := s.buffer[idx]
		if !snap.Timestamp.IsZero() {
			result = append(result, snap)
		}
	}

	return result
}

// persistenceLoop runs in background to periodically flush to disk.
func (s *StateStore) persistenceLoop() {
	defer s.wg.Done()

	for {
		select {
		case <-s.stopCh:
			return
		case <-s.flushTicker.C:
			s.flushToDisk()
		}
	}
}

// flushToDisk persists current snapshots to disk.
func (s *StateStore) flushToDisk() {
	s.mu.Lock()
	if !s.dirty {
		s.mu.Unlock()
		return
	}

	snapshots := make([]StateSnapshot, 0)
	start := int64(0)
	if s.writeIdx > int64(s.bufferSize) {
		start = s.writeIdx - int64(s.bufferSize)
	}

	for i := start; i < s.writeIdx; i++ {
		idx := i % int64(s.bufferSize)
		snap := s.buffer[idx]
		if !snap.Timestamp.IsZero() {
			snapshots = append(snapshots, snap)
		}
	}

	s.dirty = false
	s.lastFlush = time.Now()
	s.mu.Unlock()

	if len(snapshots) == 0 {
		return
	}

	// Ensure directory exists
	snapshotDir := filepath.Join(s.amDir, "sessions", s.tabID, "snapshots")
	if err := os.MkdirAll(snapshotDir, 0755); err != nil {
		log.Printf("[StateStore] Failed to create snapshot dir: %v", err)
		return
	}

	// Write to file with timestamp
	filename := filepath.Join(snapshotDir, time.Now().Format("2006-01-02T15-04-05")+".json")
	data, err := json.MarshalIndent(snapshots, "", "  ")
	if err != nil {
		log.Printf("[StateStore] Failed to marshal snapshots: %v", err)
		return
	}

	// Atomic write
	if err := atomicWriteFile(filename, data, 0644); err != nil {
		log.Printf("[StateStore] Failed to write snapshots: %v", err)
		return
	}

	log.Printf("[StateStore] Flushed %d snapshots to disk for tab %s", len(snapshots), s.tabID)
}

// loadFromDisk attempts to load a snapshot from persisted files.
func (s *StateStore) loadFromDisk(targetTime time.Time) (*StateSnapshot, error) {
	snapshotDir := filepath.Join(s.amDir, "sessions", s.tabID, "snapshots")

	entries, err := os.ReadDir(snapshotDir)
	if err != nil {
		return nil, err
	}

	var nearest *StateSnapshot
	var minDelta time.Duration = time.Hour * 24

	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}

		data, err := os.ReadFile(filepath.Join(snapshotDir, entry.Name()))
		if err != nil {
			continue
		}

		var snapshots []StateSnapshot
		if err := json.Unmarshal(data, &snapshots); err != nil {
			continue
		}

		for i := range snapshots {
			snap := &snapshots[i]
			delta := absTimeDelta(snap.Timestamp, targetTime)
			if delta < minDelta {
				minDelta = delta
				nearest = snap
			}
		}
	}

	if nearest == nil {
		return nil, os.ErrNotExist
	}

	return nearest, nil
}

// Helper functions

func computeContentHash(content string) string {
	if len(content) == 0 {
		return ""
	}
	// Use simple FNV-like hash for speed
	hash := uint64(14695981039346656037) // FNV offset basis
	for i := 0; i < len(content); i++ {
		hash ^= uint64(content[i])
		hash *= 1099511628211 // FNV prime
	}
	return fmt.Sprintf("%x", hash)
}

func computeSimpleDiff(old, new string) string {
	// Simple diff: store line changes
	// For now, just indicate if content grew or shrunk
	lenDiff := len(new) - len(old)
	if lenDiff > 0 {
		return "+lines"
	} else if lenDiff < 0 {
		return "-lines"
	}
	return "~modified"
}

func absTimeDelta(t1, t2 time.Time) time.Duration {
	if t1.After(t2) {
		return t1.Sub(t2)
	}
	return t2.Sub(t1)
}

func getAMDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".forge", "am")
}
