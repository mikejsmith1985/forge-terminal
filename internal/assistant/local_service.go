// Package assistant provides the core AI assistant logic.
package assistant

import (
	"context"

	"github.com/mikejsmith1985/forge-terminal/internal/llm"
	"github.com/mikejsmith1985/forge-terminal/internal/terminal/vision"
)

// LocalService implements Service using direct in-process calls.
// This is the v1 implementation that runs everything locally.
type LocalService struct {
	core *Core
}

// NewLocalService creates a new local service implementation.
func NewLocalService(core *Core) *LocalService {
	return &LocalService{core: core}
}

// ProcessOutput analyzes terminal output and detects vision patterns.
func (s *LocalService) ProcessOutput(ctx context.Context, data []byte) (*vision.Match, error) {
	match := s.core.ProcessTerminalOutput(data)
	return match, nil
}

// DetectLLMCommand analyzes input to detect LLM commands.
func (s *LocalService) DetectLLMCommand(ctx context.Context, commandLine string) (*llm.DetectedCommand, error) {
	detected := s.core.DetectLLMCommand(commandLine)
	return detected, nil
}

// EnableVision enables vision pattern detection.
func (s *LocalService) EnableVision(ctx context.Context) error {
	s.core.EnableVision()
	return nil
}

// DisableVision disables vision pattern detection.
func (s *LocalService) DisableVision(ctx context.Context) error {
	s.core.DisableVision()
	return nil
}

// VisionEnabled returns whether vision is currently enabled.
func (s *LocalService) VisionEnabled(ctx context.Context) (bool, error) {
	enabled := s.core.VisionEnabled()
	return enabled, nil
}
