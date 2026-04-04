package terminal

import (
	"testing"
	"time"
)

// newTestSession creates a TerminalSession with enough initialized fields to
// safely call IsDone(), IsClosed(), and Close() without a real PTY.
func newTestSession(id string) *TerminalSession {
	return &TerminalSession{
		ID:       id,
		doneChan: make(chan struct{}),
	}
}

// newHandlerForTest creates a Handler without the WebSocket upgrader or
// optional dependencies — just enough for detach/reattach testing.
func newHandlerForTest() *Handler {
	return &Handler{}
}

func TestDetachSession_StoresInDetachedMap(t *testing.T) {
	h := newHandlerForTest()
	session := newTestSession("test-1")
	readerDone := make(chan struct{})

	h.detachSession("test-1", session, 5*time.Second, readerDone)

	if _, ok := h.detachedSessions.Load("test-1"); !ok {
		t.Fatal("expected session to be stored in detachedSessions after detach")
	}
}

func TestReattachSession_RecoversDetachedSession(t *testing.T) {
	h := newHandlerForTest()
	session := newTestSession("test-2")
	readerDone := make(chan struct{})

	h.detachSession("test-2", session, 5*time.Second, readerDone)

	ds, ok := h.reattachSession("test-2")
	if !ok || ds == nil {
		t.Fatal("expected reattachSession to find the detached session")
	}
	if ds.session != session {
		t.Fatal("expected reattached session to be the same TerminalSession")
	}

	// readerDone should be closed after reattach to stop the orphaned reader
	select {
	case <-readerDone:
		// closed — correct
	default:
		t.Fatal("expected readerDone to be closed after reattach")
	}

	// Session should no longer be in the detached map
	if _, ok := h.detachedSessions.Load("test-2"); ok {
		t.Fatal("expected session to be removed from detachedSessions after reattach")
	}
}

func TestReattachSession_NotFound(t *testing.T) {
	h := newHandlerForTest()
	_, ok := h.reattachSession("nonexistent")
	if ok {
		t.Fatal("expected reattachSession to return false for nonexistent session")
	}
}

func TestDetachSession_HubAndSessionSurviveDuringGrace(t *testing.T) {
	h := newHandlerForTest()
	session := newTestSession("test-3")
	hub := newSessionHub()
	readerDone := make(chan struct{})

	// Pre-populate hub and session in the maps (simulates normal disconnect flow)
	h.hubs.Store("test-3", hub)
	h.sessions.Store("test-3", session)

	h.detachSession("test-3", session, 5*time.Second, readerDone)

	// During grace period, hub and session MUST still be in the maps.
	// This is the critical fix: reconnecting clients need to find the existing
	// hub with its populated ring buffer instead of creating a new empty one.
	if _, ok := h.hubs.Load("test-3"); !ok {
		t.Fatal("hub must remain in map during grace period")
	}
	if _, ok := h.sessions.Load("test-3"); !ok {
		t.Fatal("session must remain in map during grace period")
	}
}

func TestDetachSession_GraceExpiryCleansMaps(t *testing.T) {
	h := newHandlerForTest()
	session := newTestSession("test-4")
	hub := newSessionHub()
	readerDone := make(chan struct{})

	h.hubs.Store("test-4", hub)
	h.sessions.Store("test-4", session)

	// Use a very short grace period so the timer fires quickly
	h.detachSession("test-4", session, 100*time.Millisecond, readerDone)

	// Wait for grace to expire
	time.Sleep(300 * time.Millisecond)

	// After grace expiry, everything should be cleaned up
	if _, ok := h.hubs.Load("test-4"); ok {
		t.Fatal("hub should be removed from map after grace expiry")
	}
	if _, ok := h.sessions.Load("test-4"); ok {
		t.Fatal("session should be removed from map after grace expiry")
	}
	if _, ok := h.detachedSessions.Load("test-4"); ok {
		t.Fatal("detached session should be removed after grace expiry")
	}

	// readerDone should be closed
	select {
	case <-readerDone:
		// closed — correct
	default:
		t.Fatal("expected readerDone to be closed after grace expiry")
	}
}

func TestReattachSession_StopsGraceTimer(t *testing.T) {
	h := newHandlerForTest()
	session := newTestSession("test-5")
	hub := newSessionHub()
	readerDone := make(chan struct{})

	h.hubs.Store("test-5", hub)
	h.sessions.Store("test-5", session)

	// Grace period of 200ms
	h.detachSession("test-5", session, 200*time.Millisecond, readerDone)

	// Reattach before grace expires
	ds, ok := h.reattachSession("test-5")
	if !ok {
		t.Fatal("expected reattach to succeed")
	}
	_ = ds

	// Wait past what would have been the grace expiry
	time.Sleep(400 * time.Millisecond)

	// Hub and session should STILL be in maps (timer was stopped by reattach)
	if _, ok := h.hubs.Load("test-5"); !ok {
		t.Fatal("hub must remain in map after successful reattach — grace timer should have been stopped")
	}
	if _, ok := h.sessions.Load("test-5"); !ok {
		t.Fatal("session must remain in map after successful reattach")
	}
}
