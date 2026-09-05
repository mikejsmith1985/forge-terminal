// project_path_integration_test.go — the bug, reproduced and then fixed.
//
// The unit tests check the resolver in isolation. This drives a real MCP server
// with a real tool and asserts where the bytes actually land, because that is
// what was wrong: every part worked, and the brief still ended up being written
// to a directory the operating system refused.
package mcp

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/mikejsmith1985/forge-terminal/internal/workflow"
)

// validBriefArguments returns a brief that passes validation, so these tests
// fail on where it was written rather than on what it contained.
func validBriefArguments() map[string]any {
	return map[string]any{
		"taskId":         "task-integration",
		"headline":       "Proving a brief lands in the project, not the process directory",
		"whatChanged":    "The project a tool writes to is resolved when it runs rather than at startup.",
		"whyItChanged":   "The process directory is where Forge was launched, not where the developer works.",
		"whatCouldBreak": "With several repositories open the resolver picks one, because a request carries no session.",
		"isRoutine":      true,
		"filesTouched":   float64(3),
	}
}

func TestABriefIsWrittenToTheResolvedProjectNotTheProcessDirectory(t *testing.T) {
	// The exact shape of the original bug: the process sits somewhere it cannot
	// write, while the developer's project is elsewhere entirely.
	unwritableProcessDirectory := t.TempDir() // no markers — stands in for system32

	projectRoot := t.TempDir()
	mustCreateDirectory(t, filepath.Join(projectRoot, ".git"))

	resolver := NewProjectPathResolver(func() string { return projectRoot }, unwritableProcessDirectory)
	tool := newChangeBriefPublishTool(forEverySession(resolver), nil)

	result, err := tool.Execute(validBriefArguments())
	if err != nil {
		t.Fatalf("publishing should not error, got: %v", err)
	}
	if result.IsError {
		t.Fatalf("publishing should succeed, got: %s", resultText(result))
	}

	if !workflow.HasBriefForTask(projectRoot, "task-integration") {
		t.Error("the brief should be stored in the resolved project")
	}

	// Nothing may be written where the process happens to be standing.
	strayForgeDirectory := filepath.Join(unwritableProcessDirectory, workflow.TicketDir)
	if _, err := os.Stat(strayForgeDirectory); err == nil {
		t.Errorf("nothing should have been written to the process directory at %s", strayForgeDirectory)
	}
}

func TestTheGateIsRecordedInTheResolvedProject(t *testing.T) {
	// A gate recorded in the wrong project is worse than none: the commit hook
	// reads the project's ledger, finds nothing, and refuses a commit the agent
	// believes it has satisfied.
	projectRoot := t.TempDir()
	mustCreateDirectory(t, filepath.Join(projectRoot, ".git"))

	resolver := NewProjectPathResolver(func() string { return projectRoot }, t.TempDir())
	tool := newChangeBriefPublishTool(forEverySession(resolver), nil)

	if _, err := tool.Execute(validBriefArguments()); err != nil {
		t.Fatalf("publishing should not error, got: %v", err)
	}

	ticket, err := workflow.LoadTicket(projectRoot)
	if err != nil || ticket == nil {
		t.Fatalf("the ticket should exist in the resolved project, got: %v", err)
	}
	if !ticketHasGate(ticket, workflow.GateBriefPublished) {
		t.Error("the brief-published gate should be recorded in the resolved project")
	}
}

func TestAnUnresolvableProjectIsSaidPlainly(t *testing.T) {
	// The old failure was "mkdir C:\WINDOWS\system32\.forge: Access is denied",
	// which describes a symptom of a decision made much earlier. An agent given
	// that has nothing to act on.
	resolver := NewProjectPathResolver(nil, t.TempDir())
	tool := newChangeBriefPublishTool(forEverySession(resolver), nil)

	result, err := tool.Execute(validBriefArguments())
	if err != nil {
		t.Fatalf("an unresolvable project should be reported, not errored, got: %v", err)
	}
	if !result.IsError {
		t.Fatal("publishing with no resolvable project should be refused")
	}

	message := resultText(result)
	if !contains(message, "which project") {
		t.Errorf("the message should say the project could not be determined, got: %s", message)
	}
	if contains(message, "Access is denied") {
		t.Errorf("the message should not surface an operating-system symptom, got: %s", message)
	}
}

// contains reports whether the haystack holds the needle, without pulling
// strings into a file that otherwise needs none.
func contains(haystack, needle string) bool {
	return len(haystack) >= len(needle) && indexOf(haystack, needle) >= 0
}

func indexOf(haystack, needle string) int {
	for start := 0; start+len(needle) <= len(haystack); start++ {
		if haystack[start:start+len(needle)] == needle {
			return start
		}
	}
	return -1
}
