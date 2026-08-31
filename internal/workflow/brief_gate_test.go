// Package workflow — brief_gate_test.go: proving the gate has teeth.
//
// This is the acceptance test for the whole feature.  Everything else in it is
// how the requirement is made bearable; this is whether the requirement exists.
// If a commit can land with no brief, the feature has not shipped, however good
// the panel looks.
package workflow

import (
	"testing"
)

func TestBriefPublishedIsARequiredGate(t *testing.T) {
	// The pre-commit hook refuses a commit missing anything in RequiredGates,
	// so membership of that slice is the entire enforcement mechanism.
	found := false
	for _, gate := range RequiredGates {
		if gate == GateBriefPublished {
			found = true
			break
		}
	}

	if !found {
		t.Fatalf("brief-published must be a required gate, or a change can be committed unexplained; got %v", RequiredGates)
	}
}

func TestPreflightFailsWhenNoBriefWasPublished(t *testing.T) {
	projectRoot := t.TempDir()

	// A task that did everything except explain itself.
	recordGateOrFail(t, projectRoot, "task-001", GateBranchCreated)
	recordGateOrFail(t, projectRoot, "task-001", GateTestsWritten)
	recordGateOrFail(t, projectRoot, "task-001", GateTestsPassed)

	result, err := Preflight(projectRoot)
	if err != nil {
		t.Fatalf("preflight should run, got: %v", err)
	}
	if result.OK {
		t.Fatal("preflight must fail when no brief was published — this is the feature")
	}

	if !containsGate(result.MissingGates, GateBriefPublished) {
		t.Errorf("preflight should name the missing gate, got: %v", result.MissingGates)
	}
}

func TestPreflightPassesOnceABriefIsPublished(t *testing.T) {
	projectRoot := t.TempDir()

	recordGateOrFail(t, projectRoot, "task-001", GateBranchCreated)
	recordGateOrFail(t, projectRoot, "task-001", GateTestsWritten)
	recordGateOrFail(t, projectRoot, "task-001", GateTestsPassed)
	recordGateOrFail(t, projectRoot, "task-001", GateBriefPublished)

	result, err := Preflight(projectRoot)
	if err != nil {
		t.Fatalf("preflight should run, got: %v", err)
	}
	if !result.OK {
		t.Fatalf("preflight should pass once every gate is recorded, missing: %v", result.MissingGates)
	}
}

func TestHasBriefForTaskFindsAPublishedBrief(t *testing.T) {
	projectRoot := t.TempDir()
	brief := validBrief()
	brief.TaskID = "task-042"

	if err := SaveBrief(projectRoot, &brief); err != nil {
		t.Fatalf("saving should succeed, got: %v", err)
	}

	if !HasBriefForTask(projectRoot, "task-042") {
		t.Error("a published brief should be found for its task")
	}
	if HasBriefForTask(projectRoot, "task-999") {
		t.Error("a brief must not be credited to a task it was not published against")
	}
}

func TestHasBriefForTaskIsFalseOnAProjectWithNoBriefs(t *testing.T) {
	// A project at the start of its first change is not an error state.
	if HasBriefForTask(t.TempDir(), "task-001") {
		t.Error("a project that has published nothing should report no brief")
	}
}

// recordGateOrFail records one gate and fails the test if it cannot.
func recordGateOrFail(t *testing.T, projectRoot, taskID, gate string) {
	t.Helper()

	if _, err := RecordGate(projectRoot, taskID, gate, "test evidence"); err != nil {
		t.Fatalf("recording %s should succeed, got: %v", gate, err)
	}
}

// containsGate reports whether a gate appears in a list.
func containsGate(gates []string, wanted string) bool {
	for _, gate := range gates {
		if gate == wanted {
			return true
		}
	}
	return false
}
