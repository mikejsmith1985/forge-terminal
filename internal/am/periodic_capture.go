// Package am provides periodic PTY capture for reliable session recovery.
package am

import (
	"crypto/sha256"
	"encoding/hex"
	"sync"
	"time"
)

// =============================================================================
// CaptureConfig
// =============================================================================

// CaptureConfig controls capture behavior
type CaptureConfig struct {
	Interval         time.Duration `json:"interval"`         // Time between captures
	MaxBufferSize    int           `json:"maxBufferSize"`    // Max bytes before forced flush
	EnableRawCapture bool          `json:"enableRawCapture"` // Whether to capture raw PTY data
	CompressionLevel int           `json:"compressionLevel"` // 0-9, default 6
}

// DefaultCaptureConfig returns sensible defaults
func DefaultCaptureConfig() CaptureConfig {
	return CaptureConfig{
		Interval:         5 * time.Second,
		MaxBufferSize:    256 * 1024, // 256KB
		EnableRawCapture: true,
		CompressionLevel: 6,
	}
}

// =============================================================================
// RingBuffer - Bounded circular buffer for PTY data
// =============================================================================

// RingBuffer provides a bounded circular buffer for PTY data
type RingBuffer struct {
	data     []byte
	capacity int
	head     int  // Write position
	tail     int  // Read position
	full     bool // Buffer is full (head caught up to tail)
	mu       sync.Mutex
}

// NewRingBuffer creates a new ring buffer with the given capacity
func NewRingBuffer(capacity int) *RingBuffer {
	if capacity <= 0 {
		capacity = 1024
	}
	return &RingBuffer{
		data:     make([]byte, capacity),
		capacity: capacity,
	}
}

// Capacity returns the total capacity of the buffer
func (rb *RingBuffer) Capacity() int {
	return rb.capacity
}

// Len returns the current number of bytes in the buffer
func (rb *RingBuffer) Len() int {
	rb.mu.Lock()
	defer rb.mu.Unlock()

	if rb.full {
		return rb.capacity
	}
	if rb.head >= rb.tail {
		return rb.head - rb.tail
	}
	return rb.capacity - rb.tail + rb.head
}

// Write adds data to the buffer, overwriting oldest data if full
func (rb *RingBuffer) Write(p []byte) int {
	rb.mu.Lock()
	defer rb.mu.Unlock()

	for _, b := range p {
		rb.data[rb.head] = b
		rb.head = (rb.head + 1) % rb.capacity

		if rb.full {
			// Overwriting, advance tail
			rb.tail = (rb.tail + 1) % rb.capacity
		}

		if rb.head == rb.tail {
			rb.full = true
		}
	}

	return len(p)
}

// Read reads data from the buffer into p, returning bytes read
func (rb *RingBuffer) Read(p []byte) int {
	rb.mu.Lock()
	defer rb.mu.Unlock()

	if !rb.full && rb.head == rb.tail {
		return 0 // Empty
	}

	n := 0
	for n < len(p) {
		if !rb.full && rb.tail == rb.head {
			break // No more data
		}

		p[n] = rb.data[rb.tail]
		rb.tail = (rb.tail + 1) % rb.capacity
		rb.full = false
		n++
	}

	return n
}

// Bytes returns a copy of all data in the buffer
func (rb *RingBuffer) Bytes() []byte {
	rb.mu.Lock()
	defer rb.mu.Unlock()

	if !rb.full && rb.head == rb.tail {
		return []byte{}
	}

	var result []byte
	if rb.full || rb.head < rb.tail {
		// Wrapped: tail to end, then start to head
		result = make([]byte, rb.capacity)
		n := copy(result, rb.data[rb.tail:])
		copy(result[n:], rb.data[:rb.head])
	} else {
		// Not wrapped: tail to head
		result = make([]byte, rb.head-rb.tail)
		copy(result, rb.data[rb.tail:rb.head])
	}

	return result
}

// Reset clears the buffer
func (rb *RingBuffer) Reset() {
	rb.mu.Lock()
	defer rb.mu.Unlock()

	rb.head = 0
	rb.tail = 0
	rb.full = false
}

// =============================================================================
// PeriodicCapture - Reliable PTY data capture
// =============================================================================

// PeriodicCapture handles reliable PTY data capture using periodic snapshots
type PeriodicCapture struct {
	session  *Session
	config   CaptureConfig
	buffer   *RingBuffer
	lastHash string // Hash of last flushed content (for change detection)
	mu       sync.Mutex
}

// NewPeriodicCapture creates a new periodic capturer for a session
func NewPeriodicCapture(session *Session, config CaptureConfig) *PeriodicCapture {
	return &PeriodicCapture{
		session: session,
		config:  config,
		buffer:  NewRingBuffer(config.MaxBufferSize),
	}
}

// Feed adds PTY output data to the capture buffer
func (pc *PeriodicCapture) Feed(data []byte) {
	pc.mu.Lock()
	defer pc.mu.Unlock()

	pc.buffer.Write(data)
}

// BufferLen returns the current buffer length
func (pc *PeriodicCapture) BufferLen() int {
	return pc.buffer.Len()
}

// CheckAndFlush checks if content changed and returns the data
// Returns (data, changed) where changed indicates new content
func (pc *PeriodicCapture) CheckAndFlush() ([]byte, bool) {
	pc.mu.Lock()
	defer pc.mu.Unlock()

	data := pc.buffer.Bytes()
	if len(data) == 0 {
		return nil, false
	}

	hash := ComputeContentHash(data)
	changed := hash != pc.lastHash
	pc.lastHash = hash

	pc.buffer.Reset()

	return data, changed
}

// FlushToSession creates a RawCapture from buffer and adds to session
func (pc *PeriodicCapture) FlushToSession() bool {
	data, changed := pc.CheckAndFlush()
	if !changed || len(data) == 0 {
		return false
	}

	pc.mu.Lock()
	defer pc.mu.Unlock()

	capture := RawCapture{
		Timestamp:   time.Now(),
		ContentHash: ComputeContentHash(data),
		ByteOffset:  0, // Would be set if writing to raw file
		ByteLength:  len(data),
	}

	pc.session.mu.Lock()
	pc.session.RawCaptures = append(pc.session.RawCaptures, capture)
	pc.session.mu.Unlock()

	return true
}

// =============================================================================
// Content Hash Utility
// =============================================================================

// ComputeContentHash generates a SHA-256 hash of content for deduplication
func ComputeContentHash(data []byte) string {
	hash := sha256.Sum256(data)
	return "sha256:" + hex.EncodeToString(hash[:])
}
