// session_retention_test.go pins the rule that a terminal session belongs to the
// user, not to a timer: an unattended shell survives until the user closes its
// tab, and closing the tab reclaims it immediately.
//
// The old behaviour destroyed a detached PTY five minutes after the WebSocket
// dropped, so an overnight disconnect (laptop asleep, Wi-Fi gone, browser tab
// throttled) silently killed every running shell before the user came back.
package terminal

import (
	"testing"
	"time"
)

// aFullNightAway is the shortest gap the retention must comfortably survive —
// leaving in the evening and returning the next morning.
const aFullNightAway = 12 * time.Hour

// TestUnattendedRetention_SurvivesAFullNightAway is the requirement test: no
// client type may have its shell reaped just for being away overnight.
func TestUnattendedRetention_SurvivesAFullNightAway(t *testing.T) {
	if sessionGracePeriod < aFullNightAway {
		t.Errorf("desktop retention is %v — a session left overnight would be destroyed before the user returns (need >= %v)",
			sessionGracePeriod, aFullNightAway)
	}
	if mobileGracePeriod < aFullNightAway {
		t.Errorf("mobile retention is %v — need >= %v", mobileGracePeriod, aFullNightAway)
	}
}

// TestGracePeriodForClient_NeverReturnsAShortWindow guards the lookup itself, so
// a future client category cannot quietly reintroduce a minutes-long timeout.
func TestGracePeriodForClient_NeverReturnsAShortWindow(t *testing.T) {
	userAgents := []string{
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
		"Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
		"",
	}
	for _, userAgent := range userAgents {
		if retention := GracePeriodForClient(userAgent); retention < aFullNightAway {
			t.Errorf("GracePeriodForClient(%q) = %v, want >= %v", userAgent, retention, aFullNightAway)
		}
	}
}

// TestCloseSessionNow_ReapsALiveSession proves the user's own close still frees
// the shell immediately — the long retention must not leak abandoned processes.
func TestCloseSessionNow_ReapsALiveSession(t *testing.T) {
	handler := newHandlerForTest()
	handler.sessions.Store("retention-1", newTestSession("retention-1"))
	handler.hubs.Store("retention-1", newSessionHub())

	if wasClosed := handler.CloseSessionNow("retention-1"); !wasClosed {
		t.Fatal("expected an explicit close to report that it closed a session")
	}
	if _, isStillLive := handler.sessions.Load("retention-1"); isStillLive {
		t.Fatal("session must be gone from the live map after an explicit close")
	}
	if _, hasHub := handler.hubs.Load("retention-1"); hasHub {
		t.Fatal("hub must be gone after an explicit close")
	}
}

// TestCloseSessionNow_ReapsADetachedSession covers the common case: the tab is
// closed while the PTY is sitting in the detached map waiting to be reclaimed.
func TestCloseSessionNow_ReapsADetachedSession(t *testing.T) {
	handler := newHandlerForTest()
	session := newTestSession("retention-2")
	orphanReaderDone := make(chan struct{})
	handler.sessions.Store("retention-2", session)
	handler.detachSession("retention-2", session, sessionGracePeriod, orphanReaderDone)

	if wasClosed := handler.CloseSessionNow("retention-2"); !wasClosed {
		t.Fatal("expected an explicit close to reap a detached session")
	}
	if _, isStillDetached := handler.detachedSessions.Load("retention-2"); isStillDetached {
		t.Fatal("detached record must be removed by an explicit close")
	}

	select {
	case <-orphanReaderDone:
		// Correct: the orphaned reader was told to exit.
	default:
		t.Fatal("expected the orphaned PTY reader to be stopped by an explicit close")
	}
}

// TestCloseSessionNow_UnknownSessionIsHarmless keeps the endpoint safe to call
// twice — tab close is best-effort and may be retried.
func TestCloseSessionNow_UnknownSessionIsHarmless(t *testing.T) {
	handler := newHandlerForTest()
	if wasClosed := handler.CloseSessionNow("never-existed"); wasClosed {
		t.Fatal("closing an unknown session must report that nothing was closed")
	}
}

// TestStopOrphanReader_IsSafeWhenGraceTimerAlreadyFired proves the reader-stop
// signal is idempotent. An explicit close racing the reaper would otherwise
// close the same channel twice and panic the server.
func TestStopOrphanReader_IsSafeWhenGraceTimerAlreadyFired(t *testing.T) {
	handler := newHandlerForTest()
	session := newTestSession("retention-3")
	handler.sessions.Store("retention-3", session)

	const instantGrace = 20 * time.Millisecond
	handler.detachSession("retention-3", session, instantGrace, make(chan struct{}))
	time.Sleep(instantGrace * 5) // let the reaper fire and stop the reader

	// Must not panic even though the reaper already stopped the same reader.
	handler.CloseSessionNow("retention-3")
}
