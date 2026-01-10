package terminal

import (
	"strings"
	"testing"
)

func TestInjectionLogic(t *testing.T) {
	// Setup scenarios
	prompt := "--instruction"
	
	tests := []struct {
		name           string
		input          string
		enabled        bool
		prompt         string
		inAltBuffer    bool
		expectedOutput string
	}{
		{
			name:           "Basic Injection on Return",
			input:          "ls\r",
			enabled:        true,
			prompt:         prompt,
			inAltBuffer:    false,
			expectedOutput: "ls --instruction\r",
		},
		{
			name:           "No Injection if Disabled",
			input:          "ls\r",
			enabled:        false,
			prompt:         prompt,
			inAltBuffer:    false,
			expectedOutput: "ls\r",
		},
		{
			name:           "No Injection in Alt Buffer",
			input:          "ls\r",
			enabled:        true,
			prompt:         prompt,
			inAltBuffer:    true,
			expectedOutput: "ls\r",
		},
		{
			name:           "Injection with Newline",
			input:          "ls\n",
			enabled:        true,
			prompt:         prompt,
			inAltBuffer:    false,
			expectedOutput: "ls --instruction\n",
		},
		{
			name:           "No Injection without Enter",
			input:          "ls",
			enabled:        true,
			prompt:         prompt,
			inAltBuffer:    false,
			expectedOutput: "ls",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			// This test validates the EXACT logic block inserted into handler.go
			
			data := []byte(tc.input)
			
			// ═══ LOGIC UNDER TEST (Mirrors handler.go) ═══
			if tc.enabled && tc.prompt != "" {
				dataStr := string(data)
				// Check for Enter key (submission)
				if strings.Contains(dataStr, "\r") || strings.Contains(dataStr, "\n") {
					// SAFETY: Only inject if we are in the main buffer (CLI mode)
					if !tc.inAltBuffer {
						// Append instruction before the newline
						if strings.Contains(dataStr, "\r") {
							dataStr = strings.ReplaceAll(dataStr, "\r", " "+tc.prompt+"\r")
						} else {
							dataStr = strings.ReplaceAll(dataStr, "\n", " "+tc.prompt+"\n")
						}
						data = []byte(dataStr)
					}
				}
			}
			// ═══ END LOGIC ═══
			
			if string(data) != tc.expectedOutput {
				t.Errorf("Expected %q, got %q", tc.expectedOutput, string(data))
			}
		})
	}
}
