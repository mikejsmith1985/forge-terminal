package am

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

// =============================================================================
// SessionCaptureIntegration Tests
// =============================================================================

func TestSessionCaptureIntegration(t *testing.T) {
	t.Run("NewSessionCapture creates integrated capturer", func(t *testing.T) {
		tmpDir, err := os.MkdirTemp("", "session-capture-*")
		if err != nil {
			t.Fatalf("Failed to create temp dir: %v", err)
		}
		defer os.RemoveAll(tmpDir)

		amDir := filepath.Join(tmpDir, "am")
		capture := NewSessionCapture(amDir, "tab-123", "/test/project")

		if capture == nil {
			t.Fatal("NewSessionCapture should return non-nil")
		}
		if capture.Session() == nil {
			t.Error("Session should be created")
		}
	})

	t.Run("FeedOutput adds to periodic capture", func(t *testing.T) {
		tmpDir, err := os.MkdirTemp("", "session-capture-feed-*")
		if err != nil {
			t.Fatalf("Failed to create temp dir: %v", err)
		}
		defer os.RemoveAll(tmpDir)

		amDir := filepath.Join(tmpDir, "am")
		capture := NewSessionCapture(amDir, "tab-feed", "/test/project")

		capture.FeedOutput([]byte("test output from PTY"))

		if capture.BufferLen() == 0 {
			t.Error("Buffer should have data after FeedOutput")
		}
	})

	t.Run("FeedInput adds user turn to session", func(t *testing.T) {
		tmpDir, err := os.MkdirTemp("", "session-capture-input-*")
		if err != nil {
			t.Fatalf("Failed to create temp dir: %v", err)
		}
		defer os.RemoveAll(tmpDir)

		amDir := filepath.Join(tmpDir, "am")
		capture := NewSessionCapture(amDir, "tab-input", "/test/project")

		// Simulate user pressing Enter after typing
		capture.FeedInput([]byte("What is 2+2?\r"))

		session := capture.Session()
		// Check that input was processed
		if len(session.Turns) == 0 {
			// Input might be buffered, flush it
			capture.FlushInput()
		}

		if len(session.Turns) == 0 {
			t.Error("Session should have user turn after Enter")
		}
	})

	t.Run("PeriodicFlush saves to session", func(t *testing.T) {
		tmpDir, err := os.MkdirTemp("", "session-capture-flush-*")
		if err != nil {
			t.Fatalf("Failed to create temp dir: %v", err)
		}
		defer os.RemoveAll(tmpDir)

		amDir := filepath.Join(tmpDir, "am")
		capture := NewSessionCapture(amDir, "tab-flush", "/test/project")

		capture.FeedOutput([]byte("periodic output data"))
		capture.PeriodicFlush()

		session := capture.Session()
		if len(session.RawCaptures) == 0 {
			t.Error("Session should have raw captures after flush")
		}
	})

	t.Run("End finalizes and saves session", func(t *testing.T) {
		tmpDir, err := os.MkdirTemp("", "session-capture-end-*")
		if err != nil {
			t.Fatalf("Failed to create temp dir: %v", err)
		}
		defer os.RemoveAll(tmpDir)

		amDir := filepath.Join(tmpDir, "am")
		capture := NewSessionCapture(amDir, "tab-end", "/test/project")

		capture.FeedOutput([]byte("some output"))
		err = capture.End()

		if err != nil {
			t.Fatalf("End should not error: %v", err)
		}

		session := capture.Session()
		if session.Status != StatusComplete {
			t.Errorf("Session should be complete, got %s", session.Status)
		}
		if session.EndTime == nil {
			t.Error("Session EndTime should be set")
		}
	})

	t.Run("SetProvider updates session provider", func(t *testing.T) {
		tmpDir, err := os.MkdirTemp("", "session-capture-provider-*")
		if err != nil {
			t.Fatalf("Failed to create temp dir: %v", err)
		}
		defer os.RemoveAll(tmpDir)

		amDir := filepath.Join(tmpDir, "am")
		capture := NewSessionCapture(amDir, "tab-provider", "/test/project")

		capture.SetProvider("github-copilot")

		session := capture.Session()
		if session.Provider != "github-copilot" {
			t.Errorf("Expected provider 'github-copilot', got '%s'", session.Provider)
		}
	})
}

// =============================================================================
// PeriodicFlushTicker Tests
// =============================================================================

func TestPeriodicFlushTicker(t *testing.T) {
	t.Run("Ticker triggers periodic flushes", func(t *testing.T) {
		tmpDir, err := os.MkdirTemp("", "session-ticker-*")
		if err != nil {
			t.Fatalf("Failed to create temp dir: %v", err)
		}
		defer os.RemoveAll(tmpDir)

		amDir := filepath.Join(tmpDir, "am")
		capture := NewSessionCapture(amDir, "tab-ticker", "/test/project")

		// Use short interval for test
		config := CaptureConfig{
			Interval:      100 * time.Millisecond,
			MaxBufferSize: 1024,
		}

		// Start ticker
		stop := capture.StartPeriodicFlush(config.Interval)
		defer stop()

		// Feed data
		capture.FeedOutput([]byte("ticker test data"))

		// Wait for at least one flush cycle
		time.Sleep(250 * time.Millisecond)

		session := capture.Session()
		if len(session.RawCaptures) == 0 {
			t.Error("Ticker should have triggered at least one flush")
		}
	})

	t.Run("Stop function stops ticker", func(t *testing.T) {
		tmpDir, err := os.MkdirTemp("", "session-ticker-stop-*")
		if err != nil {
			t.Fatalf("Failed to create temp dir: %v", err)
		}
		defer os.RemoveAll(tmpDir)

		amDir := filepath.Join(tmpDir, "am")
		capture := NewSessionCapture(amDir, "tab-stop", "/test/project")

		stop := capture.StartPeriodicFlush(50 * time.Millisecond)

		// Feed initial data
		capture.FeedOutput([]byte("initial"))
		time.Sleep(100 * time.Millisecond)

		// Stop the ticker
		stop()

		// Get current capture count
		session := capture.Session()
		initialCount := len(session.RawCaptures)

		// Feed more data and wait
		capture.FeedOutput([]byte("after stop"))
		time.Sleep(150 * time.Millisecond)

		// Count should not have increased (ticker stopped)
		finalCount := len(session.RawCaptures)
		if finalCount > initialCount+1 {
			t.Errorf("Ticker should have stopped, but captures increased from %d to %d", initialCount, finalCount)
		}
	})
}

// =============================================================================
// Global Session Registry Tests
// =============================================================================

func TestGlobalSessionRegistry(t *testing.T) {
	// Reset registry before tests
	ResetSessionRegistry()

	t.Run("RegisterSession adds to registry", func(t *testing.T) {
		tmpDir, err := os.MkdirTemp("", "session-registry-*")
		if err != nil {
			t.Fatalf("Failed to create temp dir: %v", err)
		}
		defer os.RemoveAll(tmpDir)

		amDir := filepath.Join(tmpDir, "am")
		capture := NewSessionCapture(amDir, "tab-reg", "/test/project")

		RegisterSession("tab-reg", capture)

		retrieved := GetSessionCapture("tab-reg")
		if retrieved == nil {
			t.Error("Should retrieve registered session")
		}
		if retrieved.Session().TabID != "tab-reg" {
			t.Error("Retrieved session should match")
		}
	})

	t.Run("UnregisterSession removes from registry", func(t *testing.T) {
		tmpDir, err := os.MkdirTemp("", "session-unreg-*")
		if err != nil {
			t.Fatalf("Failed to create temp dir: %v", err)
		}
		defer os.RemoveAll(tmpDir)

		amDir := filepath.Join(tmpDir, "am")
		capture := NewSessionCapture(amDir, "tab-unreg", "/test/project")

		RegisterSession("tab-unreg", capture)
		UnregisterSession("tab-unreg")

		retrieved := GetSessionCapture("tab-unreg")
		if retrieved != nil {
			t.Error("Session should be unregistered")
		}
	})

	t.Run("GetAllActiveSessions returns all registered", func(t *testing.T) {
		ResetSessionRegistry()

		tmpDir, err := os.MkdirTemp("", "session-all-*")
		if err != nil {
			t.Fatalf("Failed to create temp dir: %v", err)
		}
		defer os.RemoveAll(tmpDir)

		amDir := filepath.Join(tmpDir, "am")

		capture1 := NewSessionCapture(amDir, "tab-all-1", "/project1")
		capture2 := NewSessionCapture(amDir, "tab-all-2", "/project2")

		RegisterSession("tab-all-1", capture1)
		RegisterSession("tab-all-2", capture2)

		all := GetAllActiveSessions()
		if len(all) != 2 {
			t.Errorf("Expected 2 active sessions, got %d", len(all))
		}
	})
}
