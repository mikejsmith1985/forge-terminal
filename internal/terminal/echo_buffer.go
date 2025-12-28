// Package terminal provides echo buffer for filtering user input echoes.
package terminal

import (
	"sync"
	"time"
	"unicode/utf8"
)

// EchoBuffer tracks pending user input to filter echoed bytes from PTY output.
// This prevents the AutoResponder from triggering on the user's own typing.
type EchoBuffer struct {
	mu        sync.Mutex
	pending   []byte        // Queue of expected echo bytes
	maxSize   int           // Maximum buffer size (prevent OOM)
	lastWrite time.Time     // Timestamp of last write for timeout
	timeout   time.Duration // Expire stale pending bytes
}

// NewEchoBuffer creates a new echo buffer with default settings.
func NewEchoBuffer() *EchoBuffer {
	return &EchoBuffer{
		pending:  make([]byte, 0, 256),
		maxSize:  4096,
		timeout:  500 * time.Millisecond,
	}
}

// AddPending adds bytes that we expect to be echoed back by the PTY.
// Handles backspaces specially by removing the last rune from pending.
// Must be called AFTER successful PTY write, and AFTER AbortOnUserInput.
func (eb *EchoBuffer) AddPending(data []byte) {
	eb.mu.Lock()
	defer eb.mu.Unlock()

	for _, b := range data {
		if b == 0x7F || b == 0x08 {
			// Backspace: remove last rune (may be multiple bytes for UTF-8)
			if len(eb.pending) > 0 {
				_, size := utf8.DecodeLastRune(eb.pending)
				if size > 0 {
					eb.pending = eb.pending[:len(eb.pending)-size]
				}
			}
			// Also add the backspace itself as pending (PTY may echo it)
			eb.pending = append(eb.pending, b)
		} else if b == '\r' || b == '\n' {
			// Enter key: clear pending and add the newline
			// After Enter, we expect fresh output, not echo continuation
			eb.pending = eb.pending[:0]
			eb.pending = append(eb.pending, b)
		} else if b >= 32 || b == '\t' {
			// Printable character or tab - add to pending
			eb.pending = append(eb.pending, b)
		}
		// Control characters (except handled above) are not typically echoed
	}

	eb.lastWrite = time.Now()

	// Bound buffer size to prevent OOM
	if len(eb.pending) > eb.maxSize {
		eb.pending = eb.pending[len(eb.pending)-eb.maxSize:]
	}
}

// FilterEcho filters incoming PTY output, removing bytes that match pending echo.
// Returns the bytes that should be passed to the AutoResponder (non-echoed data).
// Handles typical PTY backspace echo patterns (0x08 0x20 0x08 = back, space, back).
func (eb *EchoBuffer) FilterEcho(data []byte) []byte {
	eb.mu.Lock()
	defer eb.mu.Unlock()

	// Expire stale pending bytes (user typed but no echo within timeout)
	if time.Since(eb.lastWrite) > eb.timeout && len(eb.pending) > 0 {
		eb.pending = eb.pending[:0]
	}

	if len(eb.pending) == 0 {
		return data // No pending, all bytes go to AutoResponder
	}

	// Filter: Remove bytes that match pending echo
	result := make([]byte, 0, len(data))
	pendingIdx := 0
	i := 0

	for i < len(data) {
		b := data[i]

		// Check for backspace echo pattern: 0x08 0x20 0x08 (back, space, back)
		// This is what terminals typically echo for a backspace
		if b == 0x08 && i+2 < len(data) && data[i+1] == 0x20 && data[i+2] == 0x08 {
			// Check if we have a backspace in pending
			if pendingIdx < len(eb.pending) && (eb.pending[pendingIdx] == 0x08 || eb.pending[pendingIdx] == 0x7F) {
				// Consume the backspace from pending and skip all 3 bytes of the echo
				pendingIdx++
				i += 3
				continue
			}
		}

		// Standard byte matching
		if pendingIdx < len(eb.pending) && b == eb.pending[pendingIdx] {
			// This byte is expected echo - consume it
			pendingIdx++
		} else {
			// This byte is NOT echo - pass to AutoResponder
			result = append(result, b)
		}
		i++
	}

	// Remove consumed bytes from pending
	if pendingIdx > 0 {
		eb.pending = eb.pending[pendingIdx:]
	}

	return result
}

// Clear resets the echo buffer, discarding all pending bytes.
func (eb *EchoBuffer) Clear() {
	eb.mu.Lock()
	defer eb.mu.Unlock()
	eb.pending = eb.pending[:0]
}

// RegisterEcho is an alias for AddPending - registers bytes that we expect
// to be echoed back by the PTY. This is the "handshake" part of echo suppression.
// Call this AFTER writing to PTY to register what was sent.
func (eb *EchoBuffer) RegisterEcho(data []byte) {
	eb.AddPending(data)
}

// Len returns the current number of pending bytes.
func (eb *EchoBuffer) Len() int {
	eb.mu.Lock()
	defer eb.mu.Unlock()
	return len(eb.pending)
}
