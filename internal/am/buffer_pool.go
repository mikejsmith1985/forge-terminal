// Package am provides buffer pooling to reduce GC pressure.
package am

import (
	"bytes"
	"sync"
)

// Buffer pool configuration
const (
	defaultBufferCap = 4096      // 4KB initial capacity
	maxPooledCap     = 64 * 1024 // 64KB max - don't pool oversized buffers
)

// bufferPool is a sync.Pool for bytes.Buffer objects.
// This reduces GC pressure during high-frequency terminal output.
var bufferPool = sync.Pool{
	New: func() interface{} {
		return bytes.NewBuffer(make([]byte, 0, defaultBufferCap))
	},
}

// GetBuffer retrieves a buffer from the pool.
// The buffer is reset and ready for use.
func GetBuffer() *bytes.Buffer {
	return bufferPool.Get().(*bytes.Buffer)
}

// PutBuffer returns a buffer to the pool after resetting.
// Oversized buffers (>64KB) are discarded to prevent memory bloat.
func PutBuffer(buf *bytes.Buffer) {
	if buf == nil {
		return
	}
	if buf.Cap() > maxPooledCap {
		// Don't pool oversized buffers - let GC handle them
		return
	}
	buf.Reset()
	bufferPool.Put(buf)
}

// GetBufferWithCap retrieves a buffer and ensures minimum capacity.
func GetBufferWithCap(minCap int) *bytes.Buffer {
	buf := GetBuffer()
	if buf.Cap() < minCap {
		buf.Grow(minCap - buf.Cap())
	}
	return buf
}
