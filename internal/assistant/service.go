// Package assistant provides the core AI assistant logic.
package assistant

import (
	"context"

	"github.com/mikejsmith1985/forge-terminal/internal/llm"
	"github.com/mikejsmith1985/forge-terminal/internal/terminal/vision"
)

// Service is the interface for assistant operations.
// This abstraction allows the terminal to work with either:
// - LocalService (v1): Direct in-process calls
// - RemoteService (v2): HTTP calls to assistant server
type Service interface {
	// ProcessOutput analyzes terminal output and detects vision patterns.
	ProcessOutput(ctx context.Context, data []byte) (*vision.Match, error)

	// DetectLLMCommand analyzes input to detect LLM commands.
	DetectLLMCommand(ctx context.Context, commandLine string) (*llm.DetectedCommand, error)

	// EnableVision enables vision pattern detection.
	EnableVision(ctx context.Context) error

	// DisableVision disables vision pattern detection.
	DisableVision(ctx context.Context) error

	// VisionEnabled returns whether vision is currently enabled.
	VisionEnabled(ctx context.Context) (bool, error)

	// Chat sends a message to the assistant and gets a response.
	Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error)

	// GetContext retrieves the current terminal context for a tab.
	GetContext(ctx context.Context, tabID string) (*TerminalContext, error)

	// ExecuteCommand executes a command in the specified terminal tab.
	ExecuteCommand(ctx context.Context, req *ExecuteCommandRequest) (*ExecuteCommandResponse, error)

	// GetStatus checks if the assistant (Ollama) is available.
	GetStatus(ctx context.Context) (*OllamaStatusResponse, error)

	// SetModel changes the current Ollama model.
	SetModel(ctx context.Context, model string) error
}
