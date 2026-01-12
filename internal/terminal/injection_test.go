package terminal

import (
	"strings"
	"testing"
)

// TestInjectionLogic verifies the byte manipulation logic used in handlePTY.
// It simulates the logic found in handler.go:1014-1080 without spinning up a full WebSocket server.
func TestInjectionLogic(t *testing.T) {
	// Setup context
	sessionID := "test-session"
	cm := NewContextManager()
	instruction := "BE CONCISE"
	cm.SetContext(sessionID, &PersistentContext{
		Enabled: true,
		Text:    instruction,
	})

	tests := []struct {
		name           string
		inputBuffer    string // What has been typed so far
		inputData      []byte // The current keystroke (usually Enter)
		expectedOutput string // What should be written to PTY
	}{
		{
			name:           "Copilot Query",
			inputBuffer:    "copilot what is 2+2",
			inputData:      []byte("\r"),
			expectedOutput: " " + instruction + "\r",
		},
		{
			name:           "Copilot Bare (No Injection)",
			inputBuffer:    "copilot",
			inputData:      []byte("\r"),
			expectedOutput: "\r", // Should just be the enter key
		},
		{
			name:           "Copilot Flags (No Injection)",
			inputBuffer:    "copilot --allow-all-tools",
			inputData:      []byte("\r"),
			expectedOutput: "\r",
		},
		{
			name:           "Shell Command",
			inputBuffer:    "ls -la",
			inputData:      []byte("\r"),
			expectedOutput: "\r",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Simulate the logic in handler.go
			
			// 1. Accumulate buffer (simulate previous typing)
			// Actually handler.go uses a local `inputBuffer strings.Builder`.
			var buffer strings.Builder
			buffer.WriteString(tt.inputBuffer)
			
			// 2. Process the input Data
			dataStr := string(tt.inputData)
			buffer.WriteString(dataStr) // handler logic adds it before checking
			
			// 3. Logic extraction
			dataToWrite := tt.inputData
			
			if strings.Contains(dataStr, "\r") || strings.Contains(dataStr, "\n") {
				commandLine := strings.TrimSpace(strings.TrimRight(buffer.String(), "\r\n"))
				
				// Reset buffer
				buffer.Reset()
				
				isLLM := IsLLMCommand(commandLine)
				hasPrompt := HasLLMPrompt(commandLine)
				
				if isLLM && hasPrompt {
					ctx := cm.GetContext(sessionID)
					if ctx != nil && ctx.Enabled && ctx.Text != "" {
						terminator := "\r"
						if strings.Contains(dataStr, "\n") {
							terminator = "\n"
						}
						
						// CURRENT IMPLEMENTATION (Simulated)
						// This mimics the logic we want to test
						injectedText := " " + ctx.Text + terminator
						dataToWrite = []byte(injectedText)
					}
				}
			}
			
			// 4. Verify Output
			if string(dataToWrite) != tt.expectedOutput {
				t.Errorf("Expected output %q, got %q", tt.expectedOutput, string(dataToWrite))
			}
		})
	}
}
