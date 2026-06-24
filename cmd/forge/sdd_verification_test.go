// Unit tests for the phase-completion verification gate (specs/012 US2/US4). These
// exercise the pure decision function with no real git, ledger, or disk — the gate's
// inputs are the assembled PhaseVerificationRecord (Constitution Article V, <10 ms).
package main

import (
	"testing"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/sdd"
)

func behaviorRecord() phaseVerificationRecord {
	return phaseVerificationRecord{
		Phase:          "implement",
		Classification: sdd.BehaviorClassification{BehaviorChanging: true},
	}
}

// TestEvaluateGate_TDDRule covers the US2 Red→Green requirement (FR-007/FR-008, contract C2).
func TestEvaluateGate_TDDRule(t *testing.T) {
	red := time.Date(2026, 6, 24, 10, 0, 0, 0, time.UTC)
	green := red.Add(5 * time.Minute)

	t.Run("behavior change with no Red is blocked", func(t *testing.T) {
		record := behaviorRecord()
		record.GreenObserved = green // green present, but no red
		if got := evaluateGate(record); got != gateBlock {
			t.Errorf("decision = %q, want block (no failing test recorded)", got)
		}
	})

	t.Run("Green without prior Red is blocked", func(t *testing.T) {
		record := behaviorRecord()
		record.RedObserved = green.Add(time.Minute) // red AFTER green — never failed first
		record.GreenObserved = green
		if got := evaluateGate(record); got != gateBlock {
			t.Errorf("decision = %q, want block (test never observed failing before passing)", got)
		}
	})

	t.Run("Red then Green passes", func(t *testing.T) {
		record := behaviorRecord()
		record.RedObserved = red
		record.GreenObserved = green
		if got := evaluateGate(record); got != gatePass {
			t.Errorf("decision = %q, want pass (Red→Green present)", got)
		}
	})

	t.Run("docs/refactor classification is exempt", func(t *testing.T) {
		record := phaseVerificationRecord{
			Phase:          "specify",
			Classification: sdd.BehaviorClassification{ExemptReason: "docs/refactor only"},
		}
		if got := evaluateGate(record); got != gateExempt {
			t.Errorf("decision = %q, want exempt", got)
		}
	})
}

// TestEvaluateGate_Determinism proves identical records yield identical decisions (FR-019/SC-007).
func TestEvaluateGate_Determinism(t *testing.T) {
	record := behaviorRecord() // missing Red→Green → block
	first := evaluateGate(record)
	for i := 0; i < 5; i++ {
		if again := evaluateGate(record); again != first {
			t.Fatalf("non-deterministic: run %d = %q, first = %q", i, again, first)
		}
	}
}

// TestEvaluateGate_AuditedBypass proves an explicit bypass converts a block to a pass (FR-020, contract C6).
func TestEvaluateGate_AuditedBypass(t *testing.T) {
	record := behaviorRecord() // would block (no Red→Green)
	if evaluateGate(record) != gateBlock {
		t.Fatal("precondition: record must block without a bypass")
	}
	record.Bypassed = true
	record.BypassReason = "emergency hotfix"
	if got := evaluateGate(record); got != gatePass {
		t.Errorf("decision = %q, want pass when an audited bypass is present", got)
	}
}
