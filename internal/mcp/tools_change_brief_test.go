// tools_change_brief_test.go — the boundary where an agent publishes a brief.
//
// The tool is the reason the whole design is enforceable: it receives a
// structured document rather than the terminal's screen redraws, so Forge knows
// exactly what was published and can tell when nothing was.
//
// These tests are mostly about refusal.  A tool that accepted anything would
// let an agent satisfy the commit gate with a document the developer could
// learn nothing from, and the gate would become the formality this feature
// exists to replace.
package mcp

import (
	"strings"
	"testing"

	"github.com/mikejsmith1985/forge-terminal/internal/workflow"
)

// validBriefArgs returns arguments that should publish, so each test can spoil
// one thing and show that one thing was caught.
func validBriefArgs() map[string]any {
	return map[string]any{
		"taskId":         "task-001",
		"headline":       "Folders now give up their path on a right-click",
		"whatChanged":    "Right-clicking a folder offers Copy Path in the file tree and the projects browser.",
		"whyItChanged":   "Copy Path existed on files only, so a folder's path could not be got out of the interface.",
		"whatCouldBreak": "The clipboard is unavailable outside a secure context, so a copy now reports failure.",
		"isRoutine":      false,
		"filesTouched":   float64(6),
		"decisions": []any{map[string]any{
			"chose":        "One shared context menu used by both surfaces",
			"insteadOf":    "A separate menu for each surface",
			"because":      "Two menus drift apart in dismissal and positioning, which is the bug being fixed.",
			"openQuestion": "Is the shared menu worth coupling two unrelated panels?",
		}},
	}
}

func TestPublishingAValidBriefRecordsTheGate(t *testing.T) {
	projectRoot := t.TempDir()
	tool := newChangeBriefPublishTool(staticSessionProjectPath(projectRoot), nil)

	result, err := tool.Execute(validBriefArgs())
	if err != nil {
		t.Fatalf("publishing should not error, got: %v", err)
	}
	if result.IsError {
		t.Fatalf("a valid brief should publish, got: %v", result)
	}

	if !workflow.HasBriefForTask(projectRoot, "task-001") {
		t.Error("publishing should store the brief against its task")
	}

	ticket, err := workflow.LoadTicket(projectRoot)
	if err != nil {
		t.Fatalf("the ticket should exist after publishing, got: %v", err)
	}
	if !ticketHasGate(ticket, workflow.GateBriefPublished) {
		t.Error("publishing should record the brief-published gate — otherwise the commit stays blocked")
	}
}

func TestPublishingReturnsTheBriefIdentity(t *testing.T) {
	// The caller needs the identity back so a correction can replace the brief
	// rather than adding a second one.
	tool := newChangeBriefPublishTool(staticSessionProjectPath(t.TempDir()), nil)

	result, err := tool.Execute(validBriefArgs())
	if err != nil {
		t.Fatalf("publishing should not error, got: %v", err)
	}
	if !strings.Contains(resultText(result), "briefId") {
		t.Errorf("the result should carry the brief identity, got: %s", resultText(result))
	}
}

func TestAnInvalidBriefRecordsNothing(t *testing.T) {
	projectRoot := t.TempDir()
	tool := newChangeBriefPublishTool(staticSessionProjectPath(projectRoot), nil)

	args := validBriefArgs()
	args["whatCouldBreak"] = ""

	result, err := tool.Execute(args)
	if err != nil {
		t.Fatalf("a rejection should be reported, not errored, got: %v", err)
	}
	if !result.IsError {
		t.Fatal("an invalid brief must be rejected")
	}

	// The gate must stay unrecorded, or a rejected brief would still unblock
	// the commit and the whole mechanism would be defeated.
	if workflow.HasBriefForTask(projectRoot, "task-001") {
		t.Error("a rejected brief must not be stored")
	}
	if _, err := workflow.LoadTicket(projectRoot); err == nil {
		if ticket, _ := workflow.LoadTicket(projectRoot); ticket != nil &&
			ticketHasGate(ticket, workflow.GateBriefPublished) {
			t.Error("a rejected brief must not record the gate")
		}
	}
}

func TestARejectionNamesTheOffendingField(t *testing.T) {
	// An agent told only that something was wrong will guess.  Naming the field
	// is what makes the rejection actionable.
	tool := newChangeBriefPublishTool(staticSessionProjectPath(t.TempDir()), nil)

	args := validBriefArgs()
	args["whyItChanged"] = ""

	result, _ := tool.Execute(args)

	if !strings.Contains(resultText(result), "whyItChanged") {
		t.Errorf("the rejection should name whyItChanged, got: %s", resultText(result))
	}
}

func TestOmittingDecisionsWithoutClaimingRoutineIsRejected(t *testing.T) {
	tool := newChangeBriefPublishTool(staticSessionProjectPath(t.TempDir()), nil)

	args := validBriefArgs()
	delete(args, "decisions")
	args["isRoutine"] = false

	result, _ := tool.Execute(args)

	if !result.IsError {
		t.Fatal("omitting decisions without claiming routineness must be rejected")
	}
}

func TestARoutineChangeMayPublishWithNoDecisions(t *testing.T) {
	projectRoot := t.TempDir()
	tool := newChangeBriefPublishTool(staticSessionProjectPath(projectRoot), nil)

	args := validBriefArgs()
	delete(args, "decisions")
	args["isRoutine"] = true

	result, err := tool.Execute(args)
	if err != nil {
		t.Fatalf("publishing should not error, got: %v", err)
	}
	if result.IsError {
		t.Fatalf("a change honestly claimed routine should publish, got: %v", resultText(result))
	}
}

func TestPublishingWithNoTaskIsRejected(t *testing.T) {
	// Without a task the brief cannot be tied to the ledger entry that gates
	// the commit, so it would be stored and enforce nothing.
	tool := newChangeBriefPublishTool(staticSessionProjectPath(t.TempDir()), nil)

	args := validBriefArgs()
	delete(args, "taskId")

	result, _ := tool.Execute(args)

	if !result.IsError {
		t.Fatal("a brief with no task identity must be rejected")
	}
}

func TestRepublishingUpdatesRatherThanAccumulating(t *testing.T) {
	projectRoot := t.TempDir()
	tool := newChangeBriefPublishTool(staticSessionProjectPath(projectRoot), nil)

	if _, err := tool.Execute(validBriefArgs()); err != nil {
		t.Fatalf("first publish should succeed, got: %v", err)
	}

	corrected := validBriefArgs()
	corrected["headline"] = "Corrected: folders give up their path on a right-click"
	if _, err := tool.Execute(corrected); err != nil {
		t.Fatalf("republishing should succeed, got: %v", err)
	}

	briefs, err := workflow.ListBriefs(projectRoot)
	if err != nil {
		t.Fatalf("listing should succeed, got: %v", err)
	}
	if len(briefs) != 1 {
		t.Fatalf("republishing the same task must not accumulate briefs, got %d", len(briefs))
	}
	if briefs[0].Headline != corrected["headline"] {
		t.Errorf("republishing should replace the headline, got %q", briefs[0].Headline)
	}
}

// ticketHasGate reports whether a ticket records a gate.
func ticketHasGate(ticket *workflow.Ticket, gate string) bool {
	for _, record := range ticket.Gates {
		if record.Gate == gate {
			return true
		}
	}
	return false
}

// resultText flattens a tool result to searchable text.
func resultText(result *CallToolResult) string {
	if result == nil {
		return ""
	}
	var builder strings.Builder
	for _, content := range result.Content {
		builder.WriteString(content.Text)
	}
	return builder.String()
}
