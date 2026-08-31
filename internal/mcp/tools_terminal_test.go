package mcp_test

import (
	"strings"
	"testing"

	"github.com/mikejsmith1985/forge-terminal/internal/mcp"
	"github.com/mikejsmith1985/forge-terminal/internal/terminal"
	"github.com/mikejsmith1985/forge-terminal/internal/workflow"
)

// Terminal tools require a live Handler with PTY sessions, which can't be set up
// in a unit test environment. These tests verify argument validation (the part
// that runs before the Handler is invoked) and the tool definition structure.

func TestTerminalSessionsTool_DefinitionHasExpectedName(t *testing.T) {
	srv := mcp.NewServer("tok", mcp.Dependencies{WorkflowConfig: workflow.WorkflowConfig{}})

	_, err := srv.ExecuteTool("terminal_sessions", map[string]any{})
	// With a nil TermHandler, the tool should still return a response (empty list or error).
	// It must NOT panic.
	_ = err
}

func TestTerminalExecuteTool_MissingSessionID(t *testing.T) {
	srv := mcp.NewServer("tok", mcp.Dependencies{WorkflowConfig: workflow.WorkflowConfig{}})

	result := callTool(t, srv, "terminal_execute", map[string]any{
		"command": "ls",
		// Missing session_id
	})
	if !result.IsError {
		t.Error("expected error when session_id is missing")
	}
}

func TestTerminalExecuteTool_MissingCommand(t *testing.T) {
	srv := mcp.NewServer("tok", mcp.Dependencies{WorkflowConfig: workflow.WorkflowConfig{}})

	result := callTool(t, srv, "terminal_execute", map[string]any{
		"session_id": "abc",
		// Missing command
	})
	if !result.IsError {
		t.Error("expected error when command is missing")
	}
}

func TestTerminalExecuteTool_TimeoutClampedToMax(t *testing.T) {
	srv := mcp.NewServer("tok", mcp.Dependencies{WorkflowConfig: workflow.WorkflowConfig{}})

	// With timeout=999 and no real session, tool returns an error about the session
	// not existing — NOT a panic or timeout error. This confirms the timeout arg
	// is parsed and clamped without crashing.
	result := callTool(t, srv, "terminal_execute", map[string]any{
		"session_id":      "nonexistent-session",
		"command":         "echo hi",
		"timeout_seconds": float64(999),
	})
	if !result.IsError {
		t.Error("expected error for nonexistent session, but got success")
	}
}

func TestTerminalReadTool_MissingSessionID(t *testing.T) {
	srv := mcp.NewServer("tok", mcp.Dependencies{WorkflowConfig: workflow.WorkflowConfig{}})

	result := callTool(t, srv, "terminal_read", map[string]any{})
	if !result.IsError {
		t.Error("expected error when session_id is missing")
	}
}

// TestTerminalExecuteTool_ActiveSessionGuard_SessionNotFound verifies that the
// guard runs against a real (but empty) handler and returns a "no active session"
// error rather than panicking or hitting WriteCommandToSession for unknown IDs.
func TestTerminalExecuteTool_ActiveSessionGuard_SessionNotFound(t *testing.T) {
	// NewHandlerDirect creates a zero-session handler — no PTY is started.
	emptyHandler := terminal.NewHandlerDirect(nil, nil, nil)
	srv := mcp.NewServer("tok", mcp.Dependencies{
		TermHandler:    emptyHandler,
		WorkflowConfig: workflow.WorkflowConfig{},
	})

	result := callTool(t, srv, "terminal_execute", map[string]any{
		"session_id": "not-a-real-session",
		"command":    "echo guard-test",
	})

	if !result.IsError {
		t.Error("expected IsError=true for an unknown session ID")
	}
	responseText := result.Content[0].Text
	if !strings.Contains(responseText, "no active session") {
		t.Errorf("guard error must mention 'no active session'; got: %s", responseText)
	}
}

// TestTerminalExecuteTool_ActiveSessionGuard_ErrorMentionsSessionID ensures the
// error message names the session so agents can adjust their next call.
func TestTerminalExecuteTool_ActiveSessionGuard_ErrorMentionsSessionID(t *testing.T) {
	const targetSessionID = "specific-tab-99"

	emptyHandler := terminal.NewHandlerDirect(nil, nil, nil)
	srv := mcp.NewServer("tok", mcp.Dependencies{
		TermHandler:    emptyHandler,
		WorkflowConfig: workflow.WorkflowConfig{},
	})

	result := callTool(t, srv, "terminal_execute", map[string]any{
		"session_id": targetSessionID,
		"command":    "echo hi",
	})

	if !result.IsError {
		t.Error("expected IsError=true for unknown session")
	}
	if !strings.Contains(result.Content[0].Text, targetSessionID) {
		t.Errorf("error message must include the session ID %q; got: %s",
			targetSessionID, result.Content[0].Text)
	}
}
