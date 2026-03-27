package terminal

import "sync"

// OutputBuffer is a thread-safe ring buffer that captures PTY output during
// client disconnection. It is activated when a session detaches and deactivated
// when a client reconnects. This prevents output loss during mobile browser
// background tab suspension.
type OutputBuffer struct {
	mu      sync.Mutex
	data    []byte
	maxSize int
	active  bool
}

// NewOutputBuffer creates a new output buffer with the given maximum size.
func NewOutputBuffer(maxSize int) *OutputBuffer {
	return &OutputBuffer{
		maxSize: maxSize,
		data:    make([]byte, 0, 4096),
	}
}

// Write appends data to the buffer. If the buffer is not active, writes are
// silently discarded. If adding data would exceed maxSize, the oldest data
// is evicted to make room.
func (ob *OutputBuffer) Write(p []byte) {
	ob.mu.Lock()
	defer ob.mu.Unlock()

	if !ob.active {
		return
	}

	ob.data = append(ob.data, p...)

	// Evict oldest data if over max size
	if len(ob.data) > ob.maxSize {
		excess := len(ob.data) - ob.maxSize
		ob.data = ob.data[excess:]
	}
}

// Drain returns all buffered data and clears the buffer.
func (ob *OutputBuffer) Drain() []byte {
	ob.mu.Lock()
	defer ob.mu.Unlock()

	if len(ob.data) == 0 {
		return nil
	}

	result := make([]byte, len(ob.data))
	copy(result, ob.data)
	ob.data = ob.data[:0]
	return result
}

// Activate enables the buffer to accept writes.
func (ob *OutputBuffer) Activate() {
	ob.mu.Lock()
	defer ob.mu.Unlock()
	ob.active = true
}

// Deactivate disables the buffer and clears any stored data.
func (ob *OutputBuffer) Deactivate() {
	ob.mu.Lock()
	defer ob.mu.Unlock()
	ob.active = false
	ob.data = ob.data[:0]
}

// IsActive returns whether the buffer is currently accepting writes.
func (ob *OutputBuffer) IsActive() bool {
	ob.mu.Lock()
	defer ob.mu.Unlock()
	return ob.active
}
