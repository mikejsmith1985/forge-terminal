// Package workflow — ticket_branch_test.go: a ticket only satisfies the gate on its own branch.
//
// The defect these tests pin: a ticket completed for one piece of work stayed
// on disk, and the next commit on a different branch — with none of its own
// gates recorded — passed preflight against it. A gate any old ticket
// satisfies is a formality, and a formality is what the ledger was built to
// replace.
package workflow

import (
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// checkOutBranchForTest makes a temp project look like a checkout of `branch`
// without spawning git, so these stay unit tests.
func checkOutBranchForTest(t *testing.T, projectRoot, branch string) {
	t.Helper()
	writeFileForTest(t, filepath.Join(projectRoot, ".git", "HEAD"), "ref: refs/heads/"+branch+"\n")
}

// saveCompleteTicketForTest writes a ticket carrying every required gate.
func saveCompleteTicketForTest(t *testing.T, projectRoot, branch string) {
	t.Helper()
	ticket := &Ticket{TaskID: "task-on-" + branch, Branch: branch}
	for _, gate := range RequiredGates {
		ticket.Gates = append(ticket.Gates, GateRecord{Gate: gate, PassedAt: time.Now().UTC(), Evidence: "recorded"})
	}
	if err := SaveTicket(projectRoot, ticket); err != nil {
		t.Fatalf("saving ticket: %v", err)
	}
}

func TestRecordGateStampsTheCurrentBranchOnANewTicket(t *testing.T) {
	projectRoot := newTempProject(t)
	checkOutBranchForTest(t, projectRoot, "fix/stamped-automatically")

	ticket, err := RecordGate(projectRoot, "task-1", GateBranchCreated, "created")
	if err != nil {
		t.Fatalf("recording: %v", err)
	}
	if ticket.Branch != "fix/stamped-automatically" {
		t.Errorf("a new ticket should carry the branch it was opened on, got %q", ticket.Branch)
	}
}

func TestPreflightRefusesATicketFromAnotherBranch(t *testing.T) {
	projectRoot := newTempProject(t)
	saveCompleteTicketForTest(t, projectRoot, "fix/last-week")
	checkOutBranchForTest(t, projectRoot, "fix/today")

	result, err := Preflight(projectRoot)
	if err != nil {
		t.Fatalf("preflight: %v", err)
	}
	if result.OK {
		t.Fatal("a complete ticket for a different branch must not satisfy preflight")
	}
	if !strings.Contains(result.Reason, "fix/last-week") || !strings.Contains(result.Reason, "fix/today") {
		t.Errorf("the reason should name both branches so the mismatch is obvious, got %q", result.Reason)
	}
	if result.HeadBranch != "fix/today" {
		t.Errorf("the result should report the branch HEAD is on, got %q", result.HeadBranch)
	}
}

func TestPreflightRefusesATicketWithNoBranchInsideARepository(t *testing.T) {
	// Tickets written before the branch was stamped automatically carry no
	// branch. Inside a repository that is exactly the stale shape to refuse:
	// nothing ties the ticket to the commit being made.
	projectRoot := newTempProject(t)
	saveCompleteTicketForTest(t, projectRoot, "")
	checkOutBranchForTest(t, projectRoot, "fix/today")

	result, err := Preflight(projectRoot)
	if err != nil {
		t.Fatalf("preflight: %v", err)
	}
	if result.OK {
		t.Fatal("a ticket with no branch cannot vouch for a commit on a known branch")
	}
}

func TestPreflightAcceptsATicketOnTheCurrentBranch(t *testing.T) {
	projectRoot := newTempProject(t)
	saveCompleteTicketForTest(t, projectRoot, "fix/today")
	checkOutBranchForTest(t, projectRoot, "fix/today")

	result, err := Preflight(projectRoot)
	if err != nil {
		t.Fatalf("preflight: %v", err)
	}
	if !result.OK {
		t.Errorf("a complete ticket on the current branch should pass, got reason %q", result.Reason)
	}
}

func TestPreflightSkipsTheBranchCheckOutsideARepository(t *testing.T) {
	// No repository means no commit to gate; the branch check has nothing to
	// compare against and must not invent a refusal.
	projectRoot := newTempProject(t)
	saveCompleteTicketForTest(t, projectRoot, "")

	result, err := Preflight(projectRoot)
	if err != nil {
		t.Fatalf("preflight: %v", err)
	}
	if !result.OK {
		t.Errorf("outside a repository the gates alone decide, got reason %q", result.Reason)
	}
}
