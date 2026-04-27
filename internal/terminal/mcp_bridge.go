// mcp_bridge.go exposes selected Handler capabilities to the MCP server.
//
// The MCP server (internal/mcp) needs to query active sessions, write commands
// to PTY stdin, and read buffered terminal output. Rather than making the Handler's
// internal sync.Map and hub fields public, this file adds focused exported methods
// that give the MCP layer exactly what it needs — nothing more.
package terminal

import (
	"fmt"
	"strings"
)

// ActiveSessionInfo is a snapshot of a running terminal session suitable for
// returning to an MCP client. It contains only safe-to-expose metadata.
type ActiveSessionInfo struct {
	// SessionID is the unique identifier for this PTY session.
	SessionID string `json:"sessionId"`

	// Title is the human-readable tab name shown in the Forge desktop app.
	// Empty for sessions created before v7.10.6 (pre-tabTitle param).
	Title string `json:"title,omitempty"`

	// IsDetached is true when the PTY is alive but the WebSocket client disconnected.
	// The session is still recoverable within its grace period.
	IsDetached bool `json:"isDetached"`

	// ConnectedClients is the number of WebSocket connections currently watching
	// this session (0 for detached sessions).
	ConnectedClients int `json:"connectedClients"`
}

// ListActiveSessions returns a snapshot of all sessions the handler currently tracks.
// Both connected sessions (from h.sessions) and detached-but-alive sessions
// (from h.detachedSessions) are included.
func (h *Handler) ListActiveSessions() []ActiveSessionInfo {
	var result []ActiveSessionInfo

	// Walk connected sessions.
	h.sessions.Range(func(rawKey, rawVal any) bool {
		sessionID := rawKey.(string)
		sess := rawVal.(*TerminalSession)
		connectedClientCount := 0
		if hubRaw, ok := h.hubs.Load(sessionID); ok {
			connectedClientCount = hubRaw.(*sessionHub).size()
		}
		result = append(result, ActiveSessionInfo{
			SessionID:        sessionID,
			Title:            sess.TabTitle,
			IsDetached:       false,
			ConnectedClients: connectedClientCount,
		})
		return true
	})

	// Walk detached sessions that are still alive.
	h.detachedSessions.Range(func(rawKey, rawVal any) bool {
		sessionID := rawKey.(string)
		ds := rawVal.(*DetachedSession)
		result = append(result, ActiveSessionInfo{
			SessionID:        sessionID,
			Title:            ds.session.TabTitle,
			IsDetached:       true,
			ConnectedClients: 0,
		})
		return true
	})

	return result
}

// WriteCommandToSession sends a shell command to the specified PTY session's stdin.
// A newline is appended automatically so the shell executes the command immediately.
// Returns an error if the session does not exist or the PTY write fails.
func (h *Handler) WriteCommandToSession(sessionID string, command string) error {
	rawSession, exists := h.sessions.Load(sessionID)
	if !exists {
		// Also check detached sessions — their PTY is still alive.
		rawDetached, isDetached := h.detachedSessions.Load(sessionID)
		if !isDetached {
			return fmt.Errorf("no active session with ID %q", sessionID)
		}
		detached := rawDetached.(*DetachedSession)
		return writeCommandToPTY(detached.session, command)
	}

	return writeCommandToPTY(rawSession.(*TerminalSession), command)
}

// writeCommandToPTY writes a command followed by a newline to a session's PTY stdin.
func writeCommandToPTY(session *TerminalSession, command string) error {
	// Ensure the command ends with exactly one newline so the shell runs it.
	payload := strings.TrimRight(command, "\n") + "\n"
	_, err := session.PTY.Write([]byte(payload))
	if err != nil {
		return fmt.Errorf("writing command to PTY: %w", err)
	}
	return nil
}

// GetSessionScrollback returns a copy of the ring-buffered terminal output for
// a session. The buffer holds approximately the last 64 KiB of PTY output.
// Returns nil, false when the session or its hub is not found.
func (h *Handler) GetSessionScrollback(sessionID string) ([]byte, bool) {
	hubRaw, exists := h.hubs.Load(sessionID)
	if !exists {
		return nil, false
	}
	return hubRaw.(*sessionHub).copyScrollback(), true
}

// copyScrollback returns a safe copy of the hub's ring buffer contents.
// The copy is made under lock so callers never race with concurrent broadcasts.
func (hub *sessionHub) copyScrollback() []byte {
	hub.mu.Lock()
	defer hub.mu.Unlock()

	scrollback := make([]byte, len(hub.ringBuf))
	copy(scrollback, hub.ringBuf)
	return scrollback
}

// GetSessionScrollbackOffset returns the current ring buffer length for a session.
// Callers snapshot this value before issuing a command, then use it with
// GetScrollbackFrom to retrieve only the new output that arrived after the command.
func (h *Handler) GetSessionScrollbackOffset(sessionID string) int {
	hubRaw, exists := h.hubs.Load(sessionID)
	if !exists {
		return 0
	}
	hub := hubRaw.(*sessionHub)
	hub.mu.Lock()
	defer hub.mu.Unlock()
	return len(hub.ringBuf)
}

// GetScrollbackFrom returns the ring buffer bytes that arrived after the given
// starting offset. Used by terminal_execute to return only command output,
// not the entire session history.
func (h *Handler) GetScrollbackFrom(sessionID string, fromOffset int) ([]byte, bool) {
	hubRaw, exists := h.hubs.Load(sessionID)
	if !exists {
		return nil, false
	}
	hub := hubRaw.(*sessionHub)
	hub.mu.Lock()
	defer hub.mu.Unlock()

	if fromOffset >= len(hub.ringBuf) {
		// No new output since the snapshot was taken.
		return []byte{}, true
	}
	newOutput := make([]byte, len(hub.ringBuf)-fromOffset)
	copy(newOutput, hub.ringBuf[fromOffset:])
	return newOutput, true
}
