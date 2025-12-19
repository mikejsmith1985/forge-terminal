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

// CopilotProvider implements AIProvider for the GitHub Copilot CLI.
type CopilotProvider struct {
	parser *parsers.CopilotParser
	mu     sync.Mutex
	cmd    *exec.Cmd
}

// NewCopilotProvider creates a new instance of CopilotProvider.
func NewCopilotProvider() *CopilotProvider {
	return &CopilotProvider{
		parser: parsers.NewCopilotParser(),
	}
}

// Ask sends a prompt to Copilot via the CLI and streams the response.
func (p *CopilotProvider) Ask(ctx context.Context, prompt string, opts AskOptions) (<-chan types.StreamEvent, error) {
	events := make(chan types.StreamEvent)

	// Prepare the command
	// copilot -p "prompt" --allow-all-tools
	// We might need to handle the model selection if the CLI supports it via flags,
	// otherwise it might be an env var or config.
	// For now, we pass the prompt via -p.
	// Use "gh copilot suggest" or "gh copilot explain" wrapper if "copilot" binary isn't direct
	// But assuming "copilot" is the alias/binary name as per charter.
	
	// IMPORTANT: We use 'gh copilot suggest' for now as it's the standard CLI interface
	// If the user has a standalone 'copilot' binary, we can switch to that.
	// For now, let's try to detect or default to 'gh copilot suggest' style if needed,
	// but the charter implies a direct 'copilot' command.
	// We'll stick to 'copilot' binary for now as per existing code, but add error handling.
	
	args := []string{"-p", prompt, "--allow-all-tools"}
	
	// Support for specific models (e.g., "copilot-opus", "copilot-haiku")
	// If opts.Model is provided and not "default", pass it to the CLI
	if opts.Model != "" && opts.Model != "default" && opts.Model != "copilot-chat" {
		// Assuming the CLI supports a --model flag
		// If the model name contains "copilot-", strip it (e.g. "copilot-opus" -> "opus")
		// or pass as is if the CLI expects full names.
		// For now, we pass it as --model <model>
		args = append(args, "--model", opts.Model)
	}
	
	cmd := exec.CommandContext(ctx, "copilot", args...)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to get stdout pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("failed to start copilot: %w", err)
	}

	p.mu.Lock()
	p.cmd = cmd
	p.mu.Unlock()

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
				continue
			}
			if event != nil {
				events <- *event
			}
		}

		if err := cmd.Wait(); err != nil {
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
func (p *CopilotProvider) Cancel() error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.cmd != nil && p.cmd.Process != nil {
		return p.cmd.Process.Kill()
	}
	return nil
}

// GetHistory returns the conversation history.
func (p *CopilotProvider) GetHistory() ([]types.Message, error) {
	return []types.Message{}, nil
}
