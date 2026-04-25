package workflow

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// newTempProject returns a fresh empty project root for ticket tests.
func newTempProject(t *testing.T) string {
	t.Helper()
	return t.TempDir()
}

func TestLoadTicket_MissingReturnsNil(t *testing.T) {
	root := newTempProject(t)
	ticket, err := LoadTicket(root)
	if err != nil {
		t.Fatalf("LoadTicket: %v", err)
	}
	if ticket != nil {
		t.Fatalf("expected nil ticket on fresh project, got %+v", ticket)
	}
}

func TestRecordGate_RejectsEmptyEvidence(t *testing.T) {
	root := newTempProject(t)
	if _, err := RecordGate(root, "task-1", GateBranchCreated, ""); err == nil {
		t.Fatal("expected empty evidence to be rejected")
	}
	if _, err := RecordGate(root, "task-1", "", "branch=foo"); err == nil {
		t.Fatal("expected empty gate name to be rejected")
	}
}

func TestRecordGate_AppendsAndPersists(t *testing.T) {
	root := newTempProject(t)
	if _, err := RecordGate(root, "task-1", GateBranchCreated, "feature/foo"); err != nil {
		t.Fatalf("RecordGate: %v", err)
	}
	if _, err := RecordGate(root, "task-1", GateTestsWritten, "added foo_test.go"); err != nil {
		t.Fatalf("RecordGate: %v", err)
	}
	ticket, err := LoadTicket(root)
	if err != nil || ticket == nil {
		t.Fatalf("LoadTicket: %v %v", err, ticket)
	}
	if len(ticket.Gates) != 2 {
		t.Fatalf("expected 2 gates recorded, got %d", len(ticket.Gates))
	}
	// File exists at the expected location
	if _, err := os.Stat(filepath.Join(root, ".forge", "workflow-ticket.json")); err != nil {
		t.Fatalf("ticket file not on disk: %v", err)
	}
}

func TestRecordGate_ResetsOnNewTaskID(t *testing.T) {
	root := newTempProject(t)
	if _, err := RecordGate(root, "task-1", GateBranchCreated, "old"); err != nil {
		t.Fatalf("RecordGate: %v", err)
	}
	ticket, _ := RecordGate(root, "task-2", GateBranchCreated, "new")
	if ticket.TaskID != "task-2" {
		t.Fatalf("expected new task ID to take over, got %q", ticket.TaskID)
	}
	if len(ticket.Gates) != 1 {
		t.Fatalf("expected ledger reset for new task, got %d gates", len(ticket.Gates))
	}
}

func TestPreflight_NoTicket(t *testing.T) {
	root := newTempProject(t)
	result, err := Preflight(root)
	if err != nil {
		t.Fatalf("Preflight: %v", err)
	}
	if result.OK {
		t.Fatal("expected preflight to fail with no ticket")
	}
	if !strings.Contains(result.Reason, "no workflow ticket") {
		t.Fatalf("unexpected reason %q", result.Reason)
	}
}

func TestPreflight_PassesWhenAllRequiredGatesRecorded(t *testing.T) {
	root := newTempProject(t)
	for _, gate := range RequiredGates {
		if _, err := RecordGate(root, "task-x", gate, "evidence-"+gate); err != nil {
			t.Fatalf("RecordGate %q: %v", gate, err)
		}
	}
	result, err := Preflight(root)
	if err != nil {
		t.Fatalf("Preflight: %v", err)
	}
	if !result.OK {
		t.Fatalf("expected OK preflight, got missing=%v reason=%q", result.MissingGates, result.Reason)
	}
}

func TestPreflight_ListsMissingGates(t *testing.T) {
	root := newTempProject(t)
	if _, err := RecordGate(root, "task-x", GateBranchCreated, "feature/foo"); err != nil {
		t.Fatalf("RecordGate: %v", err)
	}
	result, _ := Preflight(root)
	if result.OK {
		t.Fatal("expected preflight to fail with only branch-created recorded")
	}
	wantContains := []string{GateTestsWritten, GateTestsPassed}
	for _, gate := range wantContains {
		found := false
		for _, missing := range result.MissingGates {
			if missing == gate {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("expected MissingGates to include %q, got %v", gate, result.MissingGates)
		}
	}
}
