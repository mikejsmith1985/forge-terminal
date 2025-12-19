package providers

import "context"

// Message represents a chat message in the conversation history.
type Message struct {
	Role    string                 `json:"role"` // "user", "assistant", "system"
	Content string                 `json:"content"`
	Meta    map[string]interface{} `json:"meta,omitempty"`
}

// AskOptions contains configuration for the generation request.
type AskOptions struct {
	Model       string
	Temperature float64
	Stream      bool
}

// StreamEvent represents a single event in the generation stream.
type StreamEvent struct {
	Type    string                 `json:"type"` // "thinking", "text", "tool_use", "tool_result", "error", "done"
	Content string                 `json:"content"`
	Meta    map[string]interface{} `json:"meta,omitempty"`
}

// AIProvider defines the interface for interacting with AI backends (Claude, Copilot, etc).
type AIProvider interface {
	// Ask sends a prompt to the provider and returns a channel of events.
	Ask(ctx context.Context, prompt string, opts AskOptions) (<-chan StreamEvent, error)

	// Cancel stops the current generation.
	Cancel() error

	// GetHistory returns the conversation history.
	GetHistory() ([]Message, error)
}
