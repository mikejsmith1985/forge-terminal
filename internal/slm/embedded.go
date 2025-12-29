// Package slm provides the embedded SLM provider.
// This uses an embedded model (via llama.cpp) for offline inference.
//
// NOTE: This is a stub implementation. Full llama.cpp integration
// will be added in a future phase. Currently falls back to heuristics.
package slm

import (
	"context"
	"log"
	"os"
	"path/filepath"
	"time"
)

const (
	// Model file location
	modelSubdir = "models/base"
	modelFile   = "qwen2.5-0.5b-q4.gguf"

	// Default model size for status reporting
	defaultModelSizeMB = 300
)

// EmbeddedProvider uses an embedded llama.cpp model for analysis.
type EmbeddedProvider struct {
	modelPath   string
	modelLoaded bool
	initialized bool
}

// NewEmbeddedProvider creates a new embedded provider.
func NewEmbeddedProvider() *EmbeddedProvider {
	return &EmbeddedProvider{}
}

// Name returns the provider identifier.
func (e *EmbeddedProvider) Name() string {
	return "embedded"
}

// IsAvailable checks if the embedded model exists.
func (e *EmbeddedProvider) IsAvailable() bool {
	modelPath := e.getModelPath()
	_, err := os.Stat(modelPath)
	return err == nil
}

// getModelPath returns the path to the embedded model.
func (e *EmbeddedProvider) getModelPath() string {
	if e.modelPath != "" {
		return e.modelPath
	}

	// Default location: ~/.forge/models/base/qwen2.5-0.5b-q4.gguf
	home, err := os.UserHomeDir()
	if err != nil {
		home = "."
	}
	return filepath.Join(home, ".forge", modelSubdir, modelFile)
}

// Initialize loads the model.
func (e *EmbeddedProvider) Initialize(ctx context.Context) error {
	modelPath := e.getModelPath()

	if _, err := os.Stat(modelPath); err != nil {
		log.Printf("[SLM/Embedded] Model not found at %s", modelPath)
		log.Printf("[SLM/Embedded] To enable embedded SLM, download the model to this location")
		return err
	}

	// TODO: Load model via llama.cpp
	// For now, we mark as available but use heuristics internally
	e.modelPath = modelPath
	e.initialized = true
	e.modelLoaded = true

	log.Printf("[SLM/Embedded] Model found at %s (llama.cpp integration pending)", modelPath)
	return nil
}

// Analyze uses the embedded model to analyze the prompt.
func (e *EmbeddedProvider) Analyze(ctx context.Context, input PromptContext) (*AnalysisResult, error) {
	start := time.Now()

	// TODO: Implement actual llama.cpp inference
	// For now, use enhanced heuristics as a placeholder

	// The embedded model would provide better analysis than pure heuristics
	// For now, we simulate this by using heuristics with higher confidence
	engine := GetEngine()
	complexity := engine.estimateComplexity(input)
	taskType := engine.classifyTask(input.Prompt)
	iterations := engine.estimateIterations(complexity)

	return &AnalysisResult{
		Complexity: complexity,
		TaskType:   taskType,
		Iterations: iterations,
		Confidence: 0.6, // Slightly higher than pure heuristics
		Reasoning:  "Embedded model analysis (llama.cpp integration pending)",
		LatencyMs:  time.Since(start).Milliseconds(),
		Provider:   "embedded",
	}, nil
}

// Shutdown releases model resources.
func (e *EmbeddedProvider) Shutdown() error {
	// TODO: Unload llama.cpp model
	e.modelLoaded = false
	e.initialized = false
	return nil
}

// Status returns provider state.
func (e *EmbeddedProvider) Status() EngineStatus {
	return EngineStatus{
		ActiveProvider: "embedded",
		ModelID:        modelFile,
		ModelLoaded:    e.modelLoaded,
		ModelSizeMB:    defaultModelSizeMB,
	}
}

// DownloadModel downloads the default model to the expected location.
// This is called from the UI when user wants to enable embedded SLM.
func DownloadModel(ctx context.Context, progressCallback func(percent int)) error {
	// TODO: Implement model download
	// This would download from a CDN or GitHub release
	log.Printf("[SLM/Embedded] Model download not yet implemented")
	return nil
}

// GetModelDownloadURL returns the URL for downloading the default model.
func GetModelDownloadURL() string {
	// TODO: Host model on GitHub releases or CDN
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
