// Package am provides session capture integration for terminal sessions.
package am

import (
	"log"
	"strings"
	"sync"
	"time"
)

// =============================================================================
// SessionCapture - Integration layer for terminal sessions
// =============================================================================

// SessionCapture integrates SessionManager and PeriodicCapture for a terminal session
type SessionCapture struct {
	session   *Session
	manager   *SessionManager
	capturer  *PeriodicCapture
	tabID     string
	amDir     string
	inputBuf  strings.Builder
	mu        sync.Mutex
	stopChan  chan struct{}
	stopped   bool
}

// NewSessionCapture creates a new integrated session capturer
func NewSessionCapture(amDir string, tabID string, workingDir string) *SessionCapture {
	// Resolve project context
	projectCtx := ResolveProjectContext(workingDir)

	// Create session manager
	manager := NewSessionManager(amDir)

	// Start session
	session := manager.StartSession(tabID, &projectCtx)

	// Create periodic capturer
	config := DefaultCaptureConfig()
	capturer := NewPeriodicCapture(session, config)

	sc := &SessionCapture{
		session:  session,
		manager:  manager,
		capturer: capturer,
		tabID:    tabID,
		amDir:    amDir,
		stopChan: make(chan struct{}),
	}

	log.Printf("[SessionCapture] Created for tab %s (project: %s)", tabID, projectCtx.Name)
	return sc
}

// Session returns the underlying session
func (sc *SessionCapture) Session() *Session {
	return sc.session
}

// TabID returns the tab ID
func (sc *SessionCapture) TabID() string {
	return sc.tabID
}

// =============================================================================
// PTY Data Feeding
// =============================================================================

// FeedOutput adds PTY output to the periodic capture buffer
func (sc *SessionCapture) FeedOutput(data []byte) {
	sc.capturer.Feed(data)
}

// FeedInput processes user input (keyboard data)
func (sc *SessionCapture) FeedInput(data []byte) {
	sc.mu.Lock()
	defer sc.mu.Unlock()

	sc.inputBuf.Write(data)

	// Check for Enter key (newline/carriage return)
	if strings.Contains(string(data), "\r") || strings.Contains(string(data), "\n") {
		sc.flushInputLocked()
	}
}

// flushInputLocked flushes accumulated input as a user turn
// Must be called with lock held
func (sc *SessionCapture) flushInputLocked() {
	input := sc.inputBuf.String()
	sc.inputBuf.Reset()

	if input == "" {
		return
	}

	// Clean the input
	cleaned := CleanUserInput(input)
	if cleaned == "" {
		return
	}

	// Add turn to session
	sc.session.mu.Lock()
	sc.session.Turns = append(sc.session.Turns, ConversationTurn{
		Role:          "user",
		Content:       cleaned,
		Timestamp:     time.Now(),
		CaptureMethod: "pty_input",
	})
	sc.session.mu.Unlock()

	log.Printf("[SessionCapture] User input captured: '%s'", truncateForLog(cleaned, 50))
}

// FlushInput forces flush of accumulated input
func (sc *SessionCapture) FlushInput() {
	sc.mu.Lock()
	defer sc.mu.Unlock()
	sc.flushInputLocked()
}

// BufferLen returns the current output buffer length
func (sc *SessionCapture) BufferLen() int {
	return sc.capturer.BufferLen()
}

// =============================================================================
// Periodic Flush Control
// =============================================================================

// PeriodicFlush triggers a manual flush of the capture buffer
func (sc *SessionCapture) PeriodicFlush() {
	sc.capturer.FlushToSession()
}

// StartPeriodicFlush starts a background goroutine that periodically flushes
// Returns a stop function to cancel the ticker
func (sc *SessionCapture) StartPeriodicFlush(interval time.Duration) func() {
	ticker := time.NewTicker(interval)

	go func() {
		for {
			select {
			case <-ticker.C:
				sc.capturer.FlushToSession()
			case <-sc.stopChan:
				ticker.Stop()
				return
			}
		}
	}()

	return func() {
		sc.mu.Lock()
		defer sc.mu.Unlock()
		if !sc.stopped {
			sc.stopped = true
			close(sc.stopChan)
		}
	}
}

// =============================================================================
// Session Lifecycle
// =============================================================================

// SetProvider sets the LLM provider for the session
func (sc *SessionCapture) SetProvider(provider string) {
	sc.session.mu.Lock()
	sc.session.Provider = provider
	sc.session.mu.Unlock()
}

// End finalizes the session
func (sc *SessionCapture) End() error {
	sc.mu.Lock()
	if !sc.stopped && sc.stopChan != nil {
		sc.stopped = true
		close(sc.stopChan)
	}
	sc.mu.Unlock()

	// Flush any remaining input
	sc.FlushInput()

	// Flush any remaining output
	sc.capturer.FlushToSession()

	// End session
	err := sc.manager.EndSession(sc.tabID)
	if err != nil {
		log.Printf("[SessionCapture] Error ending session: %v", err)
		return err
	}

	log.Printf("[SessionCapture] Session ended for tab %s", sc.tabID)
	return nil
}

// =============================================================================
// Global Session Registry
// =============================================================================

var (
	sessionRegistry   = make(map[string]*SessionCapture)
	sessionRegistryMu sync.RWMutex
)

// RegisterSession adds a session capture to the global registry
func RegisterSession(tabID string, capture *SessionCapture) {
	sessionRegistryMu.Lock()
	defer sessionRegistryMu.Unlock()
	sessionRegistry[tabID] = capture
	log.Printf("[SessionRegistry] Registered session for tab %s", tabID)
}

// UnregisterSession removes a session from the registry
func UnregisterSession(tabID string) {
	sessionRegistryMu.Lock()
	defer sessionRegistryMu.Unlock()
	delete(sessionRegistry, tabID)
	log.Printf("[SessionRegistry] Unregistered session for tab %s", tabID)
}

// GetSessionCapture retrieves a session capture by tab ID
func GetSessionCapture(tabID string) *SessionCapture {
	sessionRegistryMu.RLock()
	defer sessionRegistryMu.RUnlock()
	return sessionRegistry[tabID]
}

// GetAllActiveSessions returns all active session captures
func GetAllActiveSessions() []*SessionCapture {
	sessionRegistryMu.RLock()
	defer sessionRegistryMu.RUnlock()

	result := make([]*SessionCapture, 0, len(sessionRegistry))
	for _, capture := range sessionRegistry {
		result = append(result, capture)
	}
	return result
}

// ResetSessionRegistry clears all registered sessions (for testing)
func ResetSessionRegistry() {
	sessionRegistryMu.Lock()
	defer sessionRegistryMu.Unlock()
	sessionRegistry = make(map[string]*SessionCapture)
}
