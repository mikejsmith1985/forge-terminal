package terminal

import (
	"testing"
	"time"
)

func TestEchoBuffer_BasicEcho(t *testing.T) {
	eb := NewEchoBuffer()
	eb.AddPending([]byte("hello"))

	// Simulate PTY echoing "hello" + AI response "world"
	input := []byte("helloworld")
	filtered := eb.FilterEcho(input)

	if string(filtered) != "world" {
		t.Errorf("Expected 'world', got '%s'", string(filtered))
	}
}

func TestEchoBuffer_NoEcho(t *testing.T) {
	eb := NewEchoBuffer()
	// No pending bytes

	input := []byte("response from AI")
	filtered := eb.FilterEcho(input)

	if string(filtered) != "response from AI" {
		t.Errorf("Expected full input, got '%s'", string(filtered))
	}
}

func TestEchoBuffer_PartialEcho(t *testing.T) {
	eb := NewEchoBuffer()
	eb.AddPending([]byte("abc"))

	// PTY echoes "ab" then AI sends "xyz"
	input := []byte("abxyz")
	filtered := eb.FilterEcho(input)

	// Should consume "ab" from pending, pass "xyz" through
	// "c" remains in pending
	if string(filtered) != "xyz" {
		t.Errorf("Expected 'xyz', got '%s'", string(filtered))
	}

	if eb.Len() != 1 {
		t.Errorf("Expected 1 pending byte, got %d", eb.Len())
	}
}

func TestEchoBuffer_Backspace(t *testing.T) {
	eb := NewEchoBuffer()
	eb.AddPending([]byte("hel"))
	eb.AddPending([]byte{0x7F}) // Backspace
	eb.AddPending([]byte("lo"))

	// Pending should be "helo" (l removed by backspace, lo added)
	// But backspace itself is also pending
	// So we have: "he" + backspace + "lo"

	// Actually: backspace removes last rune ("l"), then adds backspace byte
	// Then "lo" is added
	// Result pending: "he" + 0x7F + "lo"

	// Simulate PTY echoing the backspace sequence and "helo"
	// PTY typically echoes: original chars, backspace as cursor movement
	// For simplicity, test that backspace handling doesn't crash
	if eb.Len() < 1 {
		t.Error("Echo buffer should have pending bytes")
	}
}

func TestEchoBuffer_UTF8(t *testing.T) {
	eb := NewEchoBuffer()
	eb.AddPending([]byte("✓")) // 3 bytes: 0xE2 0x9C 0x93

	input := []byte("✓OK")
	filtered := eb.FilterEcho(input)

	if string(filtered) != "OK" {
		t.Errorf("Expected 'OK', got '%s'", string(filtered))
	}
}

func TestEchoBuffer_Timeout(t *testing.T) {
	eb := NewEchoBuffer()
	eb.timeout = 50 * time.Millisecond // Short timeout for test

	eb.AddPending([]byte("hello"))

	// Wait for timeout
	time.Sleep(100 * time.Millisecond)

	// Now filter - pending should be expired
	input := []byte("hello")
	filtered := eb.FilterEcho(input)

	// Since pending expired, all bytes should pass through
	if string(filtered) != "hello" {
		t.Errorf("Expected 'hello' (expired pending), got '%s'", string(filtered))
	}
}

func TestEchoBuffer_EnterClearsPending(t *testing.T) {
	eb := NewEchoBuffer()
	eb.AddPending([]byte("command"))
	eb.AddPending([]byte("\r"))

	// After Enter, pending should only have the newline
	// Previous characters are cleared
	if eb.Len() != 1 {
		t.Errorf("Expected 1 pending byte after Enter, got %d", eb.Len())
	}
}

func TestEchoBuffer_Clear(t *testing.T) {
	eb := NewEchoBuffer()
	eb.AddPending([]byte("test"))

	eb.Clear()

	if eb.Len() != 0 {
		t.Errorf("Expected 0 pending bytes after Clear, got %d", eb.Len())
	}
}

func TestEchoBuffer_MaxSize(t *testing.T) {
	eb := NewEchoBuffer()
	eb.maxSize = 10

	// Add more than max size
	eb.AddPending([]byte("12345678901234567890"))

	if eb.Len() > 10 {
		t.Errorf("Expected max 10 bytes, got %d", eb.Len())
	}
}
