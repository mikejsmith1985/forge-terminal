package providers

import (
	"context"

	"github.com/mikejsmith1985/forge-terminal/internal/assistant/types"
)

// AskOptions contains configuration for the generation request.
type AskOptions struct {
	Model       string
	Temperature float64
	Stream      bool
}

// AIProvider defines the interface for interacting with AI backends (Claude, Copilot, etc).
type AIProvider interface {
	// Ask sends a prompt to the provider and returns a channel of events.
	Ask(ctx context.Context, prompt string, opts AskOptions) (<-chan types.StreamEvent, error)

	// Cancel stops the current generation.
	Cancel() error

	// GetHistory returns the conversation history.
	GetHistory() ([]types.Message, error)
}
