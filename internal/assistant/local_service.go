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

// Chat sends a message to the assistant and gets a response.
func (s *LocalService) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	// Use RAG engine only if it has documents indexed
	ragEngine := s.core.GetRAGEngine()
	if ragEngine != nil && ragEngine.IsReady() {
		config := DefaultRAGConfig()
		return ragEngine.ContextualChat(ctx, req.Message, config)
	}
	
	// Fallback to simple knowledge base + ollama
	// Get terminal context if requested
	var termCtx *TerminalContext
	if req.IncludeContext {
		termCtxResult, err := s.GetContext(ctx, req.TabID)
		if err == nil {
			termCtx = termCtxResult
		}
	}

	// Build messages with context
	messages := BuildContextPrompt(termCtx, req.Message)

	// Call Ollama
	ollamaClient := s.core.GetOllamaClient()
	response, err := ollamaClient.Chat(ctx, messages)
	if err != nil {
		return nil, err
	}

	return &ChatResponse{
		Message: response,
	}, nil
}

// GetContext retrieves the current terminal context for a tab.
func (s *LocalService) GetContext(ctx context.Context, tabID string) (*TerminalContext, error) {
	// TODO: Implement actual context gathering from terminal sessions
	// For now, return a basic context
	// This will need to be wired up to the terminal handler
	return &TerminalContext{
		WorkingDirectory: ".", // Will be filled by terminal handler
		RecentCommands:   []string{},
		RecentOutput:     "",
		SessionID:        tabID,
	}, nil
}

// ExecuteCommand executes a command in the specified terminal tab.
func (s *LocalService) ExecuteCommand(ctx context.Context, req *ExecuteCommandRequest) (*ExecuteCommandResponse, error) {
	// TODO: Implement command execution
	// This will need to inject the command into the terminal's PTY
	// For now, return not implemented
	return &ExecuteCommandResponse{
		Success: false,
		Error:   "Command execution not yet implemented",
	}, nil
}

// GetStatus checks if Ollama is available.
func (s *LocalService) GetStatus(ctx context.Context) (*OllamaStatusResponse, error) {
	ollamaClient := s.core.GetOllamaClient()
	
	available := ollamaClient.IsAvailable(ctx)
	if !available {
		return &OllamaStatusResponse{
			Available: false,
			Error:     "Ollama is not running or not accessible",
		}, nil
	}

	models, err := ollamaClient.GetModels(ctx)
	if err != nil {
		return &OllamaStatusResponse{
			Available:    true,
			CurrentModel: ollamaClient.GetCurrentModel(),
			Error:        "Connected but failed to list models: " + err.Error(),
		}, nil
	}

	return &OllamaStatusResponse{
		Available:    true,
		Models:       models,
		CurrentModel: ollamaClient.GetCurrentModel(),
	}, nil
}

// SetModel changes the current Ollama model.
func (s *LocalService) SetModel(ctx context.Context, model string) error {
	ollamaClient := s.core.GetOllamaClient()
	ollamaClient.SetModel(model)
	return nil
}

