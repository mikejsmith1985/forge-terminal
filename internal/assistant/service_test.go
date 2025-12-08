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
