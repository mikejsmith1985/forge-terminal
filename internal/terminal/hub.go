package terminal

import (
	"encoding/json"
	"log"
	"sync"

	"github.com/gorilla/websocket"
)

// sessionHub tracks all WebSocket clients watching a single PTY session.
// It allows PTY output to be broadcast to every connected client (owner + watchers).
// A ring buffer of recent output is kept so that new watchers receive a
// snapshot of the terminal state when they join (scrollback replay).
//
// The hub also tracks the "active device" — the one connection whose terminal
// dimensions drive the PTY size.  Only the active device may send resize.
// Other connections are passive: they receive broadcasts and can send raw
// input (command cards, keystrokes) but cannot resize.
type sessionHub struct {
	mu      sync.Mutex
	clients map[*connWriter]struct{}

	// activeConn is the connection that currently controls PTY dimensions.
	// nil means no active device (all clients disconnected or not yet set).
	activeConn *connWriter

	// Ring buffer for scrollback replay — stores recent PTY output so that
	// new watchers see existing terminal content instead of a blank screen.
	ringBuf  []byte
	ringSize int // capacity in bytes (e.g., 64 KiB)

	// journal persists PTY output to disk so scrollback survives server
	// restarts and extended disconnections. May be nil (disabled).
	journal *SessionJournal
}

const defaultScrollbackSize = 64 * 1024 // 64 KiB — enough for ~2000 lines of 80-col text

func newSessionHub() *sessionHub {
	return &sessionHub{
		clients:  make(map[*connWriter]struct{}),
		ringBuf:  make([]byte, 0, defaultScrollbackSize),
		ringSize: defaultScrollbackSize,
	}
}

func (h *sessionHub) add(cw *connWriter) {
	h.mu.Lock()
	h.clients[cw] = struct{}{}
	h.mu.Unlock()
}

func (h *sessionHub) remove(cw *connWriter) {
	h.mu.Lock()
	delete(h.clients, cw)
	h.mu.Unlock()
}

func (h *sessionHub) size() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.clients)
}

// broadcast sends a raw WebSocket frame to every connected client.
// Individual write errors are expected (disconnection races) and do not stop
// broadcasting to the remaining clients.
// Output is also appended to the ring buffer for watcher replay and written
// to the session journal for disk-backed scrollback persistence.
func (h *sessionHub) broadcast(msgType int, data []byte) {
	h.mu.Lock()
	// Append to ring buffer (under lock since clients snapshot is taken here)
	h.appendToRingLocked(data)
	clients := make([]*connWriter, 0, len(h.clients))
	for cw := range h.clients {
		clients = append(clients, cw)
	}
	j := h.journal // capture under lock; journal is set-once after hub creation
	h.mu.Unlock()

	for _, cw := range clients {
		_ = cw.WriteMessage(msgType, data)
	}

	// Persist to disk after clients receive data so I/O doesn't block sends.
	j.Write(data)
}

// appendToRingLocked appends data to the ring buffer, evicting oldest bytes
// if the buffer would exceed ringSize. Must be called with h.mu held.
func (h *sessionHub) appendToRingLocked(data []byte) {
	if len(data) >= h.ringSize {
		// Data larger than buffer — just keep the tail
		h.ringBuf = make([]byte, h.ringSize)
		copy(h.ringBuf, data[len(data)-h.ringSize:])
		return
	}
	h.ringBuf = append(h.ringBuf, data...)
	if len(h.ringBuf) > h.ringSize {
		excess := len(h.ringBuf) - h.ringSize
		h.ringBuf = h.ringBuf[excess:]
	}
}

// replayTo sends the accumulated ring buffer to a single client.
// Used when a watcher joins to provide terminal scrollback history.
func (h *sessionHub) replayTo(cw *connWriter, msgType int) {
	h.mu.Lock()
	buf := make([]byte, len(h.ringBuf))
	copy(buf, h.ringBuf)
	h.mu.Unlock()

	if len(buf) > 0 {
		_ = cw.WriteMessage(msgType, buf)
	}
}

// broadcastJSON sends a JSON-encoded message to every connected client.
func (h *sessionHub) broadcastJSON(v any) {
	h.mu.Lock()
	clients := make([]*connWriter, 0, len(h.clients))
	for cw := range h.clients {
		clients = append(clients, cw)
	}
	h.mu.Unlock()

	for _, cw := range clients {
		_ = cw.WriteJSON(v)
	}
}

// sendTo sends a raw WebSocket frame to a single specific client.
func (h *sessionHub) sendTo(cw *connWriter, msgType int, data []byte) error {
	return cw.WriteMessage(msgType, data)
}

// has reports whether the given connection is in the hub.
func (h *sessionHub) has(cw *connWriter) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	_, ok := h.clients[cw]
	return ok
}

// setActive designates a connection as the active device (controls PTY dimensions).
func (h *sessionHub) setActive(cw *connWriter) {
	h.mu.Lock()
	h.activeConn = cw
	h.mu.Unlock()
}

// isActive reports whether the given connection is the active device.
func (h *sessionHub) isActive(cw *connWriter) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.activeConn == cw
}

// getActive returns the current active connection, or nil.
func (h *sessionHub) getActive() *connWriter {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.activeConn
}

// transferControl moves PTY ownership from the current active device to a new one.
// It sends CONTROL_TRANSFERRED to the old active and CONTROL_GRANTED to the new one.
// All other clients in the hub receive CONTROL_TRANSFERRED as an observer notification.
func (h *sessionHub) transferControl(newActive *connWriter, sessionID string) {
	h.mu.Lock()
	oldActive := h.activeConn
	h.activeConn = newActive

	// Snapshot all clients for notification (outside lock)
	clients := make([]*connWriter, 0, len(h.clients))
	for cw := range h.clients {
		clients = append(clients, cw)
	}
	h.mu.Unlock()

	// Notify the new active device
	_ = newActive.WriteMessage(websocket.TextMessage, mustJSON(map[string]any{
		"type":      "CONTROL_GRANTED",
		"sessionId": sessionID,
	}))

	// Notify all other clients (including old active)
	transferMsg := mustJSON(map[string]any{
		"type":      "CONTROL_TRANSFERRED",
		"sessionId": sessionID,
	})
	for _, cw := range clients {
		if cw != newActive {
			_ = cw.WriteMessage(websocket.TextMessage, transferMsg)
		}
	}

	if oldActive != nil && oldActive != newActive {
		log.Printf("[Hub] Session %s: control transferred from %p to %p", sessionID, oldActive, newActive)
	} else {
		log.Printf("[Hub] Session %s: control granted to %p", sessionID, newActive)
	}
}

// mustJSON marshals v to JSON bytes, panicking on error (used for known-safe maps).
func mustJSON(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		panic("hub: json.Marshal failed: " + err.Error())
	}
	return b
}

// clearActive removes the active device if it matches the given connection.
// Called when a connection disconnects to avoid stale pointers.
func (h *sessionHub) clearActive(cw *connWriter) {
	h.mu.Lock()
	if h.activeConn == cw {
		h.activeConn = nil
	}
	h.mu.Unlock()
}

// close flushes and closes the session journal (if any). Call this once the
// hub is removed from the handler's hubs map and no more broadcasts will occur.
func (h *sessionHub) close() {
	h.mu.Lock()
	j := h.journal
	h.journal = nil
	h.mu.Unlock()
	j.Close()
}
