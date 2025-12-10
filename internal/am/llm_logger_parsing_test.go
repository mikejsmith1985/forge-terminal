package am

import (
	"strings"
	"testing"
)

func TestCleanUserInput_ANSIRemoval(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "OSC sequence with RGB color",
			input:    "\x1b]11;rgb:0a0a/0a0a/0a0a\x1b\\tell me a joke\r",
			expected: "tell me a joke",
		},
		{
			name:     "CSI color codes",
			input:    "\x1b[31mred text\x1b[0m\r",
			expected: "red text",
		},
		{
			name:     "Multiple ANSI sequences",
			input:    "\x1b[2J\x1b[Hhello\x1b[1m world\r",
			expected: "hello world",
		},
		{
			name:     "Backspace handling",
			input:    "hello\x7f\x7flo world\r",
			expected: "hello world",
		},
		{
			name:     "Clean input",
			input:    "simple input\r",
			expected: "simple input",
		},
		{
			name:     "Prompt characters removed",
			input:    "> user input\r",
			expected: "user input",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := CleanUserInput(tt.input)
			if result != tt.expected {
				t.Errorf("CleanUserInput() = %q, want %q", result, tt.expected)
				t.Errorf("Input bytes: %v", []byte(tt.input))
				t.Errorf("Result bytes: %v", []byte(result))
			}
		})
	}
}

func TestExtractCopilotResponse(t *testing.T) {
	logger := &LLMLogger{}
	
	tests := []struct {
		name     string
		content  string
		wantLen  int
		contains string
	}{
		{
			name: "Simple response",
			content: `Welcome to GitHub Copilot CLI
────────────────────────────────────────
> tell me a joke
────────────────────────────────────────
Why do programmers prefer dark mode? Because light attracts bugs!
────────────────────────────────────────
Ctrl+c Exit`,
			wantLen:  30,
			contains: "programmers prefer dark mode",
		},
		{
			name: "Multi-line response",
			content: `> explain recursion
────────────────────────────────────────
Recursion is a programming technique where a function calls itself.
To understand recursion, you first need to understand recursion.
────────────────────────────────────────`,
			wantLen:  50,
			contains: "function calls itself",
		},
		{
			name: "No response (just prompt)",
			content: `Welcome to GitHub Copilot CLI
────────────────────────────────────────
>  Enter @ to mention files or / for commands
────────────────────────────────────────
Ctrl+c Exit`,
			wantLen:  0,
			contains: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := logger.extractCopilotResponseFromSnapshot(tt.content)
			
			if tt.wantLen == 0 {
				if len(result) > 0 {
					t.Errorf("Expected no response, got: %q", result)
				}
				return
			}
			
			if len(result) < tt.wantLen {
				t.Errorf("Response too short: got %d chars, want at least %d", len(result), tt.wantLen)
			}
			
			if tt.contains != "" && !strings.Contains(result, tt.contains) {
				t.Errorf("Response doesn't contain %q, got: %q", tt.contains, result)
			}
		})
	}
}

func TestANSIPatternMatching(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		removed bool
	}{
		{
			name:    "OSC with backslash terminator",
			input:   "\x1b]11;rgb:0a0a/0a0a/0a0a\x1b\\",
			removed: true,
		},
		{
			name:    "OSC with BEL terminator",
			input:   "\x1b]0;Title\x07",
			removed: true,
		},
		{
			name:    "CSI sequence",
			input:   "\x1b[31m",
			removed: true,
		},
		{
			name:    "DCS sequence",
			input:   "\x1bP1$r\x1b\\",
			removed: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ansiPattern.ReplaceAllString(tt.input, "")
			if tt.removed && result != "" {
				t.Errorf("ANSI not removed: input=%q result=%q", tt.input, result)
			}
			if !tt.removed && result == "" {
				t.Errorf("Content incorrectly removed: input=%q", tt.input)
			}
		})
	}
}
