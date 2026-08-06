// session_reclaim_test.go verifies how a reconnecting tab takes back a PTY that
// outlived its previous WebSocket connection.
//
// This is the guarantee behind "my terminal came back frozen this morning": when
// the last client disconnects, the PTY is kept alive and its reader goroutine is
// orphaned. Whoever reconnects MUST be told to take ownership so it can start a
// replacement reader — if it is treated as a passive watcher instead, the orphan
// reader is stopped and nobody ever reads the terminal again. The tab then looks
// connected, still accepts keystrokes, and silently shows nothing forever.
package terminal

import (
	"sync"
	"testing"
	"time"
)

// TestReclaimDetachedSession_TakesOwnershipAndStopsOrphanReader is the core
// regression test: reclaiming must report ownership to the caller AND stop the
// previous owner's reader, so exactly one goroutine reads the PTY afterwards.
func TestReclaimDetachedSession_TakesOwnershipAndStopsOrphanReader(t *testing.T) {
	handler := newHandlerForTest()
	session := newTestSession("reclaim-1")
	orphanReaderDone := make(chan struct{})

	handler.detachSession("reclaim-1", session, 5*time.Second, orphanReaderDone)

	detachedFor, wasReclaimed := handler.reclaimDetachedSession("reclaim-1")
	if !wasReclaimed {
		t.Fatal("reconnecting client must be told to take PTY ownership; " +
			"joining as a watcher leaves nobody reading the terminal")
	}
	if detachedFor < 0 {
		t.Fatalf("detached duration must be non-negative, got %v", detachedFor)
	}

	select {
	case <-orphanReaderDone:
		// Correct: the previous owner's reader was told to exit.
	default:
		t.Fatal("expected the orphaned PTY reader to be stopped on reclaim")
	}

	if _, isStillDetached := handler.detachedSessions.Load("reclaim-1"); isStillDetached {
		t.Fatal("expected the session to leave detachedSessions once reclaimed")
	}
}

// TestReclaimDetachedSession_ReturnsFalseWhenSessionWasNeverDetached proves the
// opposite case is preserved: when another connection is still reading the PTY
// there is no detach record, the joiner stays a watcher, and the live reader is
// left untouched.
func TestReclaimDetachedSession_ReturnsFalseWhenSessionWasNeverDetached(t *testing.T) {
	handler := newHandlerForTest()
	handler.sessions.Store("reclaim-2", newTestSession("reclaim-2"))

	if _, wasReclaimed := handler.reclaimDetachedSession("reclaim-2"); wasReclaimed {
		t.Fatal("a live, never-detached session must not be reclaimed — " +
			"its existing reader would be stopped and never replaced")
	}
}

// TestReclaimDetachedSession_OnlyOneConcurrentClientTakesOwnership guards the
// race where two tabs reconnect at once. Exactly one may own the PTY; a second
// owner would start a second reader and split the output stream between them.
func TestReclaimDetachedSession_OnlyOneConcurrentClientTakesOwnership(t *testing.T) {
	handler := newHandlerForTest()
	session := newTestSession("reclaim-3")
	handler.detachSession("reclaim-3", session, 5*time.Second, make(chan struct{}))

	const racingClientCount = 8
	var ownershipCount int64
	var countMutex sync.Mutex
	var startLine, allFinished sync.WaitGroup

	startLine.Add(1)
	for i := 0; i < racingClientCount; i++ {
		allFinished.Add(1)
		go func() {
			defer allFinished.Done()
			startLine.Wait()
			if _, wasReclaimed := handler.reclaimDetachedSession("reclaim-3"); wasReclaimed {
				countMutex.Lock()
				ownershipCount++
				countMutex.Unlock()
			}
		}()
	}
	startLine.Done()
	allFinished.Wait()

	if ownershipCount != 1 {
		t.Fatalf("exactly one reconnecting client may own the PTY, got %d owners", ownershipCount)
	}
}

// TestReclaimDetachedSession_StopsGraceTimerSoSessionSurvives proves reclaiming
// cancels the reaper. Without this the PTY is destroyed mid-session a few
// minutes after the user has already reconnected.
func TestReclaimDetachedSession_StopsGraceTimerSoSessionSurvives(t *testing.T) {
	handler := newHandlerForTest()
	session := newTestSession("reclaim-4")
	handler.hubs.Store("reclaim-4", newSessionHub())
	handler.sessions.Store("reclaim-4", session)

	const shortGrace = 150 * time.Millisecond
	handler.detachSession("reclaim-4", session, shortGrace, make(chan struct{}))

	if _, wasReclaimed := handler.reclaimDetachedSession("reclaim-4"); !wasReclaimed {
		t.Fatal("expected reclaim to succeed inside the grace window")
	}

	time.Sleep(shortGrace * 3)

	if _, isSessionAlive := handler.sessions.Load("reclaim-4"); !isSessionAlive {
		t.Fatal("session was reaped after reclaim — the grace timer was not stopped")
	}
	if _, isHubAlive := handler.hubs.Load("reclaim-4"); !isHubAlive {
		t.Fatal("hub was reaped after reclaim — the grace timer was not stopped")
	}
}
