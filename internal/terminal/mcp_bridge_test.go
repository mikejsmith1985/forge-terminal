package terminal_test

// mcp_bridge_test.go tests the MCP bridge methods added to the terminal Handler.
//
// Because creating a real PTY session requires a shell binary and OS-level
// resources, most tests here focus on the safe, parameter-validation paths
// (nil handler returns, session-not-found responses, etc.) rather than
// end-to-end PTY interaction. PTY lifecycle tests already exist in the
// main terminal package test suite.

import (
	"testing"

	"github.com/mikejsmith1985/forge-terminal/internal/terminal"
)

func TestListActiveSessions_EmptyHandler(t *testing.T) {
	handler := terminal.NewHandlerDirect(nil, nil, nil)
	sessions := handler.ListActiveSessions()

	// Newly created handler should have zero sessions.
	if len(sessions) != 0 {
		t.Errorf("expected 0 sessions on new handler, got %d", len(sessions))
	}
}

func TestGetSessionScrollback_UnknownSession(t *testing.T) {
	handler := terminal.NewHandlerDirect(nil, nil, nil)
	_, found := handler.GetSessionScrollback("nonexistent-session-id")
	if found {
		t.Error("expected GetSessionScrollback to return found=false for unknown session")
	}
}

func TestGetSessionScrollbackOffset_UnknownSession(t *testing.T) {
	handler := terminal.NewHandlerDirect(nil, nil, nil)
	offset := handler.GetSessionScrollbackOffset("nonexistent-session-id")
	if offset != 0 {
		t.Errorf("expected offset 0 for unknown session, got %d", offset)
	}
}

func TestGetScrollbackFrom_UnknownSession(t *testing.T) {
	handler := terminal.NewHandlerDirect(nil, nil, nil)
	_, found := handler.GetScrollbackFrom("nonexistent-session-id", 0)
	if found {
		t.Error("expected GetScrollbackFrom to return found=false for unknown session")
	}
}

func TestWriteCommandToSession_UnknownSession(t *testing.T) {
	handler := terminal.NewHandlerDirect(nil, nil, nil)
	err := handler.WriteCommandToSession("nonexistent-session-id", "echo hi")
	if err == nil {
		t.Error("expected WriteCommandToSession to return an error for unknown session")
	}
}

func TestActiveSessionInfo_Fields(t *testing.T) {
	// Verify the struct compiles correctly and fields are accessible.
	info := terminal.ActiveSessionInfo{
		SessionID:        "test-session",
		IsDetached:       false,
		ConnectedClients: 2,
	}
	if info.SessionID != "test-session" {
		t.Errorf("unexpected SessionID: %q", info.SessionID)
	}
	if info.ConnectedClients != 2 {
		t.Errorf("unexpected ConnectedClients: %d", info.ConnectedClients)
	}
}
