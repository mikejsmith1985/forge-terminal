package tutor

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// ignoredDirs are directories skipped during file scanning.
var ignoredDirs = map[string]bool{
	".git":        true,
	"node_modules": true,
	"vendor":      true,
	"__pycache__": true,
	".next":       true,
	"dist":        true,
	"build":       true,
	".vscode":     true,
	".idea":       true,
}

// sourceExtensions are the file extensions tracked by the watcher.
var sourceExtensions = map[string]bool{
	".go":   true,
	".js":   true,
	".jsx":  true,
	".ts":   true,
	".tsx":  true,
	".py":   true,
	".rs":   true,
	".java": true,
	".toml": true,
	".yaml": true,
	".yml":  true,
	".json": true,
	".md":   true,
	".css":  true,
	".scss": true,
	".html": true,
}

const maxFileSize = 500 * 1024 // 500KB

// fileState captures the last known modification time and size for a file.
type fileState struct {
	modTime time.Time
	size    int64
}

// Watcher monitors a project directory for file changes using polling.
type Watcher struct {
	mu          sync.Mutex
	projectPath string
	sessionID   string
	active      bool
	stopCh      chan struct{}
	notifyCh    chan WatcherNotification
	done        chan struct{} // closed when the polling goroutine exits

	// State tracking
	fileStates map[string]fileState // relative path → last known state
	pending    []FileChangeEvent    // accumulated changes in debounce window

	// Configuration
	pollInterval   time.Duration
	debounceWindow time.Duration
}

// NewWatcher creates a new file-change watcher for the given project directory.
func NewWatcher(projectPath string, sessionID string) *Watcher {
	return &Watcher{
		projectPath:    projectPath,
		sessionID:      sessionID,
		stopCh:         make(chan struct{}),
		notifyCh:       make(chan WatcherNotification, 10),
		done:           make(chan struct{}),
		fileStates:     make(map[string]fileState),
		pollInterval:   2 * time.Second,
		debounceWindow: 3 * time.Second,
	}
}

// Start begins watching the project directory for file changes.
// It takes an initial snapshot and then polls for changes in a background goroutine.
func (w *Watcher) Start() error {
	w.mu.Lock()
	if w.active {
		w.mu.Unlock()
		return fmt.Errorf("watcher already active for session %s", w.sessionID)
	}

	// Take initial snapshot before starting the polling loop.
	initial := w.scanFiles()
	w.fileStates = initial
	w.active = true
	w.mu.Unlock()

	log.Printf("[Tutor Watcher] Started for session %s — watching %s (%d files)", w.sessionID, w.projectPath, len(initial))

	go w.pollLoop()
	return nil
}

// Stop signals the watcher to stop and waits for the polling goroutine to exit.
func (w *Watcher) Stop() {
	w.mu.Lock()
	if !w.active {
		w.mu.Unlock()
		return
	}
	w.mu.Unlock()

	close(w.stopCh)
	<-w.done // wait for goroutine to finish

	w.mu.Lock()
	w.active = false
	w.mu.Unlock()

	log.Printf("[Tutor Watcher] Stopped for session %s", w.sessionID)
}

// Notifications returns the read-only channel that receives change notifications.
func (w *Watcher) Notifications() <-chan WatcherNotification {
	return w.notifyCh
}

// IsActive reports whether the watcher is currently running.
func (w *Watcher) IsActive() bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.active
}

// pollLoop is the main goroutine: poll → detect → debounce → notify.
func (w *Watcher) pollLoop() {
	defer close(w.done)
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[Tutor Watcher] Recovered from panic in poll loop: %v", r)
		}
	}()

	pollTicker := time.NewTicker(w.pollInterval)
	defer pollTicker.Stop()

	var debounceTimer *time.Timer
	var debounceCh <-chan time.Time // nil until first change is detected

	for {
		select {
		case <-w.stopCh:
			// Flush any remaining pending events before exiting.
			w.mu.Lock()
			if len(w.pending) > 0 {
				w.flushPending()
			}
			w.mu.Unlock()
			if debounceTimer != nil {
				debounceTimer.Stop()
			}
			return

		case <-pollTicker.C:
			newStates := w.scanFiles()
			w.mu.Lock()
			changes := w.detectChanges(newStates)
			if len(changes) > 0 {
				w.pending = append(w.pending, changes...)
				// Reset (or start) the debounce timer.
				if debounceTimer != nil {
					debounceTimer.Stop()
				}
				debounceTimer = time.NewTimer(w.debounceWindow)
				debounceCh = debounceTimer.C
			}
			w.mu.Unlock()

		case <-debounceCh:
			// Debounce window expired — flush accumulated changes.
			w.mu.Lock()
			if len(w.pending) > 0 {
				w.flushPending()
			}
			w.mu.Unlock()
			debounceCh = nil
			debounceTimer = nil
		}
	}
}

// flushPending sends the accumulated pending events as a single notification.
// Caller must hold w.mu.
func (w *Watcher) flushPending() {
	events := make([]FileChangeEvent, len(w.pending))
	copy(events, w.pending)
	w.pending = w.pending[:0]

	notification := WatcherNotification{
		SessionID: w.sessionID,
		Files:     events,
		Message:   w.buildNotificationMessage(events),
	}

	// Non-blocking send — drop if the consumer is not keeping up.
	select {
	case w.notifyCh <- notification:
		log.Printf("[Tutor Watcher] Sent notification: %s", notification.Message)
	default:
		log.Printf("[Tutor Watcher] Notification channel full, dropping %d events", len(events))
	}
}

// scanFiles walks the project directory and returns current file states
// keyed by path relative to the project root.
func (w *Watcher) scanFiles() map[string]fileState {
	states := make(map[string]fileState)

	_ = filepath.WalkDir(w.projectPath, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil // skip inaccessible paths
		}

		if d.IsDir() {
			if isIgnoredDir(d.Name()) {
				return filepath.SkipDir
			}
			return nil
		}

		if !isSourceFile(d.Name()) {
			return nil
		}

		info, err := d.Info()
		if err != nil {
			return nil
		}
		if info.Size() > maxFileSize {
			return nil
		}

		rel, err := filepath.Rel(w.projectPath, path)
		if err != nil {
			return nil
		}
		// Normalize to forward slashes for consistent keys across platforms.
		rel = filepath.ToSlash(rel)

		states[rel] = fileState{
			modTime: info.ModTime(),
			size:    info.Size(),
		}
		return nil
	})

	return states
}

// detectChanges compares a fresh scan against the stored states and returns
// the resulting change events. It also updates fileStates to match newStates.
// Caller must hold w.mu.
func (w *Watcher) detectChanges(newStates map[string]fileState) []FileChangeEvent {
	now := time.Now()
	var events []FileChangeEvent

	// Detect creates and modifications.
	for path, ns := range newStates {
		if old, exists := w.fileStates[path]; !exists {
			events = append(events, FileChangeEvent{
				Path:      path,
				Operation: "create",
				Timestamp: now,
			})
		} else if ns.modTime != old.modTime || ns.size != old.size {
			events = append(events, FileChangeEvent{
				Path:      path,
				Operation: "modify",
				Timestamp: now,
			})
		}
	}

	// Detect deletions.
	for path := range w.fileStates {
		if _, exists := newStates[path]; !exists {
			events = append(events, FileChangeEvent{
				Path:      path,
				Operation: "delete",
				Timestamp: now,
			})
		}
	}

	// Update stored state to the latest scan.
	w.fileStates = newStates

	return events
}

// buildNotificationMessage produces a human-readable summary of the change events.
func (w *Watcher) buildNotificationMessage(events []FileChangeEvent) string {
	var creates, modifies, deletes int
	for _, e := range events {
		switch e.Operation {
		case "create":
			creates++
		case "modify":
			modifies++
		case "delete":
			deletes++
		}
	}

	var parts []string
	if creates > 0 {
		parts = append(parts, pluralize(creates, "file")+" created")
	}
	if modifies > 0 {
		parts = append(parts, pluralize(modifies, "file")+" modified")
	}
	if deletes > 0 {
		parts = append(parts, pluralize(deletes, "file")+" deleted")
	}

	if len(parts) == 0 {
		return "no file changes detected"
	}

	return strings.Join(parts, ", ") + " \u2014 want a walkthrough?"
}

// isIgnoredDir reports whether a directory name should be skipped during scanning.
func isIgnoredDir(name string) bool {
	return ignoredDirs[name]
}

// isSourceFile reports whether a file name has a trackable source extension.
func isSourceFile(name string) bool {
	ext := strings.ToLower(filepath.Ext(name))
	return sourceExtensions[ext]
}

// pluralize returns "N file" or "N files" as appropriate.
func pluralize(count int, noun string) string {
	if count == 1 {
		return fmt.Sprintf("%d %s", count, noun)
	}
	return fmt.Sprintf("%d %ss", count, noun)
}
