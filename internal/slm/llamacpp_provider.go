// Package slm provides llama.cpp subprocess-based inference.
// This uses a bundled llama-cli binary for GGUF model inference.
// NO external API calls - completely free and local.
package slm

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"
)

const (
	// Binary names for different platforms
	llamaCliBinaryWindows = "llama-cli.exe"
	llamaCliBinaryUnix    = "llama-cli"
	
	// Default inference settings
	defaultContextSize = 512
	defaultThreads     = 4
	defaultMaxTokens   = 256
)

// LlamaCppProvider uses llama-cli subprocess for inference.
// This is a REAL implementation - no stubs, no external APIs.
type LlamaCppProvider struct {
	binaryPath  string
	modelPath   string
	initialized bool
}

// NewLlamaCppProvider creates a new llama.cpp subprocess provider.
func NewLlamaCppProvider() *LlamaCppProvider {
	return &LlamaCppProvider{}
}

// Name returns the provider identifier.
func (l *LlamaCppProvider) Name() string {
	return "llama-cpp"
}

// IsAvailable checks if llama-cli binary and model exist.
func (l *LlamaCppProvider) IsAvailable() bool {
	binaryPath := l.findBinary()
	if binaryPath == "" {
		return false
	}
	
	modelPath := GetExpectedModelPath()
	if _, err := os.Stat(modelPath); err != nil {
		return false
	}
	
	l.binaryPath = binaryPath
	l.modelPath = modelPath
	return true
}

// findBinary looks for llama-cli in expected locations.
func (l *LlamaCppProvider) findBinary() string {
	binaryName := llamaCliBinaryUnix
	if runtime.GOOS == "windows" {
		binaryName = llamaCliBinaryWindows
	}
	
	// Check paths in order of preference
	searchPaths := []string{}
	
	// 1. Same directory as forge executable
	if execPath, err := os.Executable(); err == nil {
		searchPaths = append(searchPaths, filepath.Join(filepath.Dir(execPath), binaryName))
	}
	
	// 2. ~/.forge/bin/
	if home, err := os.UserHomeDir(); err == nil {
		searchPaths = append(searchPaths, filepath.Join(home, ".forge", "bin", binaryName))
	}
	
	// 3. System PATH
	if pathBinary, err := exec.LookPath(binaryName); err == nil {
		searchPaths = append(searchPaths, pathBinary)
	}
	
	// 4. Current working directory
	if cwd, err := os.Getwd(); err == nil {
		searchPaths = append(searchPaths, filepath.Join(cwd, binaryName))
	}
	
	for _, path := range searchPaths {
		if _, err := os.Stat(path); err == nil {
			return path
		}
	}
	
	return ""
}

// Initialize verifies the binary and model work.
func (l *LlamaCppProvider) Initialize(ctx context.Context) error {
	if !l.IsAvailable() {
		return fmt.Errorf("llama-cli binary or model not found")
	}
	
	// Verify binary works
	cmd := exec.CommandContext(ctx, l.binaryPath, "--version")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("llama-cli not working: %w (%s)", err, string(output))
	}
	
	log.Printf("[SLM/LlamaCpp] Initialized: binary=%s, model=%s", l.binaryPath, l.modelPath)
	l.initialized = true
	return nil
}

// Analyze uses llama-cli to analyze the prompt complexity.
func (l *LlamaCppProvider) Analyze(ctx context.Context, input PromptContext) (*AnalysisResult, error) {
	if !l.initialized {
		return nil, fmt.Errorf("llama-cpp provider not initialized")
	}
	
	start := time.Now()
	
	// Build the analysis prompt
	prompt := l.buildPrompt(input)
	
	// Run llama-cli
	output, err := l.runInference(ctx, prompt)
	if err != nil {
		return nil, fmt.Errorf("llama-cli inference failed: %w", err)
	}
	
	// Parse response
	result, err := l.parseResponse(output)
	if err != nil {
		log.Printf("[SLM/LlamaCpp] Parse error, using fallback: %v", err)
		result = l.fallbackParse(output)
	}
	
	result.LatencyMs = time.Since(start).Milliseconds()
	result.Provider = "llama-cpp"
	
	log.Printf("[SLM/LlamaCpp] Analysis complete: complexity=%d, task=%s, latency=%dms",
		result.Complexity, result.TaskType, result.LatencyMs)
	
	return result, nil
}

// buildPrompt creates the prompt for analysis.
func (l *LlamaCppProvider) buildPrompt(input PromptContext) string {
	return fmt.Sprintf(`<|im_start|>system
You analyze coding tasks and return JSON with complexity (1-10), taskType (debug/explain/refactor/generate/simple), and reasoning.
<|im_end|>
<|im_start|>user
Analyze this task:
"%s"

Context: %d files, hasError=%v, tokens=%d

Respond with JSON only:
{"complexity": N, "taskType": "TYPE", "reasoning": "why"}
<|im_end|>
<|im_start|>assistant
`,
		input.Prompt,
		input.FileCount,
		input.HasErrorOutput,
		input.EstimatedTokens,
	)
}

// runInference executes llama-cli with the prompt.
func (l *LlamaCppProvider) runInference(ctx context.Context, prompt string) (string, error) {
	// Build command
	args := []string{
		"-m", l.modelPath,
		"-p", prompt,
		"-n", strconv.Itoa(defaultMaxTokens),
		"-c", strconv.Itoa(defaultContextSize),
		"-t", strconv.Itoa(defaultThreads),
		"--temp", "0.1",
		"--no-display-prompt",
	}
	
	cmd := exec.CommandContext(ctx, l.binaryPath, args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("inference error: %w, output: %s", err, string(output))
	}
	
	return string(output), nil
}

// parseResponse extracts structured data from the model output.
func (l *LlamaCppProvider) parseResponse(output string) (*AnalysisResult, error) {
	// Find JSON in output
	jsonStart := strings.Index(output, "{")
	jsonEnd := strings.LastIndex(output, "}")
	if jsonStart < 0 || jsonEnd <= jsonStart {
		return nil, fmt.Errorf("no JSON found in output")
	}
	
	jsonStr := output[jsonStart : jsonEnd+1]
	
	var response struct {
		Complexity int    `json:"complexity"`
		TaskType   string `json:"taskType"`
		Reasoning  string `json:"reasoning"`
	}
	
	if err := json.Unmarshal([]byte(jsonStr), &response); err != nil {
		return nil, fmt.Errorf("JSON parse error: %w", err)
	}
	
	// Map task type
	taskType := mapTaskTypeString(response.TaskType)
	complexity := clampInt(response.Complexity, 1, 10)
	
	return &AnalysisResult{
		Complexity: complexity,
		TaskType:   taskType,
		Iterations: buildIterationsMap(complexity),
		Confidence: 0.8, // High confidence for real local AI
		Reasoning:  response.Reasoning,
	}, nil
}

// fallbackParse extracts what it can using regex.
func (l *LlamaCppProvider) fallbackParse(output string) *AnalysisResult {
	complexity := 5 // default
	taskType := TaskUnknown
	reasoning := "Local SLM analysis"
	
	// Try to extract complexity
	complexityRe := regexp.MustCompile(`"complexity"\s*:\s*(\d+)`)
	if m := complexityRe.FindStringSubmatch(output); len(m) > 1 {
		if c, err := strconv.Atoi(m[1]); err == nil {
			complexity = clampInt(c, 1, 10)
		}
	}
	
	// Try to extract task type
	taskRe := regexp.MustCompile(`"taskType"\s*:\s*"(\w+)"`)
	if m := taskRe.FindStringSubmatch(output); len(m) > 1 {
		taskType = mapTaskTypeString(m[1])
	}
	
	// Try to extract reasoning
	reasonRe := regexp.MustCompile(`"reasoning"\s*:\s*"([^"]+)"`)
	if m := reasonRe.FindStringSubmatch(output); len(m) > 1 {
		reasoning = m[1]
	}
	
	return &AnalysisResult{
		Complexity: complexity,
		TaskType:   taskType,
		Iterations: buildIterationsMap(complexity),
		Confidence: 0.6, // Lower for fallback parse
		Reasoning:  reasoning,
	}
}

// Shutdown releases resources.
func (l *LlamaCppProvider) Shutdown() error {
	l.initialized = false
	return nil
}

// Status returns provider state.
func (l *LlamaCppProvider) Status() EngineStatus {
	return EngineStatus{
		ActiveProvider: "llama-cpp",
		ModelID:        filepath.Base(l.modelPath),
		ModelLoaded:    l.initialized,
	}
}

// Helper functions

func mapTaskTypeString(s string) TaskType {
	switch strings.ToLower(s) {
	case "debug":
		return TaskDebug
	case "explain":
		return TaskExplain
	case "refactor":
		return TaskRefactor
	case "generate":
		return TaskGenerate
	case "simple":
		return TaskSimple
	default:
		return TaskUnknown
	}
}

func clampInt(v, min, max int) int {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}

// buildIterationsMap creates iteration estimates based on complexity.
func buildIterationsMap(complexity int) map[string]int {
	// Higher complexity = more iterations needed for smaller models
	return map[string]int{
		"haiku":  clampInt((complexity+2)/3, 1, 5),
		"sonnet": clampInt((complexity+4)/5, 1, 3),
		"opus":   1, // Opus typically completes in 1 iteration
	}
}
