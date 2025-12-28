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
	eb.AddPending([]byte{0x7F}) // Backspace - removes 'l', adds backspace
	eb.AddPending([]byte("lo"))

	// After "hel" + backspace + "lo":
	// 1. "hel" added -> pending = "hel"
	// 2. backspace -> removes 'l', adds 0x7F -> pending = "he" + 0x7F
	// 3. "lo" added -> pending = "he" + 0x7F + "lo"

	// Expected pending: "he\x7Flo" (5 bytes)
	if eb.Len() != 5 {
		t.Errorf("Expected 5 pending bytes, got %d", eb.Len())
	}
}

func TestEchoBuffer_BackspaceEchoPattern(t *testing.T) {
	eb := NewEchoBuffer()
	
	// User types "ab" then backspace
	eb.AddPending([]byte("ab"))
	eb.AddPending([]byte{0x7F}) // Backspace
	
	// After "ab" + backspace:
	// 1. "ab" added -> pending = "ab"
	// 2. backspace -> removes 'b', adds 0x7F -> pending = "a\x7F"
	
	// PTY echoes: "a" (we already consumed 'b'), then backspace pattern (0x08 0x20 0x08)
	// Actually PTY echoes the original "ab" then the backspace effect
	// But our pending only has "a\x7F" now
	
	// PTY output: "a" + backspace pattern + AI response
	ptyEcho := []byte{'a', 0x08, 0x20, 0x08, 'X', 'Y', 'Z'}
	
	filtered := eb.FilterEcho(ptyEcho)
	
	// Should filter out "a" and the backspace pattern
	// Should pass through "XYZ" (AI output)
	if string(filtered) != "XYZ" {
		t.Errorf("Expected 'XYZ' after filtering, got '%s' (hex: %x)", string(filtered), filtered)
	}
}

func TestEchoBuffer_MultipleBackspaces(t *testing.T) {
	eb := NewEchoBuffer()
	
	// User types "abc" then 2 backspaces then "de"
	eb.AddPending([]byte("abc"))
	eb.AddPending([]byte{0x7F, 0x7F}) // Two backspaces
	eb.AddPending([]byte("de"))
	
	// After processing:
	// "abc" -> pending = "abc"
	// first backspace -> removes 'c', adds 0x7F -> pending = "ab\x7F"
	// second backspace -> removes 'b', adds 0x7F -> pending = "a\x7F\x7F"
	// "de" -> pending = "a\x7F\x7Fde"
	
	if eb.Len() != 5 {
		t.Errorf("Expected 5 pending bytes, got %d", eb.Len())
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
