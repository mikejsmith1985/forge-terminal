package terminal

import (
	"testing"
)

func TestIsExecutiveTrigger(t *testing.T) {
	testCases := []struct {
		input    string
		expected bool
	}{
		{"? explain this", true},
		{"?explain this", true},
		{"? design architecture", true},
		{"?fix the bug", true},
		{"echo hello", false},
		{"? ", false},       // Empty prompt after ?
		{"?", false},        // Just ?
		{"hello?", false},   // ? not at start
		{"  ? test", true},  // Whitespace before ?
		{"", false},         // Empty
		{"  ", false},       // Just whitespace
	}

	for _, tc := range testCases {
		result := IsExecutiveTrigger(tc.input)
		if result != tc.expected {
			t.Errorf("IsExecutiveTrigger(%q) = %v, expected %v", tc.input, result, tc.expected)
		}
	}
}

func TestExtractPrompt(t *testing.T) {
	testCases := []struct {
		input    string
		expected string
	}{
		{"? explain this", "explain this"},
		{"?explain this", "explain this"},
		{"?  lots of spaces  ", "lots of spaces"},
		{"  ? test", "test"},
		{"? ", ""},
		{"?", ""},
	}

	for _, tc := range testCases {
		result := ExtractPrompt(tc.input)
		if result != tc.expected {
			t.Errorf("ExtractPrompt(%q) = %q, expected %q", tc.input, result, tc.expected)
		}
	}
}

func TestLineBuffer_Add(t *testing.T) {
	lb := NewLineBuffer()

	// No complete line yet
	lines := lb.Add([]byte("hello"))
	if len(lines) != 0 {
		t.Errorf("Expected no lines, got %d", len(lines))
	}

	// Complete line with Enter
	lines = lb.Add([]byte(" world\r"))
	if len(lines) != 1 {
		t.Errorf("Expected 1 line, got %d", len(lines))
	}
	if lines[0] != "hello world" {
		t.Errorf("Expected 'hello world', got '%s'", lines[0])
	}

	// Buffer should be reset
	if lb.Current() != "" {
		t.Errorf("Expected empty buffer, got '%s'", lb.Current())
	}
}

func TestLineBuffer_MultipleLines(t *testing.T) {
	lb := NewLineBuffer()

	// Multiple lines in one chunk
	lines := lb.Add([]byte("line1\rline2\nline3\r"))
	if len(lines) != 3 {
		t.Errorf("Expected 3 lines, got %d", len(lines))
	}
	if lines[0] != "line1" {
		t.Errorf("Expected 'line1', got '%s'", lines[0])
	}
	if lines[1] != "line2" {
		t.Errorf("Expected 'line2', got '%s'", lines[1])
	}
	if lines[2] != "line3" {
		t.Errorf("Expected 'line3', got '%s'", lines[2])
	}
}

func TestLineBuffer_EmptyLines(t *testing.T) {
	lb := NewLineBuffer()

	// Empty lines should be skipped
	lines := lb.Add([]byte("\r\r\n\n"))
	if len(lines) != 0 {
		t.Errorf("Expected no lines (empty lines skipped), got %d", len(lines))
	}
}

func TestLineBuffer_Reset(t *testing.T) {
	lb := NewLineBuffer()
	lb.Add([]byte("partial"))

	lb.Reset()

	if lb.Current() != "" {
		t.Errorf("Expected empty after reset, got '%s'", lb.Current())
	}
}

func TestStripANSILocal(t *testing.T) {
	testCases := []struct {
		input    string
		expected string
	}{
		{"plain text", "plain text"},
		{"\x1b[31mred\x1b[0m", "red"},
		{"\x1b[1;32mbold green\x1b[0m", "bold green"},
		{"no escapes", "no escapes"},
		{"\x1b[?25lhidden cursor\x1b[?25h", "hidden cursor"},
	}

	for _, tc := range testCases {
		result := stripANSILocal(tc.input)
		if result != tc.expected {
			t.Errorf("stripANSILocal(%q) = %q, expected %q", tc.input, result, tc.expected)
		}
	}
}

func TestTruncate(t *testing.T) {
	testCases := []struct {
		input    string
		maxLen   int
		expected string
	}{
		{"short", 10, "short"},
		{"exactly10c", 10, "exactly10c"},
		{"this is a long string", 10, "this is..."},
		{"", 5, ""},
	}

	for _, tc := range testCases {
		result := truncate(tc.input, tc.maxLen)
		if result != tc.expected {
			t.Errorf("truncate(%q, %d) = %q, expected %q", tc.input, tc.maxLen, result, tc.expected)
		}
	}
}
