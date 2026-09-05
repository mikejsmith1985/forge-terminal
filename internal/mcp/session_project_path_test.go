// session_project_path_test.go — a tool acts on the project of the tab that called it.
//
// The defect these tests pin: with two repositories open, a gate recorded from
// one tab was written into the other, because the request carried no session
// and the resolver picked whichever bound repository it found first. The
// ledger then satisfied a commit in the wrong project while the right one
// stayed empty.
//
// The fix is that every project-writing tool accepts the caller's session id —
// the FORGE_SESSION_ID Forge already exports into each tab — and resolves the
// project from that tab's own binding before falling back to anything else.
package mcp

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/mikejsmith1985/forge-terminal/internal/workflow"
)

// sessionResolverForTest maps named sessions to project roots, falling back to
// `fallbackRoot` for anything unknown.
func sessionResolverForTest(bindings map[string]string, fallbackRoot string) func(string) string {
	return NewSessionProjectPathResolver(
		func(sessionID string) string { return bindings[sessionID] },
		func() string { return fallbackRoot },
	)
}

func TestTheSessionsOwnRepositoryWinsOverTheFallback(t *testing.T) {
	sessionProject := t.TempDir()
	mustCreateDirectory(t, filepath.Join(sessionProject, ".git"))
	otherProject := t.TempDir()
	mustCreateDirectory(t, filepath.Join(otherProject, ".git"))

	resolve := sessionResolverForTest(map[string]string{"tab-1": sessionProject}, otherProject)

	if got := resolve("tab-1"); got != sessionProject {
		t.Errorf("expected the session's own project, got %q", got)
	}
}

func TestAnUnknownSessionFallsBack(t *testing.T) {
	fallbackProject := t.TempDir()
	mustCreateDirectory(t, filepath.Join(fallbackProject, ".git"))

	resolve := sessionResolverForTest(map[string]string{}, fallbackProject)

	if got := resolve("tab-nobody-bound"); got != fallbackProject {
		t.Errorf("an unbound session should fall back, got %q", got)
	}
	if got := resolve(""); got != fallbackProject {
		t.Errorf("no session at all should fall back, got %q", got)
	}
}

func TestASessionBoundBelowTheRootResolvesToTheRoot(t *testing.T) {
	projectRoot := t.TempDir()
	mustCreateDirectory(t, filepath.Join(projectRoot, ".git"))
	subdirectory := filepath.Join(projectRoot, "internal", "mcp")
	mustCreateDirectory(t, subdirectory)

	resolve := sessionResolverForTest(map[string]string{"tab-1": subdirectory}, "")

	if got := resolve("tab-1"); got != projectRoot {
		t.Errorf("state must land at the root, not scattered below it; got %q", got)
	}
}

func TestAGateRecordedWithASessionLandsInThatSessionsProject(t *testing.T) {
	sessionProject := t.TempDir()
	mustCreateDirectory(t, filepath.Join(sessionProject, ".git"))
	wrongProject := t.TempDir()
	mustCreateDirectory(t, filepath.Join(wrongProject, ".git"))

	tool := newWorkflowGateRecordTool(sessionResolverForTest(map[string]string{"tab-1": sessionProject}, wrongProject))

	result, err := tool.Execute(map[string]any{
		"sessionId": "tab-1",
		"taskId":    "task-routed",
		"gate":      workflow.GateBranchCreated,
		"evidence":  "branch exists",
	})
	if err != nil || result.IsError {
		t.Fatalf("recording should succeed, got err=%v result=%s", err, resultText(result))
	}

	ticket, _ := workflow.LoadTicket(sessionProject)
	if ticket == nil || ticket.TaskID != "task-routed" {
		t.Error("the ticket should be written into the session's project")
	}
	if stray, _ := workflow.LoadTicket(wrongProject); stray != nil {
		t.Error("nothing should be written into the other project")
	}
}

func TestPreflightWithASessionReadsThatSessionsProject(t *testing.T) {
	sessionProject := t.TempDir()
	mustCreateDirectory(t, filepath.Join(sessionProject, ".git"))
	wrongProject := t.TempDir()
	mustCreateDirectory(t, filepath.Join(wrongProject, ".git"))
	if _, err := workflow.RecordGate(wrongProject, "task-elsewhere", workflow.GateBranchCreated, "elsewhere"); err != nil {
		t.Fatalf("seeding the other project: %v", err)
	}

	tool := newWorkflowPreflightTool(sessionResolverForTest(map[string]string{"tab-1": sessionProject}, wrongProject))

	result, err := tool.Execute(map[string]any{"sessionId": "tab-1"})
	if err != nil {
		t.Fatalf("preflight: %v", err)
	}
	if !strings.Contains(resultText(result), "no workflow ticket exists") {
		t.Errorf("preflight should look at the session's empty project, got %s", resultText(result))
	}
}

// recordingBroadcaster remembers where a brief was sent.
type recordingBroadcaster struct {
	sessionID string
}

func (b *recordingBroadcaster) BroadcastJSONToSession(sessionID string, _ any) bool {
	b.sessionID = sessionID
	return true
}

func TestABriefPublishedWithASessionRendersInThatSession(t *testing.T) {
	sessionProject := t.TempDir()
	mustCreateDirectory(t, filepath.Join(sessionProject, ".git"))
	broadcaster := &recordingBroadcaster{}

	tool := newChangeBriefPublishTool(sessionResolverForTest(map[string]string{"tab-1": sessionProject}, ""), broadcaster)

	args := validBriefArguments()
	args["sessionId"] = "tab-1"
	result, err := tool.Execute(args)
	if err != nil || result.IsError {
		t.Fatalf("publishing should succeed, got err=%v result=%s", err, resultText(result))
	}

	if broadcaster.sessionID != "tab-1" {
		t.Errorf("the brief should render in the calling tab, was sent to %q", broadcaster.sessionID)
	}
	if !workflow.HasBriefForTask(sessionProject, "task-integration") {
		t.Error("the brief should be stored in the session's project")
	}
}

func TestABriefPublishedWithoutASessionSaysWhyItDidNotRender(t *testing.T) {
	// Storing and gating still happen — a brief that cannot be shown must not
	// block the commit — but the agent is told plainly what it left out, so
	// the next call can carry the session instead of silently rendering nowhere.
	projectRoot := t.TempDir()
	mustCreateDirectory(t, filepath.Join(projectRoot, ".git"))

	tool := newChangeBriefPublishTool(sessionResolverForTest(map[string]string{}, projectRoot), &recordingBroadcaster{})

	result, err := tool.Execute(validBriefArguments())
	if err != nil || result.IsError {
		t.Fatalf("publishing should succeed, got err=%v result=%s", err, resultText(result))
	}

	text := resultText(result)
	if !strings.Contains(text, `"rendered": false`) {
		t.Errorf("the result should admit the brief was not rendered, got %s", text)
	}
	if !strings.Contains(text, "FORGE_SESSION_ID") {
		t.Errorf("the result should name the variable to pass next time, got %s", text)
	}
}
