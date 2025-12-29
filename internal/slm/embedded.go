// Package slm provides the rule-based complexity analyzer.
// This is a lightweight, fast, pure-Go implementation that requires no
// external dependencies. For AI-powered analysis, use Ollama.
//
// Architecture Decision (v3.5.2):
// True embedded LLM inference in Go without CGO is experimental.
// We provide a tiered approach:
// 1. Ollama (if installed) - Full AI analysis, free, local
// 2. RuleBasedProvider (this) - Fast heuristic analysis, always available
//
// The rule-based analyzer uses proven heuristics for complexity estimation:
// - Token count analysis
// - Keyword detection (debug, refactor, etc.)
// - Code pattern recognition
// - Context-aware scoring
package slm

import (
	"context"
	"log"
	"os"
	"path/filepath"
	"time"
)

const (
	// Model configuration for future embedded LLM support
	modelSubdir       = "models"
	modelFile         = "qwen2.5-0.5b-q4.gguf"
	defaultModelSizeMB = 400
)

// RuleBasedProvider uses proven heuristics for fast complexity analysis.
// This is the fallback when no AI providers are available.
// Confidence is lower than AI-based analysis but performance is instant.
type RuleBasedProvider struct {
	initialized bool
}

// NewRuleBasedProvider creates a new rule-based analyzer.
func NewRuleBasedProvider() *RuleBasedProvider {
	return &RuleBasedProvider{}
}

// NewEmbeddedProvider is an alias for backward compatibility.
// Returns a RuleBasedProvider since true embedded LLM is not yet production-ready.
func NewEmbeddedProvider() *RuleBasedProvider {
	return NewRuleBasedProvider()
}

// Name returns the provider identifier.
func (r *RuleBasedProvider) Name() string {
	return "rule-based"
}

// IsAvailable always returns true - rule-based analysis is always available.
func (r *RuleBasedProvider) IsAvailable() bool {
	return true
}

// Initialize prepares the provider (no-op for rule-based).
func (r *RuleBasedProvider) Initialize(ctx context.Context) error {
	r.initialized = true
	log.Printf("[SLM/RuleBased] Initialized - fast heuristic analysis ready")
	return nil
}

// Analyze uses heuristics to analyze the prompt complexity.
func (r *RuleBasedProvider) Analyze(ctx context.Context, input PromptContext) (*AnalysisResult, error) {
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
		Confidence: 0.5, // Moderate confidence for heuristic analysis
		Reasoning:  "Rule-based analysis using keyword and pattern detection",
		LatencyMs:  time.Since(start).Milliseconds(),
		Provider:   "rule-based",
	}, nil
}

// Shutdown releases resources (no-op for rule-based).
func (r *RuleBasedProvider) Shutdown() error {
	r.initialized = false
	return nil
}

// Status returns provider state.
func (r *RuleBasedProvider) Status() EngineStatus {
	return EngineStatus{
		ActiveProvider: "rule-based",
		ModelLoaded:    r.initialized,
	}
}

// DownloadModel downloads the default model to the expected location.
// This is called from the UI when user wants to enable embedded SLM.
func DownloadModel(ctx context.Context, progressCallback func(percent int)) error {
	// For now, log that users should install Ollama instead
	log.Printf("[SLM] For AI-powered analysis, install Ollama: https://ollama.ai")
	log.Printf("[SLM] Then run: ollama pull qwen2.5:0.5b")
	return nil
}

// GetModelDownloadURL returns the URL for downloading the default model.
func GetModelDownloadURL() string {
	return "https://github.com/mikejsmith1985/forge-terminal/releases/download/v3.5.0/qwen2.5-0.5b-q4.gguf"
}

// GetExpectedModelPath returns where the model should be located.
func GetExpectedModelPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		home = "."
	}
	return filepath.Join(home, ".forge", modelSubdir, modelFile)
}
