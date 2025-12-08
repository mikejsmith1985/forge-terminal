package assistant

import (
	"context"
	"testing"

	"github.com/mikejsmith1985/forge-terminal/internal/am"
)

func TestLocalService(t *testing.T) {
	amSystem := am.NewSystem("/tmp/test-am")
	core := NewCore(amSystem)
	service := NewLocalService(core)
	
	ctx := context.Background()
	
	// Test ProcessOutput
	match, err := service.ProcessOutput(ctx, []byte("test output"))
	if err != nil {
		t.Errorf("ProcessOutput returned error: %v", err)
	}
	// match can be nil if no pattern detected
	_ = match
	
	// Test DetectLLMCommand
	detected, err := service.DetectLLMCommand(ctx, "ls -la")
	if err != nil {
		t.Errorf("DetectLLMCommand returned error: %v", err)
	}
	if detected == nil {
		t.Error("DetectLLMCommand should return non-nil result")
	}
	if detected.Detected {
		t.Error("'ls -la' should not be detected as LLM command")
	}
	
	// Test vision enable/disable
	enabled, err := service.VisionEnabled(ctx)
	if err != nil {
		t.Errorf("VisionEnabled returned error: %v", err)
	}
	if enabled {
		t.Error("Vision should be disabled by default")
	}
	
	err = service.EnableVision(ctx)
	if err != nil {
		t.Errorf("EnableVision returned error: %v", err)
	}
	
	enabled, err = service.VisionEnabled(ctx)
	if err != nil {
		t.Errorf("VisionEnabled returned error: %v", err)
	}
	if !enabled {
		t.Error("Vision should be enabled after EnableVision")
	}
	
	err = service.DisableVision(ctx)
	if err != nil {
		t.Errorf("DisableVision returned error: %v", err)
	}
	
	enabled, err = service.VisionEnabled(ctx)
	if err != nil {
		t.Errorf("VisionEnabled returned error: %v", err)
	}
	if enabled {
		t.Error("Vision should be disabled after DisableVision")
	}
}

func TestLocalServiceImplementsInterface(t *testing.T) {
	// Compile-time check that LocalService implements Service
	var _ Service = (*LocalService)(nil)
}

func TestRemoteServiceImplementsInterface(t *testing.T) {
	// Compile-time check that RemoteService implements Service
	var _ Service = (*RemoteService)(nil)
}

func TestRemoteServiceStub(t *testing.T) {
	service := NewRemoteService("http://localhost:9898")
	ctx := context.Background()
	
	// All methods should return "not implemented" errors for now
	_, err := service.ProcessOutput(ctx, []byte("test"))
	if err == nil {
		t.Error("RemoteService.ProcessOutput should return error (not implemented)")
	}
	
	_, err = service.DetectLLMCommand(ctx, "test")
	if err == nil {
		t.Error("RemoteService.DetectLLMCommand should return error (not implemented)")
	}
	
	err = service.EnableVision(ctx)
	if err == nil {
		t.Error("RemoteService.EnableVision should return error (not implemented)")
	}
	
	err = service.DisableVision(ctx)
	if err == nil {
		t.Error("RemoteService.DisableVision should return error (not implemented)")
	}
	
	_, err = service.VisionEnabled(ctx)
	if err == nil {
		t.Error("RemoteService.VisionEnabled should return error (not implemented)")
	}
}

func TestLocalService_Chat(t *testing.T) {
amSystem := am.NewSystem("/tmp/test-am-chat")
core := NewCore(amSystem)
service := NewLocalService(core)
ctx := context.Background()

// Test chat without Ollama (will fail, but tests the path)
req := &ChatRequest{
Message:        "Hello",
TabID:          "test-tab",
IncludeContext: true,
}

resp, err := service.Chat(ctx, req)
// We expect an error since Ollama isn't running
if err == nil {
t.Log("Chat succeeded (Ollama might be running)")
if resp == nil {
t.Error("Chat response should not be nil when successful")
}
} else {
// Expected error - Ollama not available
if resp != nil {
t.Error("Chat response should be nil on error")
}
}
}

func TestLocalService_GetContext(t *testing.T) {
amSystem := am.NewSystem("/tmp/test-am-ctx")
core := NewCore(amSystem)
service := NewLocalService(core)
ctx := context.Background()

termCtx, err := service.GetContext(ctx, "test-tab")
if err != nil {
t.Errorf("GetContext error: %v", err)
}
if termCtx == nil {
t.Fatal("GetContext returned nil")
}
if termCtx.SessionID != "test-tab" {
t.Errorf("SessionID = %v, want test-tab", termCtx.SessionID)
}
}

func TestLocalService_ExecuteCommand(t *testing.T) {
amSystem := am.NewSystem("/tmp/test-am-exec")
core := NewCore(amSystem)
service := NewLocalService(core)
ctx := context.Background()

req := &ExecuteCommandRequest{
Command: "ls",
TabID:   "test-tab",
}

resp, err := service.ExecuteCommand(ctx, req)
if err != nil {
t.Errorf("ExecuteCommand error: %v", err)
}
if resp == nil {
t.Fatal("ExecuteCommand returned nil")
}
// Should return not implemented for now
if resp.Success {
t.Error("ExecuteCommand should not succeed (not implemented)")
}
if resp.Error == "" {
t.Error("ExecuteCommand should return error message")
}
}

func TestLocalService_GetStatus(t *testing.T) {
amSystem := am.NewSystem("/tmp/test-am-status")
core := NewCore(amSystem)
service := NewLocalService(core)
ctx := context.Background()

status, err := service.GetStatus(ctx)
if err != nil {
t.Errorf("GetStatus error: %v", err)
}
if status == nil {
t.Fatal("GetStatus returned nil")
}

// Ollama likely not running in test environment
if status.Available {
t.Log("Ollama is available in test environment")
if len(status.Models) == 0 {
t.Error("If Ollama is available, models list should not be empty")
}
} else {
// Expected - Ollama not running
if status.Error == "" {
t.Error("Status should have error message when unavailable")
}
}
}

func TestCore_GetOllamaClient(t *testing.T) {
amSystem := am.NewSystem("/tmp/test-am-ollama")
core := NewCore(amSystem)

client := core.GetOllamaClient()
if client == nil {
t.Fatal("GetOllamaClient returned nil")
}
if client.baseURL == "" {
t.Error("OllamaClient baseURL should not be empty")
}
if client.model == "" {
t.Error("OllamaClient model should not be empty")
}
}

func TestRemoteService_NewMethods(t *testing.T) {
service := NewRemoteService("http://localhost:9898")
ctx := context.Background()

// Test new assistant methods return not implemented
_, err := service.Chat(ctx, &ChatRequest{Message: "test"})
if err == nil {
t.Error("RemoteService.Chat should return error (not implemented)")
}

_, err = service.GetContext(ctx, "test-tab")
if err == nil {
t.Error("RemoteService.GetContext should return error (not implemented)")
}

_, err = service.ExecuteCommand(ctx, &ExecuteCommandRequest{Command: "ls"})
if err == nil {
t.Error("RemoteService.ExecuteCommand should return error (not implemented)")
}

_, err = service.GetStatus(ctx)
if err == nil {
t.Error("RemoteService.GetStatus should return error (not implemented)")
}
}
