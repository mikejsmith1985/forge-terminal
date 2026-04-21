// tools_terminal.go implements the three Forge MCP terminal tools:
//
//   - terminal_sessions — list all active PTY sessions
//   - terminal_execute  — run a shell command and return output
//   - terminal_read     — read the recent scrollback buffer of a session
//
// These tools give external AI clients (VS Code Copilot, EZTest, Cursor) the
// ability to observe and control Forge Terminal sessions without requiring a
// WebSocket connection or browser.
package mcp

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/terminal"
)

// ── Constants ────────────────────────────────────────────────────────────────

const (
	// defaultExecuteTimeoutSec is used when the caller does not supply a timeout.
	defaultExecuteTimeoutSec = 3

	// maxExecuteTimeoutSec is the hard upper limit for terminal_execute waits.
	// 600 seconds (10 minutes) matches environment_run so agents can use
	// terminal_execute for long-running builds that stream live in the Forge tab.
	maxExecuteTimeoutSec = 600

	// executeOutputPollInterval is how often terminal_execute checks for new output.
	executeOutputPollInterval = 100 * time.Millisecond
)

// ── terminal_sessions ────────────────────────────────────────────────────────

// terminalSessionsTool lists all active PTY sessions in Forge.
type terminalSessionsTool struct {
	termHandler *terminal.Handler
}

func newTerminalSessionsTool(h *terminal.Handler) ToolHandler {
	return &terminalSessionsTool{termHandler: h}
}

func (t *terminalSessionsTool) Definition() ToolDefinition {
	return ToolDefinition{
		Name:        "terminal_sessions",
		Description: "List all active Forge Terminal PTY sessions. Returns session IDs, detached status, and connected client counts.",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {},
			"required": []
		}`),
	}
}

func (t *terminalSessionsTool) Execute(_ map[string]any) (*CallToolResult, error) {
	if t.termHandler == nil {
		return errorContent("terminal handler not initialised — no PTY sessions available"), nil
	}
	sessions := t.termHandler.ListActiveSessions()
	if len(sessions) == 0 {
		return textContent("No active terminal sessions."), nil
	}

	output, err := json.MarshalIndent(sessions, "", "  ")
	if err != nil {
		return errorContent("failed to serialise session list: " + err.Error()), nil
	}
	return textContent(string(output)), nil
}

// ── terminal_execute ─────────────────────────────────────────────────────────

// terminalExecuteTool writes a command to a PTY session and returns the output
// produced within a configurable timeout.
type terminalExecuteTool struct {
	termHandler *terminal.Handler
}

func newTerminalExecuteTool(h *terminal.Handler) ToolHandler {
	return &terminalExecuteTool{termHandler: h}
}

func (t *terminalExecuteTool) Definition() ToolDefinition {
	return ToolDefinition{
		Name:        "terminal_execute",
		Description: "Run a shell command in the specified Forge Terminal PTY session and return the output.",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"session_id": {
					"type": "string",
					"description": "The PTY session ID to send the command to. Obtain from terminal_sessions."
				},
				"command": {
					"type": "string",
					"description": "The shell command to execute. A newline is appended automatically."
				},
				"timeout_seconds": {
					"type": "number",
					"description": "How long to wait for output (1-600). Defaults to 3 seconds. Use 300-600 for builds."
				}
			},
			"required": ["session_id", "command"]
		}`),
	}
}

func (t *terminalExecuteTool) Execute(args map[string]any) (*CallToolResult, error) {
	sessionID, command, timeout, argErr := parseExecuteArgs(args)
	if argErr != nil {
		return errorContent(argErr.Error()), nil
	}
	if t.termHandler == nil {
		return errorContent("terminal handler not initialised — no PTY sessions available"), nil
	}

	// Snapshot the ring buffer length before writing the command.
	// This gives us a baseline for isolating command output from history.
	startOffset := t.termHandler.GetSessionScrollbackOffset(sessionID)

	if err := t.termHandler.WriteCommandToSession(sessionID, command); err != nil {
		return errorContent(fmt.Sprintf("could not write to session %q: %v", sessionID, err)), nil
	}

	newOutput := t.pollForOutput(sessionID, startOffset, timeout)
	return textContent(string(newOutput)), nil
}

// pollForOutput waits until new output appears in the ring buffer or the timeout fires.
// It polls at executeOutputPollInterval intervals and returns whatever accumulated.
func (t *terminalExecuteTool) pollForOutput(sessionID string, startOffset int, timeout time.Duration) []byte {
	deadline := time.Now().Add(timeout)

	for time.Now().Before(deadline) {
		newBytes, found := t.termHandler.GetScrollbackFrom(sessionID, startOffset)
		if found && len(newBytes) > 0 {
			return newBytes
		}
		time.Sleep(executeOutputPollInterval)
	}

	// Return whatever arrived before the timeout — may be empty.
	output, _ := t.termHandler.GetScrollbackFrom(sessionID, startOffset)
	return output
}

// parseExecuteArgs extracts and validates the arguments for terminal_execute.
func parseExecuteArgs(args map[string]any) (sessionID string, command string, timeout time.Duration, err error) {
	rawSession, ok := args["session_id"]
	if !ok {
		return "", "", 0, fmt.Errorf("session_id is required")
	}
	sessionID, ok = rawSession.(string)
	if !ok || sessionID == "" {
		return "", "", 0, fmt.Errorf("session_id must be a non-empty string")
	}

	rawCmd, ok := args["command"]
	if !ok {
		return "", "", 0, fmt.Errorf("command is required")
	}
	command, ok = rawCmd.(string)
	if !ok || command == "" {
		return "", "", 0, fmt.Errorf("command must be a non-empty string")
	}

	timeoutSec := defaultExecuteTimeoutSec
	if rawTimeout, hasTimeout := args["timeout_seconds"]; hasTimeout {
		if floatVal, isFloat := rawTimeout.(float64); isFloat {
			timeoutSec = int(floatVal)
		}
	}
	if timeoutSec < 1 {
		timeoutSec = 1
	}
	if timeoutSec > maxExecuteTimeoutSec {
		timeoutSec = maxExecuteTimeoutSec
	}

	timeout = time.Duration(timeoutSec) * time.Second
	return sessionID, command, timeout, nil
}

// ── terminal_read ─────────────────────────────────────────────────────────────

// terminalReadTool returns the recent scrollback buffer of a session.
type terminalReadTool struct {
	termHandler *terminal.Handler
}

func newTerminalReadTool(h *terminal.Handler) ToolHandler {
	return &terminalReadTool{termHandler: h}
}

func (t *terminalReadTool) Definition() ToolDefinition {
	return ToolDefinition{
		Name:        "terminal_read",
		Description: "Read the recent scrollback buffer (up to 64 KiB) of a Forge Terminal PTY session.",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"session_id": {
					"type": "string",
					"description": "The PTY session ID to read from. Obtain from terminal_sessions."
				}
			},
			"required": ["session_id"]
		}`),
	}
}

func (t *terminalReadTool) Execute(args map[string]any) (*CallToolResult, error) {
	rawSession, ok := args["session_id"]
	if !ok {
		return errorContent("session_id is required"), nil
	}
	sessionID, ok := rawSession.(string)
	if !ok || sessionID == "" {
		return errorContent("session_id must be a non-empty string"), nil
	}

	if t.termHandler == nil {
		return errorContent("terminal handler not initialised — no PTY sessions available"), nil
	}

	scrollback, found := t.termHandler.GetSessionScrollback(sessionID)
	if !found {
		return errorContent(fmt.Sprintf("no hub found for session %q — use terminal_sessions to list active IDs", sessionID)), nil
	}

	if len(scrollback) == 0 {
		return textContent("(no output in scrollback buffer)"), nil
	}

	return textContent(string(scrollback)), nil
}
