package mcp_test

import (
	"testing"

	"github.com/mikejsmith1985/forge-terminal/internal/mcp"
	"github.com/mikejsmith1985/forge-terminal/internal/workflow"
)

func TestWorkflowStatusTool_EmptyProjectPath(t *testing.T) {
	// With no project path, the tool should return a descriptive error, not panic.
	srv := mcp.NewServer("tok", mcp.Dependencies{
		ProjectPath:    "",
		WorkflowConfig: workflow.WorkflowConfig{},
	})

	result := callTool(t, srv, "workflow_status", map[string]any{})
	if !result.IsError {
		t.Error("expected error when project path is empty")
	}
}

func TestWorkflowStatusTool_NonExistentPath(t *testing.T) {
	// A non-existent path should return an error, not panic.
	srv := mcp.NewServer("tok", mcp.Dependencies{
		ProjectPath:    "/nonexistent/path/that/does/not/exist",
		WorkflowConfig: workflow.WorkflowConfig{},
	})

	result := callTool(t, srv, "workflow_status", map[string]any{})
	// Either an error or an empty report — both are acceptable; we just must not panic.
	_ = result
}
