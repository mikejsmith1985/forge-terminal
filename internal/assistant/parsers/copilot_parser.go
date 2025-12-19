package parsers

import (
	"github.com/mikejsmith1985/forge-terminal/internal/assistant/types"
)

// CopilotParser handles parsing of GitHub Copilot CLI output.
// Currently, Copilot CLI outputs raw text to stdout.
type CopilotParser struct{}

// NewCopilotParser creates a new instance of CopilotParser.
func NewCopilotParser() *CopilotParser {
	return &CopilotParser{}
}

// ParseLine takes a single line of text output and converts it to a StreamEvent.
func (p *CopilotParser) ParseLine(line string) (*types.StreamEvent, error) {
	// Copilot CLI output is unstructured text.
	// We append a newline because ReadString('\n') or Scanner.Text() usually strips it,
	// but for raw text reconstruction we want to preserve line breaks.
	return &types.StreamEvent{
		Type:    "text",
		Content: line + "\n",
	}, nil
}
