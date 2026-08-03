// hub_control_test.go verifies the session hub's active-device (control handoff)
// logic: a dead connection must never hold or be promoted to PTY control, and
// take-control transfers must notify both sides. These are the guarantees behind
// the "Take Control" button in the terminal UI — when they break, a tab gets
// stuck as a passive viewer showing "Another device controls this terminal".
package terminal

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// newTestConnPair upgrades a real loopback WebSocket and returns the server-side
// connWriter plus the client-side conn for reading what the hub sends. Control
// handoff writes JSON to real sockets, so tests need a live pipe — a bare
// connWriter{} would nil-panic on any successful write path.
func newTestConnPair(t *testing.T) (serverConn *connWriter, clientConn *websocket.Conn, cleanup func()) {
	t.Helper()

	serverConnCh := make(chan *websocket.Conn, 1)
	upgrader := websocket.Upgrader{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upgraded, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Errorf("upgrade failed: %v", err)
			return
		}
		serverConnCh <- upgraded
	}))

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	dialed, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		server.Close()
		t.Fatalf("dial failed: %v", err)
	}

	var rawServerConn *websocket.Conn
	select {
	case rawServerConn = <-serverConnCh:
	case <-time.After(2 * time.Second):
		server.Close()
		t.Fatal("timed out waiting for server-side websocket")
	}

	serverConn = &connWriter{conn: rawServerConn}
	cleanup = func() {
		_ = dialed.Close()
		_ = rawServerConn.Close()
		server.Close()
	}
	return serverConn, dialed, cleanup
}

// readControlMessage reads one JSON frame from the client side and returns its "type".
func readControlMessage(t *testing.T, clientConn *websocket.Conn) string {
	t.Helper()
	_ = clientConn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, payload, err := clientConn.ReadMessage()
	if err != nil {
		t.Fatalf("reading control message: %v", err)
	}
	var msg struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(payload, &msg); err != nil {
		t.Fatalf("control message is not JSON: %v (payload %q)", err, payload)
	}
	return msg.Type
}

// TestClearActiveAndPromote_SkipsClosedCandidate is the regression test for the
// stuck-viewer bug: when the active device disconnects and the only remaining
// hub client is itself dead (write-failed), promoting it strands the session
// with a phantom controller — every future joiner is told "another device
// controls this terminal" even though no live device does.
func TestClearActiveAndPromote_SkipsClosedCandidate(t *testing.T) {
	hub := newSessionHub()

	activeClient := &connWriter{}
	deadClient := &connWriter{}
	deadClient.markClosed()

	hub.add(activeClient)
	hub.add(deadClient)
	hub.setActive(activeClient)

	// Active device disconnects (mirrors the handler's defer sequence).
	hub.remove(activeClient)
	hub.clearActiveAndPromote(activeClient, "session-stuck-viewer")

	if got := hub.getActive(); got == deadClient {
		t.Fatal("hub promoted a closed connection to active — session now has a phantom controller")
	}
}

// TestClearActiveAndPromote_PromotesLiveCandidateOverDead: with one dead and one
// live client remaining, the live one must always win promotion and receive
// CONTROL_GRANTED.
func TestClearActiveAndPromote_PromotesLiveCandidateOverDead(t *testing.T) {
	hub := newSessionHub()

	liveConn, liveClientSide, cleanup := newTestConnPair(t)
	defer cleanup()

	activeClient := &connWriter{}
	deadClient := &connWriter{}
	deadClient.markClosed()

	hub.add(activeClient)
	hub.add(deadClient)
	hub.add(liveConn)
	hub.setActive(activeClient)

	hub.remove(activeClient)
	hub.clearActiveAndPromote(activeClient, "session-promote-live")

	if got := hub.getActive(); got != liveConn {
		t.Fatalf("expected the live connection to be promoted, got %p", got)
	}
	if msgType := readControlMessage(t, liveClientSide); msgType != "CONTROL_GRANTED" {
		t.Fatalf("promoted client expected CONTROL_GRANTED, got %q", msgType)
	}
}

// TestHasLiveActive_DeadConnectionDoesNotCount: a connection that failed a write
// (marked closed) must not be reported as a live controller — joiners checking
// this would otherwise be demoted to passive viewers by a dead socket.
func TestHasLiveActive_DeadConnectionDoesNotCount(t *testing.T) {
	hub := newSessionHub()

	if hub.hasLiveActive() {
		t.Fatal("empty hub must not report a live active device")
	}

	zombieClient := &connWriter{}
	hub.add(zombieClient)
	hub.setActive(zombieClient)
	if !hub.hasLiveActive() {
		t.Fatal("open active connection must count as live")
	}

	zombieClient.markClosed()
	if hub.hasLiveActive() {
		t.Fatal("closed active connection must NOT count as live")
	}
}

// TestTransferControl_GrantsNewAndNotifiesOld: the take_control path must send
// CONTROL_GRANTED to the requester and CONTROL_TRANSFERRED to the previous owner.
func TestTransferControl_GrantsNewAndNotifiesOld(t *testing.T) {
	hub := newSessionHub()

	oldConn, oldClientSide, cleanupOld := newTestConnPair(t)
	defer cleanupOld()
	newConn, newClientSide, cleanupNew := newTestConnPair(t)
	defer cleanupNew()

	hub.add(oldConn)
	hub.add(newConn)
	hub.setActive(oldConn)

	hub.transferControl(newConn, "session-transfer")

	if got := hub.getActive(); got != newConn {
		t.Fatalf("expected requester to become active, got %p", got)
	}
	if msgType := readControlMessage(t, newClientSide); msgType != "CONTROL_GRANTED" {
		t.Fatalf("requester expected CONTROL_GRANTED, got %q", msgType)
	}
	if msgType := readControlMessage(t, oldClientSide); msgType != "CONTROL_TRANSFERRED" {
		t.Fatalf("previous owner expected CONTROL_TRANSFERRED, got %q", msgType)
	}
}
