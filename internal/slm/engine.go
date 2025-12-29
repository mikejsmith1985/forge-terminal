// Package slm provides the main routing engine.
package slm

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"log"
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
	
	// Issue #52: NO HEURISTICS - if no SLM, don't route
	noSLMAvailable bool
}

// NewEngine creates a new SLM routing engine.
func NewEngine() *Engine {
	return &Engine{
		preferences:    &RoutingPreferences{AutoRoutingEnabled: true},
		noSLMAvailable: false,
	}
}

// Initialize sets up the engine with available providers.
// Priority: Ollama (if installed) > LlamaCpp with auto-download
// NO external API calls for inference - all local and free.
// Issue #52: Auto-downloads model if not present. NO HEURISTICS.
func (e *Engine) Initialize(ctx context.Context) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	// Priority 1 - Ollama (if user has it installed, use it - it's optimized)
	ollamaProvider := NewOllamaProvider()
	if ollamaProvider.IsAvailable() {
		log.Printf("[SLM] Ollama detected, checking for suitable models...")
		if err := ollamaProvider.Initialize(ctx); err == nil {
			e.provider = ollamaProvider
			e.noSLMAvailable = false
			log.Printf("[SLM] ✓ Using Ollama as primary provider (FREE local AI)")
			return nil
		} else {
			log.Printf("[SLM] Ollama init failed: %v", err)
		}
	}

	// Priority 2 - LlamaCpp with auto-download
	// This ensures SLM works out of the box with NO external dependencies
	log.Printf("[SLM] Checking for bundled model...")
	
	// Auto-download model if not present
	modelJustDownloaded := false
	if !ModelExists() {
		log.Printf("[SLM] Model not found, downloading SmolLM2-135M (~100MB)...")
		log.Printf("[SLM] This is a one-time download for intelligent routing.")
		
		err := EnsureModelAvailable(func(p DownloadProgress) {
			if int(p.Percent)%10 == 0 {
				log.Printf("[SLM] Download progress: %.0f%% (%.1f MB/s)", 
					p.Percent, p.Speed/1_000_000)
			}
		})
		if err != nil {
			log.Printf("[SLM] Model download failed: %v", err)
			log.Printf("[SLM] ⚠ Routing disabled - install Ollama or download model manually")
			e.provider = nil
			e.noSLMAvailable = true
			return nil
		}
		log.Printf("[SLM] ✓ Model downloaded successfully!")
		modelJustDownloaded = true
	}

	// Apply initial training after first model download
	if modelJustDownloaded {
		log.Printf("[SLM] Applying initial training data...")
		if err := ApplyInitialTraining(); err != nil {
			log.Printf("[SLM] Warning: Failed to apply initial training: %v", err)
		}
	}

	// Try to initialize LlamaCpp provider
	llamaCppProvider := NewLlamaCppProvider()
	if llamaCppProvider.IsAvailable() {
		log.Printf("[SLM] llama-cli binary detected, initializing...")
		if err := llamaCppProvider.Initialize(ctx); err == nil {
			e.provider = llamaCppProvider
			e.noSLMAvailable = false
			log.Printf("[SLM] ✓ Using embedded SLM (SmolLM2-135M) - NO external dependencies!")
			return nil
		} else {
			log.Printf("[SLM] llama-cli init failed: %v", err)
		}
	} else {
		log.Printf("[SLM] llama-cli binary not found")
		log.Printf("[SLM] Download from: https://github.com/ggerganov/llama.cpp/releases")
		log.Printf("[SLM] Place in: %s", GetBinDir())
	}

	// No SLM available - routing disabled, use user's default model
	log.Printf("[SLM] ⚠ No SLM available - routing DISABLED")
	log.Printf("[SLM] Prompts will use your default model without smart routing")
	e.provider = nil
	e.noSLMAvailable = true

	return nil
}

// Analyze performs prompt analysis using the best available provider.
// Issue #52: If no SLM is available, returns nil (no routing, use default model).
func (e *Engine) Analyze(ctx context.Context, input PromptContext) (*AnalysisResult, error) {
	e.mu.RLock()
	provider := e.provider
	fallbacks := e.fallbacks
	noSLM := e.noSLMAvailable
	e.mu.RUnlock()

	// Issue #52: If no SLM available, return nil - don't route, use user's default
	if noSLM || provider == nil {
		log.Printf("[SLM] No SLM available - skipping analysis, use default model")
		return nil, nil
	}

	start := time.Now()

	// Try primary provider
	if provider.IsAvailable() {
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

	// Issue #52: NO HEURISTICS - if all providers fail, return nil (use default)
	log.Printf("[SLM] All providers failed - skipping analysis, use default model")
	return nil, nil
}

// recordAnalysis updates internal stats.
func (e *Engine) recordAnalysis(latencyMs int64) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.totalAnalyses++
	e.totalLatency += latencyMs
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
		// Issue #52: No heuristics - report as disabled, not "heuristic"
		status.ActiveProvider = "disabled"
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
