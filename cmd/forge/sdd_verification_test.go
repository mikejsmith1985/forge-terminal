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

// userFacingRecord is a behaviour-changing, user-facing phase whose TDD evidence is
// already satisfied, so only the UX rule is the variable under test.
func userFacingRecord() phaseVerificationRecord {
	red := time.Date(2026, 6, 24, 10, 0, 0, 0, time.UTC)
	return phaseVerificationRecord{
		Phase:          "implement",
		Classification: sdd.BehaviorClassification{BehaviorChanging: true, UserFacing: true},
		RedObserved:    red,
		GreenObserved:  red.Add(5 * time.Minute),
	}
}

// TestEvaluateGate_UXRule covers the US3 Playwright UX gate (FR-012/FR-013/FR-016, contract C3).
func TestEvaluateGate_UXRule(t *testing.T) {
	t.Run("user-facing with no UX evidence is blocked (curl/200 does not count)", func(t *testing.T) {
		record := userFacingRecord()
		record.UXResult = nil // only non-UX evidence (e.g. curl/200) exists → no ux-validated entry.
		if got := evaluateGate(record); got != gateBlock {
			t.Errorf("decision = %q, want block (non-UX evidence is rejected)", got)
		}
	})

	t.Run("UX tooling could not run is blocked (fail closed)", func(t *testing.T) {
		record := userFacingRecord()
		record.UXResult = &uxEvidence{Ran: false}
		if got := evaluateGate(record); got != gateBlock {
			t.Errorf("decision = %q, want block (fail closed when Playwright cannot run)", got)
		}
	})

	t.Run("failing UX test is blocked", func(t *testing.T) {
		record := userFacingRecord()
		record.UXResult = &uxEvidence{Ran: true, Passed: false}
		if got := evaluateGate(record); got != gateBlock {
			t.Errorf("decision = %q, want block (UX test failed)", got)
		}
	})

	t.Run("passing real-UI result passes", func(t *testing.T) {
		record := userFacingRecord()
		record.UXResult = &uxEvidence{Ran: true, Passed: true}
		if got := evaluateGate(record); got != gatePass {
			t.Errorf("decision = %q, want pass (passing Playwright UX result)", got)
		}
	})

	t.Run("non-user-facing phase needs no UX evidence", func(t *testing.T) {
		record := behaviorRecord() // BehaviorChanging, not UserFacing
		record.RedObserved = time.Date(2026, 6, 24, 10, 0, 0, 0, time.UTC)
		record.GreenObserved = record.RedObserved.Add(time.Minute)
		record.UXResult = nil
		if got := evaluateGate(record); got != gatePass {
			t.Errorf("decision = %q, want pass (UX gate must not apply to backend-only changes)", got)
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

// TestPhaseVerificationView_SurfacesBlockReason proves a blocked verdict is projected for
// the frontend so the developer sees WHY a phase is stuck (US4 honest failure, FR-015/017/018).
func TestPhaseVerificationView_SurfacesBlockReason(t *testing.T) {
	pipeline := &sddPipeline{}
	blocked := phaseVerificationRecord{
		Phase:          "implement",
		Classification: sdd.BehaviorClassification{BehaviorChanging: true},
		BlockReason:    "no failing test was recorded before implementation (TDD Red→Green required)",
	}
	pipeline.storeVerification(sdd.PhaseImplement, blocked, gateBlock)

	view := phaseVerificationView(pipeline, sdd.PhaseImplement)
	if view == nil || view.Decision != "block" {
		t.Fatalf("phaseVerificationView = %+v; want decision=block", view)
	}
	if view.BlockReason == "" {
		t.Error("a blocked verdict must carry a human-readable reason for the developer")
	}

	// A phase with no recorded verdict yields nil (nothing to surface).
	if got := phaseVerificationView(pipeline, sdd.PhaseSpecify); got != nil {
		t.Errorf("phaseVerificationView(no verdict) = %+v; want nil", got)
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
