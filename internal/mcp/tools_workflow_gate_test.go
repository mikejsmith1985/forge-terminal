// tools_workflow_gate_test.go — smoke tests for the MCP gate tools.
// Their core logic lives in internal/workflow (covered there); these
// tests ensure the MCP wrappers parse arguments and surface errors.
package mcp

import (
	"os"
	"strings"
	"testing"

	"github.com/mikejsmith1985/forge-terminal/internal/workflow"
)

// projectRootForTest returns a fresh temp directory and ensures the
// process cwd is restored at test teardown.  Each test gets its own
// .forge/workflow-ticket.json file underneath that directory.
func projectRootForTest(t *testing.T) string {
	t.Helper()
	originalDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	t.Cleanup(func() { _ = os.Chdir(originalDir) })
	return t.TempDir()
}

func TestWorkflowGateRecord_StoresEvidence(t *testing.T) {
	projectRoot := projectRootForTest(t)
	tool := newWorkflowGateRecordTool(staticProjectPath(projectRoot))

	result, err := tool.Execute(map[string]any{
		"gate":     workflow.RequiredGates[0],
		"evidence": "branch checked out",
		"taskId":   "task-1",
	})
	if err != nil {
		t.Fatalf("record returned error: %v", err)
	}
	if result == nil || len(result.Content) == 0 {
		t.Fatalf("expected non-empty result content")
	}
}

func TestWorkflowGateRecord_RejectsEmptyEvidence(t *testing.T) {
	projectRoot := projectRootForTest(t)
	tool := newWorkflowGateRecordTool(staticProjectPath(projectRoot))

	result, _ := tool.Execute(map[string]any{
		"gate":     workflow.RequiredGates[0],
		"evidence": "",
	})
	// Empty evidence should produce an error-flagged result content
	// rather than a Go error (consistent with other MCP tools).
	if result == nil || !result.IsError {
		t.Errorf("expected IsError=true on empty evidence, got %+v", result)
	}
}

func TestWorkflowPreflightCheck_ReportsBlockedWhenLedgerEmpty(t *testing.T) {
	projectRoot := projectRootForTest(t)
	tool := newWorkflowPreflightTool(staticProjectPath(projectRoot))

	result, err := tool.Execute(nil)
	if err != nil {
		t.Fatalf("preflight error: %v", err)
	}
	if result == nil || len(result.Content) == 0 {
		t.Fatalf("expected preflight result content")
	}
	// Empty ledger means preflight should report `"ok": false` in JSON.
	body := result.Content[0].Text
	if !strings.Contains(body, `"ok": false`) {
		t.Errorf("expected ok=false in preflight result, got: %s", body)
	}
}

