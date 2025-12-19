package parsers

import (
	"testing"

	"github.com/mikejsmith1985/forge-terminal/internal/assistant/types"
)

func TestCopilotParser_ParseLine(t *testing.T) {
	parser := NewCopilotParser()

	tests := []struct {
		name     string
		input    string
		expected *types.StreamEvent
	}{
		{
			name:  "Standard Text",
			input: "Here is some code:",
			expected: &types.StreamEvent{
				Type:    "text",
				Content: "Here is some code:\n", // Copilot is line-based, so we preserve newlines
			},
		},
		{
			name:  "Empty Line",
			input: "",
			expected: &types.StreamEvent{
				Type:    "text",
				Content: "\n",
			},
		},
		// Copilot CLI doesn't output structured JSON for thinking/tools in the same way yet,
		// so for now we treat everything as text unless we identify specific markers.
		// Future expansion: Detect "Suggestion:" or specific CLI markers.
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			event, err := parser.ParseLine(tt.input)
			if err != nil {
				t.Errorf("Unexpected error: %v", err)
			}

			if event == nil {
				t.Errorf("Expected event %v, got nil", tt.expected)
				return
			}

			if event.Type != tt.expected.Type {
				t.Errorf("Expected type %s, got %s", tt.expected.Type, event.Type)
			}

			if event.Content != tt.expected.Content {
				t.Errorf("Expected content %q, got %q", tt.expected.Content, event.Content)
			}
		})
	}
}
