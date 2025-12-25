// Package terminal provides WebSocket terminal handler tests.
package terminal

import (
	"testing"

	"github.com/mikejsmith1985/forge-terminal/internal/am"
	"github.com/mikejsmith1985/forge-terminal/internal/llm"
	"github.com/mikejsmith1985/forge-terminal/internal/terminal/vision"
)

// TestNewHandlerWithDirectDependencies tests creating a handler with direct dependencies
// instead of through assistant.Core wrapper.
func TestNewHandlerWithDirectDependencies(t *testing.T) {
	// Setup: Create the three dependencies that Handler needs
	amSystem := am.NewSystem(t.TempDir()) // Use temp directory for tests
	visionRegistry := vision.NewRegistry()
	visionParser := vision.NewParser(8192, visionRegistry)
	llmDetector := llm.NewDetector()

	// Test: Create handler with direct dependencies
	handler := NewHandlerDirect(amSystem, visionParser, llmDetector)

	// Verify: Handler was created successfully
	if handler == nil {
		t.Fatal("NewHandlerDirect returned nil")
	}

	// Verify: Handler has non-nil fields
	if handler.amSystem == nil {
		t.Error("Handler.amSystem is nil")
	}
	if handler.visionParser == nil {
		t.Error("Handler.visionParser is nil")
	}
	if handler.llmDetector == nil {
		t.Error("Handler.llmDetector is nil")
	}
	// sync.Map is a struct, so just verify handler is not nil
	// (the sessions map is always initialized as part of the struct)
}

// TestNewHandlerDirect_NilAMSystem tests error handling for nil AM system.
func TestNewHandlerDirect_NilAMSystem(t *testing.T) {
	visionRegistry := vision.NewRegistry()
	visionParser := vision.NewParser(8192, visionRegistry)
	llmDetector := llm.NewDetector()

	// Test: Pass nil AM system
	handler := NewHandlerDirect(nil, visionParser, llmDetector)

	// Verify: Handler should still be created (nil check happens during use)
	if handler == nil {
		t.Fatal("NewHandlerDirect returned nil with nil amSystem")
	}
	
	// But the field should be nil
	if handler.amSystem != nil {
		t.Error("Expected nil amSystem but got non-nil")
	}
}

// TestNewHandlerDirect_NilVisionParser tests handling of nil vision parser.
func TestNewHandlerDirect_NilVisionParser(t *testing.T) {
	amSystem := am.NewSystem(t.TempDir())
	llmDetector := llm.NewDetector()

	// Test: Pass nil vision parser (vision can be disabled)
	handler := NewHandlerDirect(amSystem, nil, llmDetector)

	// Verify: Handler created successfully
	if handler == nil {
		t.Fatal("NewHandlerDirect returned nil with nil visionParser")
	}
	
	if handler.visionParser != nil {
		t.Error("Expected nil visionParser but got non-nil")
	}
}

// TestNewHandlerDirect_NilLLMDetector tests handling of nil LLM detector.
func TestNewHandlerDirect_NilLLMDetector(t *testing.T) {
	amSystem := am.NewSystem(t.TempDir())
	visionRegistry := vision.NewRegistry()
	visionParser := vision.NewParser(8192, visionRegistry)

	// Test: Pass nil LLM detector
	handler := NewHandlerDirect(amSystem, visionParser, nil)

	// Verify: Handler created successfully
	if handler == nil {
		t.Fatal("NewHandlerDirect returned nil with nil llmDetector")
	}
	
	if handler.llmDetector != nil {
		t.Error("Expected nil llmDetector but got non-nil")
	}
}

// TestNewHandlerDirect_AllNil tests creating handler with all nil dependencies.
func TestNewHandlerDirect_AllNil(t *testing.T) {
	// Test: Pass all nil dependencies (edge case)
	handler := NewHandlerDirect(nil, nil, nil)

	// Verify: Handler is still created with empty state
	if handler == nil {
		t.Fatal("NewHandlerDirect returned nil with all nil dependencies")
	}
	
	// All optional dependencies should be nil
	if handler.amSystem != nil {
		t.Error("Expected nil amSystem")
	}
	if handler.visionParser != nil {
		t.Error("Expected nil visionParser")
	}
	if handler.llmDetector != nil {
		t.Error("Expected nil llmDetector")
	}
	
	// sync.Map is always initialized as struct field
}

// TestHandlerFieldAccess tests that the handler provides access to its dependencies.
func TestHandlerFieldAccess(t *testing.T) {
	// Setup
	amSystem := am.NewSystem(t.TempDir())
	visionRegistry := vision.NewRegistry()
	visionParser := vision.NewParser(8192, visionRegistry)
	llmDetector := llm.NewDetector()

	handler := NewHandlerDirect(amSystem, visionParser, llmDetector)

	// Test: Access each field through getter methods (if they exist)
	// or verify they're accessible directly for internal use
	
	// The handler should store references correctly
	if handler.amSystem != amSystem {
		t.Error("Handler's amSystem doesn't match provided instance")
	}
	if handler.visionParser != visionParser {
		t.Error("Handler's visionParser doesn't match provided instance")
	}
	if handler.llmDetector != llmDetector {
		t.Error("Handler's llmDetector doesn't match provided instance")
	}
}

// TestHandlerUpgraderInitialized tests that the WebSocket upgrader is properly initialized.
func TestHandlerUpgraderInitialized(t *testing.T) {
	amSystem := am.NewSystem(t.TempDir())
	visionRegistry := vision.NewRegistry()
	visionParser := vision.NewParser(8192, visionRegistry)
	llmDetector := llm.NewDetector()

	handler := NewHandlerDirect(amSystem, visionParser, llmDetector)

	// Verify: Upgrader should be initialized (non-zero value)
	// The upgrader has a CheckOrigin function which should be set
	if handler.upgrader.CheckOrigin == nil {
		t.Error("Handler upgrader CheckOrigin not initialized")
	}
}
