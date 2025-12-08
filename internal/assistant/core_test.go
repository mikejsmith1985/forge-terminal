package assistant

import (
	"testing"

	"github.com/mikejsmith1985/forge-terminal/internal/am"
)

func TestNewCore(t *testing.T) {
	// Create a minimal AM system for testing
	amSystem := am.NewSystem("/tmp/test-am")
	
	core := NewCore(amSystem)
	
	if core == nil {
		t.Fatal("NewCore returned nil")
	}
	
	if core.visionParser == nil {
		t.Error("visionParser not initialized")
	}
	
	if core.visionRegistry == nil {
		t.Error("visionRegistry not initialized")
	}
	
	if core.llmDetector == nil {
		t.Error("llmDetector not initialized")
	}
	
	if core.amSystem == nil {
		t.Error("amSystem not initialized")
	}
}

func TestVisionEnableDisable(t *testing.T) {
	amSystem := am.NewSystem("/tmp/test-am")
	core := NewCore(amSystem)
	
	// Vision should be disabled by default
	if core.VisionEnabled() {
		t.Error("Vision should be disabled by default")
	}
	
	// Enable vision
	core.EnableVision()
	if !core.VisionEnabled() {
		t.Error("Vision should be enabled after EnableVision()")
	}
	
	// Disable vision
	core.DisableVision()
	if core.VisionEnabled() {
		t.Error("Vision should be disabled after DisableVision()")
	}
}

func TestProcessTerminalOutput(t *testing.T) {
	amSystem := am.NewSystem("/tmp/test-am")
	core := NewCore(amSystem)
	
	// Should return nil when vision is disabled
	match := core.ProcessTerminalOutput([]byte("git status"))
	if match != nil {
		t.Error("ProcessTerminalOutput should return nil when vision is disabled")
	}
	
	// Enable vision and test again
	core.EnableVision()
	// Note: actual pattern matching is tested in vision package
	// This just verifies the method works without crashing
	match = core.ProcessTerminalOutput([]byte("some output"))
	// match can be nil or non-nil depending on whether pattern is detected
}

func TestDetectLLMCommand(t *testing.T) {
	amSystem := am.NewSystem("/tmp/test-am")
	core := NewCore(amSystem)
	
	// Test with non-LLM command
	detected := core.DetectLLMCommand("ls -la")
	if detected == nil {
		t.Fatal("DetectLLMCommand should return non-nil result")
	}
	if detected.Detected {
		t.Error("'ls -la' should not be detected as LLM command")
	}
	
	// Test with GitHub Copilot command
	detected = core.DetectLLMCommand("gh copilot suggest")
	if detected == nil {
		t.Fatal("DetectLLMCommand should return non-nil result")
	}
	if !detected.Detected {
		t.Error("'gh copilot suggest' should be detected as LLM command")
	}
}

func TestGetters(t *testing.T) {
	amSystem := am.NewSystem("/tmp/test-am")
	core := NewCore(amSystem)
	
	if core.GetVisionParser() == nil {
		t.Error("GetVisionParser should return non-nil parser")
	}
	
	if core.GetLLMDetector() == nil {
		t.Error("GetLLMDetector should return non-nil detector")
	}
	
	if core.GetAMSystem() == nil {
		t.Error("GetAMSystem should return non-nil system")
	}
	
	if core.GetAMSystem() != amSystem {
		t.Error("GetAMSystem should return the same AM system passed to NewCore")
	}
}
