package terminal

import (
	"sync"
)

// sessionHub tracks all WebSocket clients watching a single PTY session.
// It allows PTY output to be broadcast to every connected client (owner + watchers).
// A ring buffer of recent output is kept so that new watchers receive a
// snapshot of the terminal state when they join (scrollback replay).
type sessionHub struct {
	mu      sync.Mutex
	clients map[*connWriter]struct{}

	// Ring buffer for scrollback replay — stores recent PTY output so that
	// new watchers see existing terminal content instead of a blank screen.
	ringBuf  []byte
	ringSize int // capacity in bytes (e.g., 64 KiB)
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
// Output is also appended to the ring buffer for watcher replay.
func (h *sessionHub) broadcast(msgType int, data []byte) {
	h.mu.Lock()
	// Append to ring buffer (under lock since clients snapshot is taken here)
	h.appendToRingLocked(data)
	clients := make([]*connWriter, 0, len(h.clients))
	for cw := range h.clients {
		clients = append(clients, cw)
	}
	h.mu.Unlock()

	for _, cw := range clients {
		_ = cw.WriteMessage(msgType, data)
	}
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
