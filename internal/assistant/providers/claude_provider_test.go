package providers

import (
	"context"
	"testing"
	"time"
)

// TestClaudeProvider_RealExecution attempts to run the actual Claude CLI.
// This is a "Live" test as requested by the charter.
func TestClaudeProvider_RealExecution(t *testing.T) {
	// Skip if we are in a CI environment without the tool, but for this task
	// we assume the tool is present (as verified by the agent).
	
	// 1. Initialize Provider
	provider := NewClaudeProvider()

	// 2. Define a real prompt
	prompt := "Reply with exactly the word 'Pong'"
	opts := AskOptions{
		Model:  "claude-3-5-sonnet-20241022", // Default high-end model
		Stream: true,
	}

	// 3. Execute Ask
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	stream, err := provider.Ask(ctx, prompt, opts)
	if err != nil {
		t.Fatalf("Failed to start ask: %v", err)
	}

	// 4. Consume Stream
	var fullContent string
	for event := range stream {
		if event.Type == "error" {
			t.Errorf("Received error event: %s", event.Content)
		}
		if event.Type == "text" {
			fullContent += event.Content
		}
	}

	// 5. Verify Output
	// We expect "Pong" or something very close.
	if fullContent == "" {
		t.Error("Expected content, got empty string")
	}
	t.Logf("Claude replied: %s", fullContent)
}
