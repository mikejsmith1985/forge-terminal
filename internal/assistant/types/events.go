package types

// StreamEvent represents a single event in the generation stream.
type StreamEvent struct {
	Type    string                 `json:"type"` // "thinking", "text", "tool_use", "tool_result", "error", "done"
	Content string                 `json:"content"`
	Meta    map[string]interface{} `json:"meta,omitempty"`
}

// Message represents a chat message in the conversation history.
type Message struct {
	Role    string                 `json:"role"` // "user", "assistant", "system"
	Content string                 `json:"content"`
	Meta    map[string]interface{} `json:"meta,omitempty"`
}
