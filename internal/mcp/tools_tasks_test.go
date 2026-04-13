package mcp_test

import (
	"testing"

	"github.com/mikejsmith1985/forge-terminal/internal/mcp"
	"github.com/mikejsmith1985/forge-terminal/internal/workflow"
)

func TestTaskSubmitTool_ReturnsTaskID(t *testing.T) {
	srv := mcp.NewServer("tok", mcp.Dependencies{WorkflowConfig: workflow.WorkflowConfig{}})

	result := callTool(t, srv, "task_submit", map[string]any{
		"type":    "bug-report",
		"payload": "## Bug\nSomething broke.",
		"source":  "test",
	})

	if result.IsError {
		t.Fatalf("unexpected error: %v", result.Content)
	}
	if len(result.Content) == 0 {
		t.Fatal("expected content in task_submit response")
	}
	if !contains(result.Content[0].Text, "taskId") {
		t.Errorf("expected taskId in response text, got: %s", result.Content[0].Text)
	}
}

func TestTaskSubmitTool_MissingType(t *testing.T) {
	srv := mcp.NewServer("tok", mcp.Dependencies{WorkflowConfig: workflow.WorkflowConfig{}})

	result := callTool(t, srv, "task_submit", map[string]any{
		"payload": "some payload",
	})
	if !result.IsError {
		t.Error("expected error when type is missing")
	}
}

func TestTaskSubmitTool_MissingPayload(t *testing.T) {
	srv := mcp.NewServer("tok", mcp.Dependencies{WorkflowConfig: workflow.WorkflowConfig{}})

	result := callTool(t, srv, "task_submit", map[string]any{
		"type": "bug-report",
	})
	if !result.IsError {
		t.Error("expected error when payload is missing")
	}
}

func TestTaskSubmitTool_DefaultsSourceToUnknown(t *testing.T) {
	srv := mcp.NewServer("tok", mcp.Dependencies{WorkflowConfig: workflow.WorkflowConfig{}})

	result := callTool(t, srv, "task_submit", map[string]any{
		"type":    "bug-report",
		"payload": "some payload",
		// No source field
	})
	if result.IsError {
		t.Fatalf("unexpected error: %v", result.Content)
	}
	// Should succeed with source defaulted to "unknown"
	if !contains(result.Content[0].Text, "taskId") {
		t.Errorf("expected taskId in response, got: %s", result.Content[0].Text)
	}
}
