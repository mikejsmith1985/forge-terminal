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
}
