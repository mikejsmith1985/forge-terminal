package terminal

import (
	"sync"
)

// sessionHub tracks all WebSocket clients watching a single PTY session.
// It allows PTY output to be broadcast to every connected client (owner + watchers).
type sessionHub struct {
	mu      sync.Mutex
	clients map[*connWriter]struct{}
}

func newSessionHub() *sessionHub {
	return &sessionHub{clients: make(map[*connWriter]struct{})}
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
func (h *sessionHub) broadcast(msgType int, data []byte) {
	h.mu.Lock()
	clients := make([]*connWriter, 0, len(h.clients))
	for cw := range h.clients {
		clients = append(clients, cw)
	}
	h.mu.Unlock()

	for _, cw := range clients {
		_ = cw.WriteMessage(msgType, data)
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
