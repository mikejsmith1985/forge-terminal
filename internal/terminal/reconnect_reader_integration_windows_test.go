//go:build windows
// +build windows

// reconnect_reader_integration_windows_test.go — behavioural proof that a tab
// which reconnects to a still-running shell can still SEE that shell.
//
// This is the regression test for the "frozen terminal every morning" defect:
// overnight the WebSocket dies and the PTY is detached but kept alive; in the
// morning the tab reconnects. If the reconnecting client is treated as a passive
// watcher, the previous owner's reader goroutine is stopped and never replaced,
// so the shell keeps running and executing typed commands while its output goes
// nowhere. The test drives the real handler over a real WebSocket against a real
// ConPTY shell — "it compiles" and "the socket opened" are not proof (Article X).
package terminal

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"github.com/mikejsmith1985/forge-terminal/internal/terminal/vision"
)

// visionParserBufferBytes is a small parse buffer — this test never enables the
// vision overlay, it only needs a non-nil parser for the owner setup path.
const visionParserBufferBytes = 4096

// shellStartupSettle outwaits Forge's own shell bootstrap. About 100ms after a
// PTY is created, Forge injects environment variables and then a screen clear
// (`cls`) to hide them. ConPTY is a screen buffer rather than a byte stream, so
// that clear discards whatever else was on screen — a test that disconnects
// mid-bootstrap races it and loses output for reasons unrelated to reconnection.
const shellStartupSettle = 1500 * time.Millisecond

// newReconnectTestServer starts the real WebSocket terminal handler on a
// loopback HTTP server and returns the handler plus the ws:// base URL.
func newReconnectTestServer(t *testing.T) (*Handler, string, func()) {
	t.Helper()

	handler := NewHandlerDirect(nil, vision.NewParser(visionParserBufferBytes, nil), nil)
	server := httptest.NewServer(http.HandlerFunc(handler.HandleWebSocket))
	baseURL := "ws" + strings.TrimPrefix(server.URL, "http")

	return handler, baseURL, server.Close
}

// readUntilMarker drains terminal frames until marker appears or the deadline
// passes. Output is what the PTY reader goroutine broadcast to the hub, so
// finding the marker proves a reader is actually running. Everything received is
// returned so a failure can show what the terminal did send instead.
func readUntilMarker(clientConn *websocket.Conn, marker string, timeout time.Duration) (received string, wasFound bool) {
	deadline := time.Now().Add(timeout)
	var collected strings.Builder

	for time.Now().Before(deadline) {
		_ = clientConn.SetReadDeadline(deadline)
		_, payload, err := clientConn.ReadMessage()
		if err != nil {
			return collected.String(), false
		}
		collected.Write(payload)
		if strings.Contains(collected.String(), marker) {
			return collected.String(), true
		}
	}
	return collected.String(), false
}

// tailOf returns the last maxBytes of text, so a failure message shows the most
// recent terminal output rather than a wall of startup banner.
func tailOf(text string, maxBytes int) string {
	if len(text) <= maxBytes {
		return text
	}
	return text[len(text)-maxBytes:]
}

// waitForDetachedSession polls until the handler has parked the PTY in the
// detached map, which is what happens when the last client disconnects.
func waitForDetachedSession(handler *Handler, sessionID string, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if _, isDetached := handler.detachedSessions.Load(sessionID); isDetached {
			return true
		}
		time.Sleep(50 * time.Millisecond)
	}
	return false
}

// TestReconnectToDetachedSession_StillDeliversPTYOutput is the Red→Green proof.
// Before the fix the reconnecting client joined as a watcher, the orphaned
// reader was stopped, and this test times out waiting for output that the shell
// really did produce.
func TestReconnectToDetachedSession_StillDeliversPTYOutput(t *testing.T) {
	handler, baseURL, closeServer := newReconnectTestServer(t)
	defer closeServer()

	// A unique id per run keeps a previous run's persisted scrollback journal
	// from replaying an old marker and faking a pass.
	sessionID := fmt.Sprintf("reclaim-itest-%d", time.Now().UnixNano())
	marker := fmt.Sprintf("FORGE_RECLAIM_OK_%d", time.Now().UnixNano())
	terminalURL := fmt.Sprintf("%s?tabId=%s&shell=cmd&cols=80&rows=24", baseURL, sessionID)

	// ── First connection: start the shell and wait until it is genuinely idle ──
	firstConn, _, err := websocket.DefaultDialer.Dial(terminalURL, nil)
	if err != nil {
		t.Fatalf("first connect failed: %v", err)
	}
	if _, hasPrompt := readUntilMarker(firstConn, ">", 20*time.Second); !hasPrompt {
		_ = firstConn.Close()
		t.Fatal("shell never produced a prompt on the first connection")
	}
	// A prompt alone is not enough: Forge's own bootstrap clear is still pending.
	// Round-trip a command so the shell is provably past it and executing input.
	// Deliberately shares no substring with marker: the reconnecting client
	// replays scrollback, so a probe containing marker would fake a pass.
	readinessProbe := strings.Replace(marker, "RECLAIM_OK", "SHELL_READY", 1)
	time.Sleep(shellStartupSettle)
	if err := firstConn.WriteMessage(websocket.TextMessage, []byte("echo "+readinessProbe+"\r")); err != nil {
		t.Fatalf("sending readiness probe failed: %v", err)
	}
	if _, isReady := readUntilMarker(firstConn, readinessProbe, 20*time.Second); !isReady {
		_ = firstConn.Close()
		t.Fatal("shell never echoed the readiness probe — it was not accepting commands")
	}

	// ── Disconnect: this is the overnight WebSocket death ──
	_ = firstConn.Close()
	if !waitForDetachedSession(handler, sessionID, 10*time.Second) {
		t.Fatal("session was never detached after the client disconnected")
	}

	// ── Reconnect: this is the user returning in the morning ──
	secondConn, _, err := websocket.DefaultDialer.Dial(terminalURL, nil)
	if err != nil {
		t.Fatalf("reconnect failed: %v", err)
	}
	defer secondConn.Close()

	// The orphaned reader flushes whatever its final blocking Read returns, so a
	// single command can be delivered by the dying goroutine even when no
	// replacement exists. Retire it with a throwaway command first...
	retiringCommand := strings.Replace(marker, "RECLAIM_OK", "DRAIN", 1)
	if err := secondConn.WriteMessage(websocket.TextMessage, []byte("echo "+retiringCommand+"\r")); err != nil {
		t.Fatalf("sending the drain command failed: %v", err)
	}
	_, _ = readUntilMarker(secondConn, retiringCommand, 25*time.Second)

	// ...then assert on output that only a live replacement reader can deliver.
	if err := secondConn.WriteMessage(websocket.TextMessage, []byte("echo "+marker+"\r")); err != nil {
		t.Fatalf("sending command after reconnect failed: %v", err)
	}

	received, wasEchoed := readUntilMarker(secondConn, marker, 25*time.Second)
	if !wasEchoed {
		t.Fatalf("reconnected tab stopped receiving the shell's output — the PTY reader was "+
			"stopped on reconnect and never replaced (frozen terminal).\n"+
			"Looking for %q; received %d bytes:\n%q",
			marker, len(received), tailOf(received, 600))
	}
}
