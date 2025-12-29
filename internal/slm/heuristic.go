// Package slm provides the heuristic provider as a fallback.
package slm

import (
	"context"
	"time"
)

// HeuristicProvider provides rule-based prompt analysis.
// Used as fallback when no SLM is available.
type HeuristicProvider struct {
	initialized bool
}

// NewHeuristicProvider creates a new heuristic provider.
func NewHeuristicProvider() *HeuristicProvider {
	return &HeuristicProvider{}
}

// Name returns the provider identifier.
func (h *HeuristicProvider) Name() string {
	return "heuristic"
}

// IsAvailable always returns true for heuristic provider.
func (h *HeuristicProvider) IsAvailable() bool {
	return true
}

// Initialize prepares the provider.
func (h *HeuristicProvider) Initialize(ctx context.Context) error {
	h.initialized = true
	return nil
}

// Analyze uses heuristics to analyze the prompt.
func (h *HeuristicProvider) Analyze(ctx context.Context, input PromptContext) (*AnalysisResult, error) {
	start := time.Now()

	// Use the engine's heuristic methods
	engine := GetEngine()
	complexity := engine.estimateComplexity(input)
	taskType := engine.classifyTask(input.Prompt)
	iterations := engine.estimateIterations(complexity)

	return &AnalysisResult{
		Complexity: complexity,
		TaskType:   taskType,
		Iterations: iterations,
		Confidence: 0.4, // Low confidence for pure heuristics
		Reasoning:  "Rule-based analysis",
		LatencyMs:  time.Since(start).Milliseconds(),
		Provider:   "heuristic",
	}, nil
}

// Shutdown releases resources.
func (h *HeuristicProvider) Shutdown() error {
	return nil
}

// Status returns provider state.
func (h *HeuristicProvider) Status() EngineStatus {
	return EngineStatus{
		ActiveProvider: "heuristic",
		ModelLoaded:    true,
	}
}
