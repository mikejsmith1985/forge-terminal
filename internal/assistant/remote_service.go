// Package assistant provides the core AI assistant logic.
package assistant

import (
	"context"
	"fmt"

	"github.com/mikejsmith1985/forge-terminal/internal/llm"
	"github.com/mikejsmith1985/forge-terminal/internal/terminal/vision"
)

// RemoteService implements Service using HTTP calls to an assistant server.
// This is the v2 implementation stub for when the assistant runs as a separate service.
type RemoteService struct {
	baseURL string
	// client *http.Client - will be added in v2
}

// NewRemoteService creates a new remote service implementation.
func NewRemoteService(baseURL string) *RemoteService {
	return &RemoteService{
		baseURL: baseURL,
		// client: &http.Client{Timeout: 10 * time.Second}, - will be added in v2
	}
}

// ProcessOutput analyzes terminal output via HTTP API.
func (s *RemoteService) ProcessOutput(ctx context.Context, data []byte) (*vision.Match, error) {
	// TODO: Implement in v2
	// POST to s.baseURL + "/api/assistant/process"
	return nil, fmt.Errorf("remote service not implemented yet (v2 feature)")
}

// DetectLLMCommand analyzes input via HTTP API.
func (s *RemoteService) DetectLLMCommand(ctx context.Context, commandLine string) (*llm.DetectedCommand, error) {
	// TODO: Implement in v2
	// POST to s.baseURL + "/api/assistant/detect"
	return nil, fmt.Errorf("remote service not implemented yet (v2 feature)")
}

// EnableVision enables vision via HTTP API.
func (s *RemoteService) EnableVision(ctx context.Context) error {
	// TODO: Implement in v2
	// POST to s.baseURL + "/api/assistant/vision/enable"
	return fmt.Errorf("remote service not implemented yet (v2 feature)")
}

// DisableVision disables vision via HTTP API.
func (s *RemoteService) DisableVision(ctx context.Context) error {
	// TODO: Implement in v2
	// POST to s.baseURL + "/api/assistant/vision/disable"
	return fmt.Errorf("remote service not implemented yet (v2 feature)")
}

// VisionEnabled checks vision status via HTTP API.
func (s *RemoteService) VisionEnabled(ctx context.Context) (bool, error) {
	// TODO: Implement in v2
	// GET from s.baseURL + "/api/assistant/vision/status"
	return false, fmt.Errorf("remote service not implemented yet (v2 feature)")
}

// Chat sends a message via HTTP API.
func (s *RemoteService) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	// TODO: Implement in v2
	// POST to s.baseURL + "/api/assistant/chat"
	return nil, fmt.Errorf("remote service not implemented yet (v2 feature)")
}

// GetContext retrieves context via HTTP API.
func (s *RemoteService) GetContext(ctx context.Context, tabID string) (*TerminalContext, error) {
	// TODO: Implement in v2
	// GET from s.baseURL + "/api/assistant/context/" + tabID
	return nil, fmt.Errorf("remote service not implemented yet (v2 feature)")
}

// ExecuteCommand executes via HTTP API.
func (s *RemoteService) ExecuteCommand(ctx context.Context, req *ExecuteCommandRequest) (*ExecuteCommandResponse, error) {
	// TODO: Implement in v2
	// POST to s.baseURL + "/api/assistant/execute"
	return nil, fmt.Errorf("remote service not implemented yet (v2 feature)")
}

// GetStatus checks status via HTTP API.
func (s *RemoteService) GetStatus(ctx context.Context) (*OllamaStatusResponse, error) {
	// TODO: Implement in v2
	// GET from s.baseURL + "/api/assistant/status"
	return nil, fmt.Errorf("remote service not implemented yet (v2 feature)")
}

// SetModel changes the current Ollama model via HTTP API.
func (s *RemoteService) SetModel(ctx context.Context, model string) error {
	// TODO: Implement in v2
	// POST to s.baseURL + "/api/assistant/model"
	return fmt.Errorf("remote service not implemented yet (v2 feature)")
}
