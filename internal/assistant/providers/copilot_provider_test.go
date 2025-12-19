package providers

import (
	"context"
	"testing"
	"time"
)

// TestCopilotProvider_RealExecution attempts to run the actual Copilot CLI.
// This is a "Live" test as requested by the charter.
func TestCopilotProvider_RealExecution(t *testing.T) {
	// 1. Initialize Provider
	// NOTE: NewCopilotProvider doesn't exist yet -> RED
	provider := NewCopilotProvider()

	// 2. Define a real prompt
	prompt := "Reply with exactly the word 'Pong'"
	opts := AskOptions{
		Model:  "GPT-4.1 (0x)", // As requested in the charter
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
	if fullContent == "" {
		t.Error("Expected content, got empty string")
	}
	t.Logf("Copilot replied: %s", fullContent)
}
