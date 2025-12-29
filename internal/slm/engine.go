// Package slm provides the main routing engine.
package slm

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"log"
	"strings"
	"sync"
	"time"
)

// Engine is the main SLM routing engine.
// It manages providers, performs analysis, and collects feedback.
type Engine struct {
	mu sync.RWMutex

	// Active provider
	provider Provider

	// Fallback providers in order of preference
	fallbacks []Provider

	// Feedback storage
	feedback FeedbackStore

	// User preferences
	preferences *RoutingPreferences

	// Stats tracking
	totalAnalyses int
	totalLatency  int64
	
	// Heuristic fallback for when no SLM is available
	heuristicEnabled bool
}

// NewEngine creates a new SLM routing engine.
func NewEngine() *Engine {
	return &Engine{
		preferences:      &RoutingPreferences{AutoRoutingEnabled: true},
		heuristicEnabled: true,
	}
}

// Initialize sets up the engine with available providers.
// Priority: Ollama (free local) > LlamaCpp (bundled) > Embedded > Heuristic
// NO external API calls - all inference is local and free.
func (e *Engine) Initialize(ctx context.Context) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	// v3.5.2: Priority 1 - Ollama (if user has it installed, it's free)
	ollamaProvider := NewOllamaProvider()
	if ollamaProvider.IsAvailable() {
		log.Printf("[SLM] Ollama detected, checking for suitable models...")
		if err := ollamaProvider.Initialize(ctx); err == nil {
			e.provider = ollamaProvider
			log.Printf("[SLM] ✓ Using Ollama as primary provider (FREE local AI)")
			return nil
		} else {
			log.Printf("[SLM] Ollama init failed: %v", err)
		}
	}

	// v3.5.2: Priority 2 - LlamaCpp subprocess (bundled binary + model)
	llamaCppProvider := NewLlamaCppProvider()
	if llamaCppProvider.IsAvailable() {
		log.Printf("[SLM] llama-cli binary detected, initializing...")
		if err := llamaCppProvider.Initialize(ctx); err == nil {
			e.provider = llamaCppProvider
			log.Printf("[SLM] ✓ Using llama-cli as primary provider (FREE local AI)")
			return nil
		} else {
			log.Printf("[SLM] llama-cli init failed: %v", err)
		}
	}

	// Priority 3 - Rule-based provider (always available, no external dependencies)
	// This replaces the broken "embedded" provider that was never fully implemented
	ruleBasedProvider := NewRuleBasedProvider()
	if err := ruleBasedProvider.Initialize(ctx); err == nil {
		e.provider = ruleBasedProvider
		log.Printf("[SLM] ✓ Using rule-based analysis (fast heuristics)")
		log.Printf("[SLM] For AI analysis, install Ollama: https://ollama.ai")
		return nil
	}

	// Final fallback: heuristic (should not reach here, but just in case)
	log.Printf("[SLM] ⚠ Using heuristic fallback")
	e.provider = NewHeuristicProvider()
	e.heuristicEnabled = true

	return nil
}

// Analyze performs prompt analysis using the best available provider.
func (e *Engine) Analyze(ctx context.Context, input PromptContext) (*AnalysisResult, error) {
	e.mu.RLock()
	provider := e.provider
	fallbacks := e.fallbacks
	e.mu.RUnlock()

	start := time.Now()

	// Try primary provider
	if provider != nil && provider.IsAvailable() {
		result, err := provider.Analyze(ctx, input)
		if err == nil {
			e.recordAnalysis(time.Since(start).Milliseconds())
			return result, nil
		}
		log.Printf("[SLM] Primary provider failed: %v, trying fallbacks", err)
	}

	// Try fallbacks
	for _, fb := range fallbacks {
		if fb.IsAvailable() {
			result, err := fb.Analyze(ctx, input)
			if err == nil {
				e.recordAnalysis(time.Since(start).Milliseconds())
				return result, nil
			}
			log.Printf("[SLM] Fallback %s failed: %v", fb.Name(), err)
		}
	}

	// Ultimate fallback: heuristic analysis
	return e.heuristicAnalysis(input), nil
}

// recordAnalysis updates internal stats.
func (e *Engine) recordAnalysis(latencyMs int64) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.totalAnalyses++
	e.totalLatency += latencyMs
}

// heuristicAnalysis provides a rule-based fallback when no SLM is available.
func (e *Engine) heuristicAnalysis(input PromptContext) *AnalysisResult {
	start := time.Now()

	// Estimate complexity based on heuristics
	complexity := e.estimateComplexity(input)
	taskType := e.classifyTask(input.Prompt)

	// Estimate iterations based on complexity
	iterations := e.estimateIterations(complexity)

	return &AnalysisResult{
		Complexity: complexity,
		TaskType:   taskType,
		Iterations: iterations,
		Confidence: 0.5, // Low confidence for heuristic
		Reasoning:  "Heuristic analysis (no SLM available)",
		LatencyMs:  time.Since(start).Milliseconds(),
		Provider:   "heuristic",
	}
}

// estimateComplexity uses heuristics to guess prompt complexity.
func (e *Engine) estimateComplexity(input PromptContext) int {
	score := 3 // Base complexity

	// File count increases complexity
	if input.FileCount > 5 {
		score += 2
	} else if input.FileCount > 2 {
		score += 1
	}

	// Token count increases complexity
	if input.EstimatedTokens > 2000 {
		score += 2
	} else if input.EstimatedTokens > 500 {
		score += 1
	}

	// Error output suggests debugging
	if input.HasErrorOutput || input.HasStackTrace {
		score += 2
	}

	// Long prompts tend to be more complex
	if len(input.Prompt) > 500 {
		score += 1
	}

	// Keyword analysis
	prompt := strings.ToLower(input.Prompt)
	complexKeywords := []string{
		"refactor", "architect", "design", "optimize", "debug",
		"race condition", "deadlock", "memory leak", "security",
		"performance", "scalability", "migration",
	}
	for _, kw := range complexKeywords {
		if strings.Contains(prompt, kw) {
			score += 1
			break
		}
	}

	simpleKeywords := []string{
		"explain", "what is", "how to", "example", "simple",
		"quick", "just", "only",
	}
	for _, kw := range simpleKeywords {
		if strings.Contains(prompt, kw) {
			score -= 1
			break
		}
	}

	// Clamp to 1-10
	if score < 1 {
		score = 1
	}
	if score > 10 {
		score = 10
	}

	return score
}

// classifyTask attempts to categorize the task type.
func (e *Engine) classifyTask(prompt string) TaskType {
	lower := strings.ToLower(prompt)

	// Check for debug patterns
	debugPatterns := []string{
		"debug", "fix", "error", "bug", "issue", "problem",
		"not working", "fails", "crash", "exception",
	}
	for _, p := range debugPatterns {
		if strings.Contains(lower, p) {
			return TaskDebug
		}
	}

	// Check for explain patterns
	explainPatterns := []string{
		"explain", "what is", "how does", "why", "understand",
		"describe", "tell me about",
	}
	for _, p := range explainPatterns {
		if strings.Contains(lower, p) {
			return TaskExplain
		}
	}

	// Check for refactor patterns
	refactorPatterns := []string{
		"refactor", "improve", "clean up", "reorganize",
		"restructure", "optimize", "simplify",
	}
	for _, p := range refactorPatterns {
		if strings.Contains(lower, p) {
			return TaskRefactor
		}
	}

	// Check for generate patterns
	generatePatterns := []string{
		"create", "generate", "write", "implement", "build",
		"add", "make", "new",
	}
	for _, p := range generatePatterns {
		if strings.Contains(lower, p) {
			return TaskGenerate
		}
	}

	// Simple if very short
	if len(prompt) < 50 {
		return TaskSimple
	}

	return TaskUnknown
}

// estimateIterations predicts iterations per model tier based on complexity.
func (e *Engine) estimateIterations(complexity int) map[string]int {
	iterations := make(map[string]int)

	// Speed tier (Haiku, GPT-4o-mini)
	switch {
	case complexity <= 3:
		iterations["haiku"] = 1
		iterations["gpt-4o-mini"] = 1
	case complexity <= 5:
		iterations["haiku"] = 2
		iterations["gpt-4o-mini"] = 2
	case complexity <= 7:
		iterations["haiku"] = 3
		iterations["gpt-4o-mini"] = 3
	default:
		iterations["haiku"] = 4
		iterations["gpt-4o-mini"] = 4
	}

	// Balanced tier (Sonnet, GPT-4o)
	switch {
	case complexity <= 4:
		iterations["sonnet"] = 1
		iterations["gpt-4o"] = 1
		iterations["gemini-3"] = 1
	case complexity <= 7:
		iterations["sonnet"] = 2
		iterations["gpt-4o"] = 2
		iterations["gemini-3"] = 1
	default:
		iterations["sonnet"] = 2
		iterations["gpt-4o"] = 2
		iterations["gemini-3"] = 2
	}

	// Reasoning tier (Opus, O1)
	switch {
	case complexity <= 6:
		iterations["opus"] = 1
		iterations["o1"] = 1
	default:
		iterations["opus"] = 1
		iterations["o1"] = 1
	}

	return iterations
}

// RecordFeedback stores the outcome of a routing decision for learning.
func (e *Engine) RecordFeedback(feedback FeedbackRecord) error {
	if e.feedback == nil {
		return nil // No feedback store configured
	}
	return e.feedback.Record(feedback)
}

// Status returns the current engine status.
func (e *Engine) Status() EngineStatus {
	e.mu.RLock()
	defer e.mu.RUnlock()

	status := EngineStatus{
		TotalAnalyses: e.totalAnalyses,
	}

	if e.totalAnalyses > 0 {
		status.AvgLatencyMs = e.totalLatency / int64(e.totalAnalyses)
	}

	if e.provider != nil {
		providerStatus := e.provider.Status()
		status.ActiveProvider = providerStatus.ActiveProvider
		status.ModelID = providerStatus.ModelID
		status.ModelLoaded = providerStatus.ModelLoaded
		status.ModelSizeMB = providerStatus.ModelSizeMB
	} else {
		status.ActiveProvider = "heuristic"
	}

	// Check Ollama availability
	for _, fb := range e.fallbacks {
		if fb.Name() == "ollama" && fb.IsAvailable() {
			status.OllamaAvailable = true
			break
		}
	}

	return status
}

// HashPrompt creates a privacy-preserving hash of a prompt.
func HashPrompt(prompt string) string {
	hash := sha256.Sum256([]byte(prompt))
	return hex.EncodeToString(hash[:16]) // First 16 bytes = 32 hex chars
}

// SetFeedbackStore configures the feedback storage backend.
func (e *Engine) SetFeedbackStore(store FeedbackStore) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.feedback = store
}

// SetPreferences updates routing preferences.
func (e *Engine) SetPreferences(prefs *RoutingPreferences) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.preferences = prefs
}

// GetPreferences returns current routing preferences.
func (e *Engine) GetPreferences() *RoutingPreferences {
	e.mu.RLock()
	defer e.mu.RUnlock()
	if e.preferences == nil {
		return &RoutingPreferences{}
	}
	return e.preferences
}

// Shutdown cleanly stops all providers.
func (e *Engine) Shutdown() error {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.provider != nil {
		if err := e.provider.Shutdown(); err != nil {
			log.Printf("[SLM] Error shutting down primary provider: %v", err)
		}
	}

	for _, fb := range e.fallbacks {
		if err := fb.Shutdown(); err != nil {
			log.Printf("[SLM] Error shutting down fallback %s: %v", fb.Name(), err)
		}
	}

	return nil
}

// Global engine instance
var (
	globalEngine     *Engine
	globalEngineOnce sync.Once
)

// GetEngine returns the global SLM engine instance.
func GetEngine() *Engine {
	globalEngineOnce.Do(func() {
		globalEngine = NewEngine()
	})
	return globalEngine
}
