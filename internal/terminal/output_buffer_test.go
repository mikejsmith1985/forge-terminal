package terminal

import (
	"sync"
	"testing"
)

func TestOutputBuffer_StoresData(t *testing.T) {
	buf := NewOutputBuffer(1024) // 1KB buffer
	buf.Activate()

	data := []byte("hello world")
	buf.Write(data)

	result := buf.Drain()
	if string(result) != "hello world" {
		t.Errorf("got %q, want %q", string(result), "hello world")
	}
}

func TestOutputBuffer_DrainClearsBuffer(t *testing.T) {
	buf := NewOutputBuffer(1024)
	buf.Activate()
	buf.Write([]byte("first"))

	_ = buf.Drain()
	result := buf.Drain()

	if len(result) != 0 {
		t.Errorf("second drain should be empty, got %q", string(result))
	}
}

func TestOutputBuffer_MultipleWrites(t *testing.T) {
	buf := NewOutputBuffer(1024)
	buf.Activate()
	buf.Write([]byte("hello "))
	buf.Write([]byte("world"))

	result := buf.Drain()
	if string(result) != "hello world" {
		t.Errorf("got %q, want %q", string(result), "hello world")
	}
}

func TestOutputBuffer_EvictsOldDataWhenFull(t *testing.T) {
	buf := NewOutputBuffer(10) // tiny 10 byte buffer
	buf.Activate()

	buf.Write([]byte("12345"))// 5 bytes
	buf.Write([]byte("67890")) // 5 bytes, buffer now full
	buf.Write([]byte("ABCDE")) // 5 bytes, should evict oldest

	result := buf.Drain()
	// Should contain the most recent data that fits
	if len(result) > 10 {
		t.Errorf("result should be at most 10 bytes, got %d", len(result))
	}
	// Should contain the newest data
	resultStr := string(result)
	if len(resultStr) > 0 {
		// The most recent write "ABCDE" should be present
		if !containsSubstring(resultStr, "ABCDE") {
			t.Errorf("result should contain newest data 'ABCDE', got %q", resultStr)
		}
	}
}

func TestOutputBuffer_MaxSize(t *testing.T) {
	maxSize := 1024 * 1024 // 1MB
	buf := NewOutputBuffer(maxSize)
	buf.Activate()

	// Write 2MB of data
	chunk := make([]byte, 1024)
	for i := range chunk {
		chunk[i] = byte('A' + (i % 26))
	}
	for i := 0; i < 2048; i++ {
		buf.Write(chunk)
	}

	result := buf.Drain()
	if len(result) > maxSize {
		t.Errorf("buffer should cap at %d bytes, got %d", maxSize, len(result))
	}
	if len(result) == 0 {
		t.Error("buffer should not be empty after writes")
	}
}

func TestOutputBuffer_ConcurrentWrites(t *testing.T) {
	buf := NewOutputBuffer(1024 * 1024)
	buf.Activate()

	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			data := []byte("concurrent write data\n")
			buf.Write(data)
		}(i)
	}
	wg.Wait()

	result := buf.Drain()
	if len(result) == 0 {
		t.Error("buffer should contain data after concurrent writes")
	}
}

func TestOutputBuffer_InactiveByDefault(t *testing.T) {
	buf := NewOutputBuffer(1024)

	// Buffer should not be active until explicitly activated
	if buf.IsActive() {
		t.Error("buffer should not be active by default")
	}

	buf.Activate()
	if !buf.IsActive() {
		t.Error("buffer should be active after Activate()")
	}

	buf.Deactivate()
	if buf.IsActive() {
		t.Error("buffer should not be active after Deactivate()")
	}
}

func TestOutputBuffer_WritesIgnoredWhenInactive(t *testing.T) {
	buf := NewOutputBuffer(1024)
	// Don't activate

	buf.Write([]byte("should be ignored"))
	result := buf.Drain()

	if len(result) != 0 {
		t.Errorf("inactive buffer should not store data, got %q", string(result))
	}
}

func TestOutputBuffer_WriteAfterActivate(t *testing.T) {
	buf := NewOutputBuffer(1024)

	buf.Write([]byte("before activate - ignored"))

	buf.Activate()
	buf.Write([]byte("after activate - stored"))

	result := buf.Drain()
	if string(result) != "after activate - stored" {
		t.Errorf("got %q, want %q", string(result), "after activate - stored")
	}
}

func containsSubstring(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(s) > 0 && findSubstring(s, sub))
}

func findSubstring(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
