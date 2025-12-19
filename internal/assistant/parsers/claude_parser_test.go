package parsers

import (
	"testing"

	"github.com/mikejsmith1985/forge-terminal/internal/assistant/types"
)

func TestClaudeParser_ParseLine(t *testing.T) {
	parser := NewClaudeParser()

	tests := []struct {
		name     string
		input    string
		expected *types.StreamEvent
	}{
		{
			name:  "Text Delta",
			input: `{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}`,
			expected: &types.StreamEvent{
				Type:    "text",
				Content: "Hello",
			},
		},
		{
			name:  "Thinking Delta",
			input: `{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Analyzing request..."}}`,
			expected: &types.StreamEvent{
				Type:    "thinking",
				Content: "Analyzing request...",
			},
		},
		{
			name:  "Tool Use Start",
			input: `{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"tool_1","name":"bash_execute","input":{}}}`,
			expected: &types.StreamEvent{
				Type: "tool_use",
				Meta: map[string]interface{}{
					"id":   "tool_1",
					"name": "bash_execute",
				},
			},
		},
		{
			name:  "Message Stop",
			input: `{"type":"message_stop"}`,
			expected: &types.StreamEvent{
				Type: "done",
			},
		},
		{
			name:     "Ignored Event",
			input:    `{"type":"ping"}`,
			expected: nil,
		},
		{
			name:     "Invalid JSON",
			input:    `{invalid json}`,
			expected: nil, // Should handle gracefully
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			event, err := parser.ParseLine(tt.input)
			if err != nil && tt.expected != nil {
				t.Errorf("Unexpected error: %v", err)
			}

			if tt.expected == nil {
				if event != nil {
					t.Errorf("Expected nil event, got %v", event)
				}
				return
			}

			if event == nil {
				t.Errorf("Expected event %v, got nil", tt.expected)
				return
			}

			if event.Type != tt.expected.Type {
				t.Errorf("Expected type %s, got %s", tt.expected.Type, event.Type)
			}

			if event.Content != tt.expected.Content {
				t.Errorf("Expected content %s, got %s", tt.expected.Content, event.Content)
			}

			if tt.expected.Meta != nil {
				if event.Meta == nil {
					t.Errorf("Expected meta %v, got nil", tt.expected.Meta)
				} else {
					// Simple check for key existence/value for this test
					for k, v := range tt.expected.Meta {
						if event.Meta[k] != v {
							t.Errorf("Expected meta[%s]=%v, got %v", k, v, event.Meta[k])
						}
					}
				}
			}
		})
	}
}
