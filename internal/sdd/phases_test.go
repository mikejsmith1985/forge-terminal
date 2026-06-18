// phases_test.go — locks the phase-table lookups and the ordered advancement chain.
package sdd

import "testing"

func TestPhaseByName(t *testing.T) {
	plan, ok := PhaseByName(PhasePlan)
	if !ok || plan.StartCommand != "/speckit-plan" || plan.Order != 3 {
		t.Fatalf("PhaseByName(plan) = %+v, ok=%v", plan, ok)
	}
	if _, ok := PhaseByName("nope"); ok {
		t.Errorf("PhaseByName(nope) should be false")
	}
}

func TestNextPhaseAfter(t *testing.T) {
	next, ok := NextPhaseAfter(PhasePlan)
	if !ok || next.Name != PhaseTasksGenerate {
		t.Fatalf("after plan = %+v ok=%v, want tasks", next, ok)
	}
	nextAfterTasks, ok := NextPhaseAfter(PhaseTasksGenerate)
	if !ok || nextAfterTasks.Name != PhaseValidate {
		t.Fatalf("after tasks = %+v ok=%v, want validate", nextAfterTasks, ok)
	}
	if _, ok := NextPhaseAfter(PhaseImplement); ok {
		t.Errorf("implement is terminal; NextPhaseAfter should be false")
	}
}

func TestPhaseTableIsOrderedAndComplete(t *testing.T) {
	wantOrder := []PhaseName{PhaseSpecify, PhaseClarify, PhasePlan, PhaseTasksGenerate, PhaseValidate, PhaseImplement}
	if len(phaseTable) != len(wantOrder) {
		t.Fatalf("phase table has %d phases, want %d", len(phaseTable), len(wantOrder))
	}
	for index, phase := range phaseTable {
		if phase.Name != wantOrder[index] || phase.Order != index+1 {
			t.Errorf("phase %d = %s (order %d), want %s", index, phase.Name, phase.Order, wantOrder[index])
		}
	}
}
