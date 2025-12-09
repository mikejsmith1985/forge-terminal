package llm

import (
	"strings"
	"testing"
)

// TestCleanANSI_StandardCSI tests standard CSI sequences with ESC byte
func TestCleanANSI_StandardCSI(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "simple color code",
			input:    "\x1b[31mRed text\x1b[0m",
			expected: "Red text",
		},
		{
			name:     "cursor hide/show",
			input:    "\x1b[?25l Hidden cursor \x1b[?25h",
			expected: " Hidden cursor ",
		},
		{
			name:     "bracketed paste mode",
			input:    "\x1b[?2004h Some text \x1b[?2004l",
			expected: " Some text ",
		},
		{
			name:     "multiple sequences",
			input:    "\x1b[1;31mBold Red\x1b[0m Normal \x1b[32mGreen\x1b[0m",
			expected: "Bold Red Normal Green",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := CleanANSI(tc.input)
			if result != tc.expected {
				t.Errorf("CleanANSI(%q) = %q, want %q", tc.input, result, tc.expected)
			}
		})
	}
}

// TestCleanANSI_OrphanedCSI tests orphaned CSI sequences (ESC byte already stripped)
// This is the critical fix - these are the patterns that were NOT being cleaned before
func TestCleanANSI_OrphanedCSI(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "orphaned cursor hide",
			input:    "[?25l Welcome",
			expected: " Welcome",
		},
		{
			name:     "orphaned cursor show",
			input:    "Text [?25h more",
			expected: "Text  more",
		},
		{
			name:     "orphaned bracketed paste start",
			input:    "[?2004h Some text",
			expected: " Some text",
		},
		{
			name:     "orphaned bracketed paste end",
			input:    "Text [?2004l",
			expected: "Text ",
		},
		{
			name:     "multiple orphaned sequences",
			input:    "[?25l[?2026h Claude Code v2.0.61",
			expected: " Claude Code v2.0.61",
		},
		{
			name:     "orphaned color codes",
			input:    "[31mRed[0m Normal",
			expected: "Red Normal",
		},
		{
			name:     "real corrupted sample from bug",
			input:    "claude\r\n\r[?25l[?25h[?2026h\r\n Claude Code v2.0.61",
			expected: "claude\r\n\r\r\n Claude Code v2.0.61",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := CleanANSI(tc.input)
			if result != tc.expected {
				t.Errorf("CleanANSI(%q) = %q, want %q", tc.input, result, tc.expected)
			}
		})
	}
}

// TestCleanANSI_MixedSequences tests a mix of proper and orphaned sequences
func TestCleanANSI_MixedSequences(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "proper ESC followed by orphaned",
			input:    "\x1b[?25l Prefix [?25h Suffix",
			expected: " Prefix  Suffix",
		},
		{
			name:     "orphaned followed by proper ESC",
			input:    "[?25l Prefix \x1b[?25h Suffix",
			expected: " Prefix  Suffix",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := CleanANSI(tc.input)
			if result != tc.expected {
				t.Errorf("CleanANSI(%q) = %q, want %q", tc.input, result, tc.expected)
			}
		})
	}
}

// TestCleanANSI_NoArtifactsRemain verifies no ANSI artifacts remain after cleaning
func TestCleanANSI_NoArtifactsRemain(t *testing.T) {
	inputs := []string{
		"[?25l[?25h[?2026h Welcome",
		"\x1b[?25l\x1b[?25h\x1b[?2026h Welcome",
		"[31mRed[0m Normal [?25l hidden",
		"\x1b[1;31mBold\x1b[0m [?2004h paste",
	}

	for _, input := range inputs {
		result := CleanANSI(input)

		// Check for orphaned CSI patterns
		if strings.Contains(result, "[?") {
			t.Errorf("CleanANSI(%q) still contains '[?': %q", input, result)
		}

		// Check for ESC bytes
		if strings.Contains(result, "\x1b") {
			t.Errorf("CleanANSI(%q) still contains ESC byte: %q", input, result)
		}

		// Check for standard CSI pattern remnants
		if strings.Contains(result, "[0m") || strings.Contains(result, "[31m") {
			t.Errorf("CleanANSI(%q) still contains CSI remnants: %q", input, result)
		}
	}
}

// TestParseCopilotOutput tests the Copilot-specific parser
func TestParseCopilotOutput(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		contains string
		excludes []string
	}{
		{
			name:     "removes TUI frames",
			input:    "╭─────╮\n│Hello│\n╰─────╯",
			contains: "Hello",
			excludes: []string{"╭", "╮", "│", "╰", "╯", "─"},
		},
		{
			name:     "removes footer",
			input:    "Content here\nCtrl+c Exit\nMore content",
			contains: "Content here",
			excludes: []string{"Ctrl+c Exit"},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := ParseCopilotOutput(tc.input)
			if !strings.Contains(result, tc.contains) {
				t.Errorf("ParseCopilotOutput should contain %q, got: %q", tc.contains, result)
			}
			for _, excl := range tc.excludes {
				if strings.Contains(result, excl) {
					t.Errorf("ParseCopilotOutput should NOT contain %q, got: %q", excl, result)
				}
			}
		})
	}
}

// TestParseClaudeOutput tests the Claude-specific parser
func TestParseClaudeOutput(t *testing.T) {
	input := "[?25l[?2026h Claude response here [?25h"
	result := ParseClaudeOutput(input)

	if strings.Contains(result, "[?") {
		t.Errorf("ParseClaudeOutput should remove ANSI, got: %q", result)
	}
	if !strings.Contains(result, "Claude response here") {
		t.Errorf("ParseClaudeOutput should preserve content, got: %q", result)
	}
}

// TestParseLLMOutput_ProviderRouting tests that providers route correctly
func TestParseLLMOutput_ProviderRouting(t *testing.T) {
	input := "[?25l Test content [?25h"

	// All providers should clean ANSI
	providers := []Provider{ProviderGitHubCopilot, ProviderClaude, Provider("unknown")}

	for _, provider := range providers {
		result := ParseLLMOutput(input, provider)
		if strings.Contains(result, "[?") {
			t.Errorf("ParseLLMOutput with provider %q should remove ANSI, got: %q", provider, result)
		}
	}
}
