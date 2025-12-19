package providers

import (
	"bufio"
	"context"
	"fmt"
	"os/exec"
	"sync"

	"github.com/mikejsmith1985/forge-terminal/internal/assistant/parsers"
	"github.com/mikejsmith1985/forge-terminal/internal/assistant/types"
)

// ClaudeProvider implements AIProvider for the Claude CLI.
type ClaudeProvider struct {
	parser *parsers.ClaudeParser
	mu     sync.Mutex
	cmd    *exec.Cmd
	cancel context.CancelFunc
}

// NewClaudeProvider creates a new instance of ClaudeProvider.
func NewClaudeProvider() *ClaudeProvider {
	return &ClaudeProvider{
		parser: parsers.NewClaudeParser(),
	}
}

// Ask sends a prompt to Claude via the CLI and streams the response.
func (p *ClaudeProvider) Ask(ctx context.Context, prompt string, opts AskOptions) (<-chan types.StreamEvent, error) {
	// Create a channel for events
	events := make(chan types.StreamEvent)

	// Prepare the command
	// claude -p "prompt" --output-format stream-json
	// Note: We use "claude.cmd" or "claude.ps1" on Windows if "claude" isn't directly executable,
	// but usually "claude" works if in PATH. We'll try "claude" first.
	cmd := exec.CommandContext(ctx, "claude", "-p", prompt, "--output-format", "stream-json")
	
	// Capture stdout
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to get stdout pipe: %w", err)
	}

	// Capture stderr for debugging
	// stderr, _ := cmd.StderrPipe()

	// Start the command
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("failed to start claude: %w", err)
	}

	p.mu.Lock()
	p.cmd = cmd
	p.mu.Unlock()

	// Process output in a goroutine
	go func() {
		defer close(events)
		defer func() {
			p.mu.Lock()
			p.cmd = nil
			p.mu.Unlock()
		}()

		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			event, err := p.parser.ParseLine(line)
			if err != nil {
				// Log error but continue
				continue
			}
			if event != nil {
				events <- *event
			}
		}

		// Wait for command to finish
		if err := cmd.Wait(); err != nil {
			// If context was canceled, this is expected
			if ctx.Err() != nil {
				return
			}
			events <- types.StreamEvent{
				Type:    "error",
				Content: fmt.Sprintf("Process exited with error: %v", err),
			}
		}
	}()

	return events, nil
}

// Cancel stops the current generation.
func (p *ClaudeProvider) Cancel() error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.cmd != nil && p.cmd.Process != nil {
		return p.cmd.Process.Kill()
	}
	return nil
}

// GetHistory returns the conversation history.
// For the CLI wrapper, this might be tricky unless we track it ourselves or query the CLI.
// For now, we return empty.
func (p *ClaudeProvider) GetHistory() ([]types.Message, error) {
	return []types.Message{}, nil
}
