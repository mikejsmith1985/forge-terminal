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

func TestGetSessionConnectedClientCount_UnknownSession_ReturnsFalse(t *testing.T) {
	handler := terminal.NewHandlerDirect(nil, nil, nil)

	connectedClientCount, isFound := handler.GetSessionConnectedClientCount("does-not-exist-xyz")

	if isFound {
		t.Error("expected isFound=false for an unregistered session ID")
	}
	if connectedClientCount != 0 {
		t.Errorf("expected connectedClientCount=0 for unknown session, got %d", connectedClientCount)
	}
}

func TestGetSessionConnectedClientCount_AnotherUnknownSession_ZeroClients(t *testing.T) {
	// Distinct session IDs must all return (0, false) on an empty handler —
	// no session map should bleed state from one lookup to the next.
	handler := terminal.NewHandlerDirect(nil, nil, nil)

	for _, sessionID := range []string{"tab-1", "tab-2", "background-3"} {
		count, found := handler.GetSessionConnectedClientCount(sessionID)
		if found {
			t.Errorf("session %q: expected isFound=false, got true", sessionID)
		}
		if count != 0 {
			t.Errorf("session %q: expected count=0, got %d", sessionID, count)
		}
	}
}
