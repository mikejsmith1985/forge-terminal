// Package diagnostic provides system diagnostic services for Forge Terminal.
//
// This package provides:
// - AM system health verification with actual file output checks
// - Session persistence to ~/.forge/diagnostics/
// - Real-time diagnostic event WebSocket emission
// - Platform detection for WSL/Windows debugging
package diagnostic

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"time"
)

// DiagnosticEvent represents a single diagnostic event.
type DiagnosticEvent struct {
	Type       string                 `json:"type"`
	Subtype    string                 `json:"subtype"`
	Timestamp  int64                  `json:"timestamp"`
	RelativeMs int64                  `json:"relativeMs"`
	GapMs      int64                  `json:"gapMs"`
	Data       map[string]interface{} `json:"data"`
	PlainText  string                 `json:"plainText"`
}

// AMStatus represents the current AM system status.
type AMStatus struct {
	IsHealthy           bool      `json:"isHealthy"`
	LastFileWrite       time.Time `json:"lastFileWrite,omitempty"`
	LastFileWritePath   string    `json:"lastFileWritePath,omitempty"`
	ActiveConversations int       `json:"activeConversations"`
	TotalFiles          int       `json:"totalFiles"`
	FileWriteVerified   bool      `json:"fileWriteVerified"`
	AMDirectory         string    `json:"amDirectory"`
	DirectoryExists     bool      `json:"directoryExists"`
	DirectoryWritable   bool      `json:"directoryWritable"`
}

// PlatformInfo represents platform detection information.
type PlatformInfo struct {
	OS           string `json:"os"`
	Arch         string `json:"arch"`
	IsWSL        bool   `json:"isWSL"`
	HomeDir      string `json:"homeDir"`
	ForgeDataDir string `json:"forgeDataDir"`
}

// DiagnosticSession represents a diagnostic recording session.
type DiagnosticSession struct {
	SessionID   string            `json:"sessionId"`
	StartTime   time.Time         `json:"startTime"`
	Platform    PlatformInfo      `json:"platform"`
	Events      []DiagnosticEvent `json:"events"`
	AMStatus    *AMStatus         `json:"amStatus,omitempty"`
	TotalEvents int               `json:"totalEvents"`
}

// Service provides diagnostic functionality.
type Service struct {
	mu              sync.RWMutex
	sessionID       string
	startTime       time.Time
	events          []DiagnosticEvent
	maxEvents       int
	lastEventTime   time.Time
	amDir           string
	diagnosticsDir  string
	subscribers     []chan DiagnosticEvent
	subscriberMutex sync.RWMutex
}

// NewService creates a new diagnostic service.
func NewService() *Service {
	homeDir, _ := os.UserHomeDir()
	forgeDir := filepath.Join(homeDir, ".forge")
	
	s := &Service{
		sessionID:      generateSessionID(),
		startTime:      time.Now(),
		events:         make([]DiagnosticEvent, 0, 500),
		maxEvents:      500,
		lastEventTime:  time.Now(),
		amDir:          filepath.Join(forgeDir, "am"),
		diagnosticsDir: filepath.Join(forgeDir, "diagnostics"),
		subscribers:    make([]chan DiagnosticEvent, 0),
	}

	// Ensure diagnostics directory exists
	if err := os.MkdirAll(s.diagnosticsDir, 0755); err != nil {
		log.Printf("[Diagnostic] Failed to create diagnostics dir: %v", err)
	}

	log.Printf("[Diagnostic] Service initialized - session: %s", s.sessionID)
	return s
}

// RecordEvent records a diagnostic event.
func (s *Service) RecordEvent(eventType, subtype string, data map[string]interface{}, plainText string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	gapMs := now.Sub(s.lastEventTime).Milliseconds()
	s.lastEventTime = now

	event := DiagnosticEvent{
		Type:       eventType,
		Subtype:    subtype,
		Timestamp:  now.UnixMilli(),
		RelativeMs: now.Sub(s.startTime).Milliseconds(),
		GapMs:      gapMs,
		Data:       data,
		PlainText:  plainText,
	}

	// Add to circular buffer
	if len(s.events) >= s.maxEvents {
		// Remove oldest event
		s.events = s.events[1:]
	}
	s.events = append(s.events, event)

	// Notify subscribers
	s.notifySubscribers(event)
}

// notifySubscribers sends event to all subscribers.
func (s *Service) notifySubscribers(event DiagnosticEvent) {
	s.subscriberMutex.RLock()
	defer s.subscriberMutex.RUnlock()

	for _, ch := range s.subscribers {
		select {
		case ch <- event:
		default:
			// Channel full, skip
		}
	}
}

// Subscribe returns a channel that receives diagnostic events.
func (s *Service) Subscribe() chan DiagnosticEvent {
	s.subscriberMutex.Lock()
	defer s.subscriberMutex.Unlock()

	ch := make(chan DiagnosticEvent, 100)
	s.subscribers = append(s.subscribers, ch)
	return ch
}

// Unsubscribe removes a subscriber channel.
func (s *Service) Unsubscribe(ch chan DiagnosticEvent) {
	s.subscriberMutex.Lock()
	defer s.subscriberMutex.Unlock()

	for i, sub := range s.subscribers {
		if sub == ch {
			s.subscribers = append(s.subscribers[:i], s.subscribers[i+1:]...)
			close(ch)
			break
		}
	}
}

// GetAMStatus returns the current AM system status with actual file verification.
func (s *Service) GetAMStatus() *AMStatus {
	status := &AMStatus{
		AMDirectory: s.amDir,
	}

	// Check if directory exists
	if info, err := os.Stat(s.amDir); err == nil && info.IsDir() {
		status.DirectoryExists = true

		// Check if directory is writable
		testFile := filepath.Join(s.amDir, ".diagnostic-test")
		if err := os.WriteFile(testFile, []byte("test"), 0644); err == nil {
			os.Remove(testFile)
			status.DirectoryWritable = true
		}

		// Find most recent file and count total
		var mostRecentFile string
		var mostRecentTime time.Time

		entries, err := os.ReadDir(s.amDir)
		if err == nil {
			for _, entry := range entries {
				if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
					continue
				}
				status.TotalFiles++

				info, err := entry.Info()
				if err == nil && info.ModTime().After(mostRecentTime) {
					mostRecentTime = info.ModTime()
					mostRecentFile = entry.Name()
				}
			}
		}

		if mostRecentFile != "" {
			status.LastFileWritePath = mostRecentFile
			status.LastFileWrite = mostRecentTime

			// Verify the file is actually readable
			fullPath := filepath.Join(s.amDir, mostRecentFile)
			if _, err := os.ReadFile(fullPath); err == nil {
				status.FileWriteVerified = true
			}
		}
	}

	// Determine overall health
	status.IsHealthy = status.DirectoryExists && 
		status.DirectoryWritable && 
		(status.TotalFiles > 0 || time.Since(s.startTime) < 5*time.Minute)

	return status
}

// GetPlatformInfo returns platform detection information.
func (s *Service) GetPlatformInfo() PlatformInfo {
	homeDir, _ := os.UserHomeDir()

	info := PlatformInfo{
		OS:           runtime.GOOS,
		Arch:         runtime.GOARCH,
		HomeDir:      homeDir,
		ForgeDataDir: filepath.Join(homeDir, ".forge"),
	}

	// Detect WSL
	if runtime.GOOS == "linux" {
		// Check for WSL-specific indicators
		if _, err := os.Stat("/proc/version"); err == nil {
			data, _ := os.ReadFile("/proc/version")
			if contains(string(data), "Microsoft") || contains(string(data), "WSL") {
				info.IsWSL = true
			}
		}
		// Also check for WSL interop
		if _, err := os.Stat("/proc/sys/fs/binfmt_misc/WSLInterop"); err == nil {
			info.IsWSL = true
		}
	}

	return info
}

// ExportSession exports the current session to a JSON file.
func (s *Service) ExportSession() (string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	session := DiagnosticSession{
		SessionID:   s.sessionID,
		StartTime:   s.startTime,
		Platform:    s.GetPlatformInfo(),
		Events:      s.events,
		AMStatus:    s.GetAMStatus(),
		TotalEvents: len(s.events),
	}

	filename := fmt.Sprintf("session-%s.json", time.Now().Format("2006-01-02-150405"))
	fullPath := filepath.Join(s.diagnosticsDir, filename)

	data, err := json.MarshalIndent(session, "", "  ")
	if err != nil {
		return "", fmt.Errorf("marshal session: %w", err)
	}

	if err := os.WriteFile(fullPath, data, 0644); err != nil {
		return "", fmt.Errorf("write session file: %w", err)
	}

	log.Printf("[Diagnostic] Session exported to: %s", fullPath)
	return fullPath, nil
}

// GetEvents returns recent events.
func (s *Service) GetEvents(count int) []DiagnosticEvent {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if count <= 0 || count > len(s.events) {
		count = len(s.events)
	}

	start := len(s.events) - count
	if start < 0 {
		start = 0
	}

	result := make([]DiagnosticEvent, count)
	copy(result, s.events[start:])
	return result
}

// Reset clears all events and starts a new session.
func (s *Service) Reset() {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.sessionID = generateSessionID()
	s.startTime = time.Now()
	s.events = make([]DiagnosticEvent, 0, s.maxEvents)
	s.lastEventTime = s.startTime

	log.Printf("[Diagnostic] Session reset - new session: %s", s.sessionID)
}

// Helper functions

func generateSessionID() string {
	return fmt.Sprintf("diag-%d-%s", time.Now().Unix(), randomString(6))
}

func randomString(n int) string {
	const letters = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = letters[time.Now().UnixNano()%int64(len(letters))]
		time.Sleep(time.Nanosecond)
	}
	return string(b)
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(substr) == 0 ||
		(len(s) > 0 && len(substr) > 0 && findIndex(s, substr) >= 0))
}

func findIndex(s, substr string) int {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}

// Global service instance
var globalService *Service
var once sync.Once

// GetService returns the global diagnostic service instance.
func GetService() *Service {
	once.Do(func() {
		globalService = NewService()
	})
	return globalService
}
