// Package terminal provides tests for handler method refactoring.
package terminal

import (
	"testing"

	"github.com/mikejsmith1985/forge-terminal/internal/am"
	"github.com/mikejsmith1985/forge-terminal/internal/llm"
	"github.com/mikejsmith1985/forge-terminal/internal/terminal/vision"
)

// TestHandler_GetVisionParser tests accessing vision parser directly.
func TestHandler_GetVisionParser(t *testing.T) {
	// Setup
	amSystem := am.NewSystem(t.TempDir())
	visionRegistry := vision.NewRegistry()
	visionParser := vision.NewParser(8192, visionRegistry)
	llmDetector := llm.NewDetector()

	handler := NewHandlerDirect(amSystem, visionParser, llmDetector)

	// Test: Get vision parser
	result := handler.GetVisionParser()

	// Verify: Returns the same instance
	if result != visionParser {
		t.Error("GetVisionParser returned different instance")
	}
}

// TestHandler_GetVisionParser_Nil tests handling nil vision parser.
func TestHandler_GetVisionParser_Nil(t *testing.T) {
	// Setup: Create handler with nil vision parser
	handler := NewHandlerDirect(nil, nil, nil)

	// Test: Get vision parser
	result := handler.GetVisionParser()

	// Verify: Returns nil
	if result != nil {
		t.Error("Expected nil vision parser, got non-nil")
	}
}

// TestHandler_GetAMSystem tests accessing AM system directly.
func TestHandler_GetAMSystem(t *testing.T) {
	// Setup
	amSystem := am.NewSystem(t.TempDir())
	visionRegistry := vision.NewRegistry()
	visionParser := vision.NewParser(8192, visionRegistry)
	llmDetector := llm.NewDetector()

	handler := NewHandlerDirect(amSystem, visionParser, llmDetector)

	// Test: Get AM system
	result := handler.GetAMSystem()

	// Verify: Returns the same instance
	if result != amSystem {
		t.Error("GetAMSystem returned different instance")
	}
}

// TestHandler_GetAMSystem_Nil tests handling nil AM system.
func TestHandler_GetAMSystem_Nil(t *testing.T) {
	// Setup: Create handler with nil AM system
	handler := NewHandlerDirect(nil, nil, nil)

	// Test: Get AM system
	result := handler.GetAMSystem()

	// Verify: Returns nil
	if result != nil {
		t.Error("Expected nil AM system, got non-nil")
	}
}

// TestHandler_GetLLMDetector tests accessing LLM detector directly.
func TestHandler_GetLLMDetector(t *testing.T) {
	// Setup
	amSystem := am.NewSystem(t.TempDir())
	visionRegistry := vision.NewRegistry()
	visionParser := vision.NewParser(8192, visionRegistry)
	llmDetector := llm.NewDetector()

	handler := NewHandlerDirect(amSystem, visionParser, llmDetector)

	// Test: Get LLM detector
	result := handler.GetLLMDetector()

	// Verify: Returns the same instance
	if result != llmDetector {
		t.Error("GetLLMDetector returned different instance")
	}
}

// TestHandler_GetLLMDetector_Nil tests handling nil LLM detector.
func TestHandler_GetLLMDetector_Nil(t *testing.T) {
	// Setup: Create handler with nil LLM detector
	handler := NewHandlerDirect(nil, nil, nil)

	// Test: Get LLM detector
	result := handler.GetLLMDetector()

	// Verify: Returns nil
	if result != nil {
		t.Error("Expected nil LLM detector, got non-nil")
	}
}

// TestHandler_UseDirectFields tests that handler prefers direct fields over assistantCore.
func TestHandler_UseDirectFields(t *testing.T) {
	// Setup: Create handler with direct dependencies
	amSystem := am.NewSystem(t.TempDir())
	visionRegistry := vision.NewRegistry()
	visionParser := vision.NewParser(8192, visionRegistry)
	llmDetector := llm.NewDetector()

	handler := NewHandlerDirect(amSystem, visionParser, llmDetector)

	// Test: Access all three dependencies
	gotAM := handler.GetAMSystem()
	gotVision := handler.GetVisionParser()
	gotLLM := handler.GetLLMDetector()

	// Verify: All return the direct field values, not through assistantCore
	if gotAM != amSystem {
		t.Error("GetAMSystem did not return direct field")
	}
	if gotVision != visionParser {
		t.Error("GetVisionParser did not return direct field")
	}
	if gotLLM != llmDetector {
		t.Error("GetLLMDetector did not return direct field")
	}

	// Additional verification: If handler has assistantCore set (backward compat),
	// it should still prefer the direct fields
	if handler.amSystem != amSystem {
		t.Error("Handler's amSystem field doesn't match provided value")
	}
	if handler.visionParser != visionParser {
		t.Error("Handler's visionParser field doesn't match provided value")
	}
	if handler.llmDetector != llmDetector {
		t.Error("Handler's llmDetector field doesn't match provided value")
	}
}
