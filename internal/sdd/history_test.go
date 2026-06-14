// history_test.go — verifies decision history round-trips and appends (FR-015), using a
// temp directory so the test is fully isolated and never touches the real ~/.forge.
package sdd

import (
	"testing"
	"time"
)

func TestAppendDecision_RoundTripsAndAppends(t *testing.T) {
	baseDir := t.TempDir()
	feature := "003-sdd-phase-orchestrator"
	stamp := time.Unix(1700000000, 0)

	first := Decision{Phase: PhasePlan, Action: ActionApprove, Timestamp: stamp}
	if err := appendDecision(baseDir, feature, first); err != nil {
		t.Fatalf("first append failed: %v", err)
	}

	second := Decision{Phase: PhaseValidate, Action: ActionClarify, ClarifyText: "narrow scope", Timestamp: stamp}
	if err := appendDecision(baseDir, feature, second); err != nil {
		t.Fatalf("second append failed: %v", err)
	}

	records, err := loadHistory(baseDir, feature)
	if err != nil {
		t.Fatalf("load failed: %v", err)
	}
	if len(records) != 2 {
		t.Fatalf("expected 2 records, got %d", len(records))
	}
	if records[0].Phase != PhasePlan || records[0].Action != ActionApprove {
		t.Errorf("first record wrong: %+v", records[0])
	}
	if records[1].ClarifyText != "narrow scope" {
		t.Errorf("clarify text not persisted: %+v", records[1])
	}
}

func TestLoadHistory_MissingFileIsEmptyNotError(t *testing.T) {
	records, err := loadHistory(t.TempDir(), "never-written")
	if err != nil {
		t.Fatalf("missing history should not error, got: %v", err)
	}
	if len(records) != 0 {
		t.Fatalf("expected empty history, got %d records", len(records))
	}
}
