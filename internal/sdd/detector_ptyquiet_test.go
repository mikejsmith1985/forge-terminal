// detector_ptyquiet_test.go — verifies the WaiterFunc adapter forwards to its closure.
package sdd

import "testing"

func TestWaiterFunc_Forwards(t *testing.T) {
	var gotSession string
	var gotPhase PhaseName
	var waiter CompletionWaiter = WaiterFunc(func(sessionID string, phase PhaseName) {
		gotSession, gotPhase = sessionID, phase
	})

	waiter.WaitForPhase("sess-1", PhaseValidate)

	if gotSession != "sess-1" || gotPhase != PhaseValidate {
		t.Errorf("forwarded (%q, %q), want (sess-1, validate)", gotSession, gotPhase)
	}
}
