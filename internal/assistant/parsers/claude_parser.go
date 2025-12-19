package parsers

import (
	"encoding/json"
	"strings"

	"github.com/mikejsmith1985/forge-terminal/internal/assistant/types"
)

// ClaudeParser handles parsing of Claude's stream-json output format.
type ClaudeParser struct{}

// NewClaudeParser creates a new instance of ClaudeParser.
func NewClaudeParser() *ClaudeParser {
	return &ClaudeParser{}
}

// ClaudeEvent represents the raw JSON structure from Claude CLI.
type ClaudeEvent struct {
	Type         string          `json:"type"`
	Index        int             `json:"index,omitempty"`
	Delta        *ClaudeDelta    `json:"delta,omitempty"`
	ContentBlock *ClaudeContent  `json:"content_block,omitempty"`
	Usage        json.RawMessage `json:"usage,omitempty"`
}

type ClaudeDelta struct {
	Type     string `json:"type"`
	Text     string `json:"text,omitempty"`
	Thinking string `json:"thinking,omitempty"`
}

type ClaudeContent struct {
	Type  string          `json:"type"`
	ID    string          `json:"id,omitempty"`
	Name  string          `json:"name,omitempty"`
	Input json.RawMessage `json:"input,omitempty"`
}

// ParseLine takes a single line of JSON output and converts it to a StreamEvent.
func (p *ClaudeParser) ParseLine(line string) (*types.StreamEvent, error) {
	line = strings.TrimSpace(line)
	if line == "" {
		return nil, nil
	}

	var event ClaudeEvent
	if err := json.Unmarshal([]byte(line), &event); err != nil {
		// Log error but don't fail the stream, just skip bad lines
		return nil, nil
	}

	switch event.Type {
	case "content_block_delta":
		if event.Delta != nil {
			switch event.Delta.Type {
			case "text_delta":
				return &types.StreamEvent{
					Type:    "text",
					Content: event.Delta.Text,
				}, nil
			case "thinking_delta":
				return &types.StreamEvent{
					Type:    "thinking",
					Content: event.Delta.Thinking,
				}, nil
			}
		}
	case "content_block_start":
		if event.ContentBlock != nil && event.ContentBlock.Type == "tool_use" {
			return &types.StreamEvent{
				Type: "tool_use",
				Meta: map[string]interface{}{
					"id":   event.ContentBlock.ID,
					"name": event.ContentBlock.Name,
				},
			}, nil
		}
	case "message_stop":
		return &types.StreamEvent{
			Type: "done",
		}, nil
	}

	return nil, nil
}
