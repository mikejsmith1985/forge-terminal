// types_test.go — locks the public action set and phase-name constants so the contract
// shared with the frontend cannot drift silently.
package sdd

import "testing"

func TestAllActions(t *testing.T) {
	want := []Action{ActionApprove, ActionReject, ActionClarify}
	if len(allActions) != len(want) {
		t.Fatalf("allActions has %d entries, want %d", len(allActions), len(want))
	}
	for index, action := range allActions {
		if action != want[index] {
			t.Errorf("allActions[%d] = %q, want %q", index, action, want[index])
		}
	}
}

func TestPhaseNameConstants(t *testing.T) {
	pairs := map[PhaseName]string{
		PhaseSpecify: "specify", PhaseClarify: "clarify", PhasePlan: "plan",
		PhaseValidate: "validate", PhaseImplement: "implement",
	}
	for phase, want := range pairs {
		if string(phase) != want {
			t.Errorf("phase constant = %q, want %q", phase, want)
		}
	}
}
