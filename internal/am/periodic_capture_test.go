package am

import (
	"sync"
	"testing"
	"time"
)

// =============================================================================
// RingBuffer Tests
// =============================================================================

func TestRingBuffer(t *testing.T) {
	t.Run("NewRingBuffer creates buffer with correct size", func(t *testing.T) {
		buf := NewRingBuffer(1024)
		if buf == nil {
			t.Fatal("NewRingBuffer should return non-nil buffer")
		}
		if buf.Capacity() != 1024 {
			t.Errorf("Expected capacity 1024, got %d", buf.Capacity())
		}
		if buf.Len() != 0 {
			t.Errorf("New buffer should be empty, got len %d", buf.Len())
		}
	})

	t.Run("Write adds data to buffer", func(t *testing.T) {
		buf := NewRingBuffer(100)
		data := []byte("hello world")
		n := buf.Write(data)

		if n != len(data) {
			t.Errorf("Expected to write %d bytes, wrote %d", len(data), n)
		}
		if buf.Len() != len(data) {
			t.Errorf("Buffer length should be %d, got %d", len(data), buf.Len())
		}
	})

	t.Run("Read retrieves data from buffer", func(t *testing.T) {
		buf := NewRingBuffer(100)
		input := []byte("test data")
		buf.Write(input)

		output := make([]byte, 100)
		n := buf.Read(output)

		if n != len(input) {
			t.Errorf("Expected to read %d bytes, read %d", len(input), n)
		}
		if string(output[:n]) != string(input) {
			t.Errorf("Read data mismatch: expected '%s', got '%s'", input, output[:n])
		}
	})

	t.Run("Buffer wraps around when full", func(t *testing.T) {
		buf := NewRingBuffer(10)

		// Write more than capacity
		buf.Write([]byte("12345"))
		buf.Write([]byte("67890"))
		buf.Write([]byte("ABCDE")) // Should overwrite oldest

		// Buffer should contain most recent data
		output := make([]byte, 20)
		n := buf.Read(output)

		// Should have 10 bytes (capacity)
		if n != 10 {
			t.Errorf("Expected 10 bytes, got %d", n)
		}
	})

	t.Run("Reset clears buffer", func(t *testing.T) {
		buf := NewRingBuffer(100)
		buf.Write([]byte("some data"))
		buf.Reset()

		if buf.Len() != 0 {
			t.Errorf("Reset buffer should be empty, got len %d", buf.Len())
		}
	})

	t.Run("Bytes returns copy of buffer contents", func(t *testing.T) {
		buf := NewRingBuffer(100)
		input := []byte("hello")
		buf.Write(input)

		data := buf.Bytes()
		if string(data) != "hello" {
			t.Errorf("Expected 'hello', got '%s'", data)
		}

		// Modifying returned slice should not affect buffer
		data[0] = 'X'
		data2 := buf.Bytes()
		if data2[0] != 'h' {
			t.Error("Bytes() should return a copy, not the internal buffer")
		}
	})
}

// =============================================================================
// PeriodicCapture Tests
// =============================================================================

func TestPeriodicCaptureConfig(t *testing.T) {
	t.Run("Default config has reasonable values", func(t *testing.T) {
		config := DefaultCaptureConfig()

		if config.Interval < time.Second {
			t.Errorf("Interval too short: %v", config.Interval)
		}
		if config.Interval > 30*time.Second {
			t.Errorf("Interval too long: %v", config.Interval)
		}
		if config.MaxBufferSize < 1024 {
			t.Errorf("MaxBufferSize too small: %d", config.MaxBufferSize)
		}
		if config.MaxBufferSize > 10*1024*1024 {
			t.Errorf("MaxBufferSize too large: %d", config.MaxBufferSize)
		}
	})
}

func TestPeriodicCapture(t *testing.T) {
	t.Run("NewPeriodicCapture creates capturer", func(t *testing.T) {
		session := &Session{
			ID:        "test-session",
			TabID:     "tab-1",
			StartTime: time.Now(),
			Status:    StatusActive,
		}
		config := DefaultCaptureConfig()

		capturer := NewPeriodicCapture(session, config)
		if capturer == nil {
			t.Fatal("NewPeriodicCapture should return non-nil capturer")
		}
	})

	t.Run("Feed adds data to buffer", func(t *testing.T) {
		session := &Session{
			ID:        "test-session",
			TabID:     "tab-1",
			StartTime: time.Now(),
			Status:    StatusActive,
		}
		config := DefaultCaptureConfig()
		capturer := NewPeriodicCapture(session, config)

		capturer.Feed([]byte("test output"))

		if capturer.BufferLen() == 0 {
			t.Error("Buffer should contain data after Feed")
		}
	})

	t.Run("CheckAndFlush returns data when buffer has content", func(t *testing.T) {
		session := &Session{
			ID:        "test-session",
			TabID:     "tab-1",
			StartTime: time.Now(),
			Status:    StatusActive,
		}
		config := DefaultCaptureConfig()
		capturer := NewPeriodicCapture(session, config)

		capturer.Feed([]byte("test output"))
		data, changed := capturer.CheckAndFlush()

		if !changed {
			t.Error("CheckAndFlush should return changed=true for new data")
		}
		if len(data) == 0 {
			t.Error("CheckAndFlush should return data")
		}
	})

	t.Run("CheckAndFlush returns changed=false for duplicate content", func(t *testing.T) {
		session := &Session{
			ID:        "test-session",
			TabID:     "tab-1",
			StartTime: time.Now(),
			Status:    StatusActive,
		}
		config := DefaultCaptureConfig()
		capturer := NewPeriodicCapture(session, config)

		capturer.Feed([]byte("same content"))
		capturer.CheckAndFlush() // First flush

		capturer.Feed([]byte("same content"))
		_, changed := capturer.CheckAndFlush() // Second flush with same content

		if changed {
			t.Error("CheckAndFlush should return changed=false for duplicate content")
		}
	})

	t.Run("Concurrent Feed is safe", func(t *testing.T) {
		session := &Session{
			ID:        "test-session",
			TabID:     "tab-1",
			StartTime: time.Now(),
			Status:    StatusActive,
		}
		config := DefaultCaptureConfig()
		capturer := NewPeriodicCapture(session, config)

		var wg sync.WaitGroup
		for i := 0; i < 100; i++ {
			wg.Add(1)
			go func(n int) {
				defer wg.Done()
				capturer.Feed([]byte("concurrent data"))
			}(i)
		}
		wg.Wait()

		// Should not panic, and buffer should have data
		if capturer.BufferLen() == 0 {
			t.Error("Buffer should contain data after concurrent feeds")
		}
	})
}

// =============================================================================
// PeriodicCapture with Session Integration Tests
// =============================================================================

func TestPeriodicCaptureSessionIntegration(t *testing.T) {
	t.Run("Flush creates RawCapture in session", func(t *testing.T) {
		session := &Session{
			ID:          "test-session",
			TabID:       "tab-1",
			StartTime:   time.Now(),
			Status:      StatusActive,
			RawCaptures: []RawCapture{},
		}
		config := DefaultCaptureConfig()
		capturer := NewPeriodicCapture(session, config)

		capturer.Feed([]byte("test output data"))
		capturer.FlushToSession()

		if len(session.RawCaptures) != 1 {
			t.Errorf("Session should have 1 raw capture, got %d", len(session.RawCaptures))
		}
		if session.RawCaptures[0].ContentHash == "" {
			t.Error("RawCapture should have a content hash")
		}
	})

	t.Run("Multiple flushes create multiple captures", func(t *testing.T) {
		session := &Session{
			ID:          "test-session",
			TabID:       "tab-1",
			StartTime:   time.Now(),
			Status:      StatusActive,
			RawCaptures: []RawCapture{},
		}
		config := DefaultCaptureConfig()
		capturer := NewPeriodicCapture(session, config)

		// First capture
		capturer.Feed([]byte("first output"))
		capturer.FlushToSession()

		// Second capture with different content
		capturer.Feed([]byte("second output"))
		capturer.FlushToSession()

		if len(session.RawCaptures) != 2 {
			t.Errorf("Session should have 2 raw captures, got %d", len(session.RawCaptures))
		}
	})

	t.Run("Duplicate content does not create new capture", func(t *testing.T) {
		session := &Session{
			ID:          "test-session",
			TabID:       "tab-1",
			StartTime:   time.Now(),
			Status:      StatusActive,
			RawCaptures: []RawCapture{},
		}
		config := DefaultCaptureConfig()
		capturer := NewPeriodicCapture(session, config)

		// First capture
		capturer.Feed([]byte("same content"))
		capturer.FlushToSession()

		// Second with same content
		capturer.Feed([]byte("same content"))
		capturer.FlushToSession()

		if len(session.RawCaptures) != 1 {
			t.Errorf("Duplicate content should not create new capture, got %d", len(session.RawCaptures))
		}
	})
}

// =============================================================================
// ContentHash Tests
// =============================================================================

func TestContentHash(t *testing.T) {
	t.Run("Same content produces same hash", func(t *testing.T) {
		hash1 := ComputeContentHash([]byte("hello world"))
		hash2 := ComputeContentHash([]byte("hello world"))

		if hash1 != hash2 {
			t.Error("Same content should produce same hash")
		}
	})

	t.Run("Different content produces different hash", func(t *testing.T) {
		hash1 := ComputeContentHash([]byte("hello world"))
		hash2 := ComputeContentHash([]byte("goodbye world"))

		if hash1 == hash2 {
			t.Error("Different content should produce different hash")
		}
	})

	t.Run("Hash has sha256 prefix", func(t *testing.T) {
		hash := ComputeContentHash([]byte("test"))
		if len(hash) < 10 || hash[:7] != "sha256:" {
			t.Errorf("Hash should have sha256: prefix, got '%s'", hash)
		}
	})
}
