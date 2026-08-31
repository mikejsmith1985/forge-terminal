// gate_test.go — verifies the function adapters forward to the wrapped closures so main.go
// can wire the macro injector and the hub broadcaster as plain functions.
package sdd

import "testing"

func TestInjectorFunc_Forwards(t *testing.T) {
	var gotSession, gotText string
	var injector CommandInjector = InjectorFunc(func(sessionID, text string) error {
		gotSession, gotText = sessionID, text
		return nil
	})

	if err := injector.InjectCommand("sess-1", "/speckit-plan"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gotSession != "sess-1" || gotText != "/speckit-plan" {
		t.Errorf("forwarded (%q, %q), want (sess-1, /speckit-plan)", gotSession, gotText)
	}
}

func TestBroadcasterFunc_Forwards(t *testing.T) {
	var gotPhase PhaseName
	var broadcaster GateBroadcaster = BroadcasterFunc(func(card DecisionCard) error {
		gotPhase = card.Phase
		return nil
	})

	if err := broadcaster.BroadcastGate(DecisionCard{Phase: PhasePlan}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gotPhase != PhasePlan {
		t.Errorf("forwarded phase %q, want plan", gotPhase)
	}
}
