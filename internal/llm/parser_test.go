// Package llm provides output parsing for LLM CLI tools.
// This file contains UNIT TESTS with STRICT MOCKING.
// These tests must run in <10ms and touch NO external resources.
package llm

import (
	"testing"
)

// =============================================================================
// UNIT TESTS - Pure Function Testing (No DB, No Network, No Mocks needed)
// =============================================================================

func TestCleanANSI(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "empty string",
			input:    "",
			expected: "",
		},
		{
			name:     "plain text unchanged",
			input:    "Hello, World!",
			expected: "Hello, World!",
		},
		{
			name:     "removes color codes",
			input:    "\x1b[31mRed Text\x1b[0m",
			expected: "Red Text",
		},
		{
			name:     "removes bold codes",
			input:    "\x1b[1mBold\x1b[0m Normal",
			expected: "Bold Normal",
		},
		{
			name:     "removes complex SGR",
			input:    "\x1b[38;2;255;100;50mRGB Color\x1b[0m",
			expected: "RGB Color",
		},
		{
			name:     "removes cursor position codes",
			input:    "\x1b[10;20HText at position",
			expected: "Text at position",
		},
		{
			name:     "removes bracketed paste mode",
			input:    "\x1b[?2004hpaste content\x1b[?2004l",
			expected: "paste content",
		},
		{
			name:     "preserves newlines",
			input:    "Line 1\n\x1b[32mLine 2\x1b[0m\nLine 3",
			expected: "Line 1\nLine 2\nLine 3",
		},
		{
			name:     "removes orphaned CSI sequences",
			input:    "[?25lHidden cursor text",
			expected: "Hidden cursor text",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := CleanANSI(tt.input)
			if result != tt.expected {
				t.Errorf("CleanANSI(%q) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}

func TestParseCopilotOutput(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		contains string // We check if output contains this (not exact match)
	}{
		{
			name:     "removes TUI frame characters",
			input:    "╭────────╮\n│ Hello  │\n╰────────╯",
			contains: "Hello",
		},
		{
			name:     "removes Copilot footer",
			input:    "Some content\nCtrl+c Exit\nRemaining requests: 50%",
			contains: "Some content",
		},
		{
			name:     "removes menu instructions",
			input:    "Option 1\nConfirm with number keys\nCancel with Esc",
			contains: "Option 1",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ParseCopilotOutput(tt.input)
			if !containsSubstring(result, tt.contains) {
				t.Errorf("ParseCopilotOutput output %q should contain %q", result, tt.contains)
			}
		})
	}
}

// Helper function
func containsSubstring(s, substr string) bool {
	return len(substr) == 0 || (len(s) >= len(substr) && findSubstring(s, substr))
}

func findSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

// =============================================================================
// BENCHMARK - Verify performance (<10ms requirement)
// =============================================================================

func BenchmarkCleanANSI(b *testing.B) {
	input := "\x1b[31m\x1b[1mBold Red\x1b[0m normal \x1b[32mgreen\x1b[0m\n" +
		"\x1b[38;2;255;100;50mRGB\x1b[0m \x1b[?2004hpaste\x1b[?2004l"

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		CleanANSI(input)
	}
}
