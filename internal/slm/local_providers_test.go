package slm

import (
	"context"
	"os"
	"os/exec"
	"testing"
	"time"
)

// TestOllamaProviderAvailability checks if Ollama is available
func TestOllamaProviderAvailability(t *testing.T) {
	provider := NewOllamaProvider()
	
	if provider.IsAvailable() {
		t.Log("✓ Ollama is available on this system")
	} else {
		t.Log("Ollama not available - this is OK if not installed")
	}
}

// TestOllamaProviderRealAnalysis tests REAL local analysis if Ollama is available
func TestOllamaProviderRealAnalysis(t *testing.T) {
	provider := NewOllamaProvider()
	
	if !provider.IsAvailable() {
		t.Skip("Ollama not installed - skipping integration test")
	}
	
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	
	if err := provider.Initialize(ctx); err != nil {
		t.Fatalf("Failed to initialize Ollama: %v", err)
	}
	
	input := PromptContext{
		Prompt:          "Refactor this authentication module to use JWT tokens",
		FileCount:       5,
		HasErrorOutput:  false,
		EstimatedTokens: 100,
	}
	
	result, err := provider.Analyze(ctx, input)
	if err != nil {
		t.Fatalf("Analysis failed: %v", err)
	}
	
	// Verify it's NOT heuristic
	if result.Provider != "ollama" {
		t.Errorf("Expected provider 'ollama', got '%s'", result.Provider)
	}
	
	// Verify confidence is higher than heuristic (0.4-0.5)
	if result.Confidence < 0.6 {
		t.Errorf("Expected confidence >= 0.6, got %.2f", result.Confidence)
	}
	
	// Verify complexity is valid
	if result.Complexity < 1 || result.Complexity > 10 {
		t.Errorf("Complexity %d out of valid range", result.Complexity)
	}
	
	t.Logf("Ollama Analysis Result:")
	t.Logf("  Complexity: %d", result.Complexity)
	t.Logf("  TaskType: %s", result.TaskType)
	t.Logf("  Confidence: %.2f", result.Confidence)
	t.Logf("  Reasoning: %s", result.Reasoning)
	t.Logf("  Latency: %dms", result.LatencyMs)
}

// TestLlamaCppProviderAvailability checks for llama-cli binary
func TestLlamaCppProviderAvailability(t *testing.T) {
	provider := NewLlamaCppProvider()
	
	if provider.IsAvailable() {
		t.Log("✓ llama-cli is available on this system")
	} else {
		t.Log("llama-cli not available - checking components...")
		
		// Check what's missing
		if _, err := exec.LookPath("llama-cli"); err != nil {
			if _, err := exec.LookPath("llama-cli.exe"); err != nil {
				t.Log("  - llama-cli binary not in PATH")
			}
		}
		
		modelPath := GetExpectedModelPath()
		if _, err := os.Stat(modelPath); err != nil {
			t.Logf("  - Model not found at: %s", modelPath)
		}
	}
}

// TestLlamaCppProviderRealAnalysis tests REAL local analysis if llama-cli is available
func TestLlamaCppProviderRealAnalysis(t *testing.T) {
	provider := NewLlamaCppProvider()
	
	if !provider.IsAvailable() {
		t.Skip("llama-cli or model not available - skipping integration test")
	}
	
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()
	
	if err := provider.Initialize(ctx); err != nil {
		t.Fatalf("Failed to initialize llama-cli: %v", err)
	}
	
	input := PromptContext{
		Prompt:          "Debug this crash in the HTTP handler",
		FileCount:       2,
		HasErrorOutput:  true,
		HasStackTrace:   true,
		EstimatedTokens: 200,
	}
	
	result, err := provider.Analyze(ctx, input)
	if err != nil {
		t.Fatalf("Analysis failed: %v", err)
	}
	
	// Verify it's NOT heuristic
	if result.Provider != "llama-cpp" {
		t.Errorf("Expected provider 'llama-cpp', got '%s'", result.Provider)
	}
	
	// Verify confidence is higher than heuristic
	if result.Confidence < 0.6 {
		t.Errorf("Expected confidence >= 0.6, got %.2f", result.Confidence)
	}
	
	t.Logf("LlamaCpp Analysis Result:")
	t.Logf("  Complexity: %d", result.Complexity)
	t.Logf("  TaskType: %s", result.TaskType)
	t.Logf("  Confidence: %.2f", result.Confidence)
	t.Logf("  Reasoning: %s", result.Reasoning)
	t.Logf("  Latency: %dms", result.LatencyMs)
}

// TestEngineSelectsLocalProviders verifies engine prioritizes local providers
func TestEngineSelectsLocalProviders(t *testing.T) {
	engine := NewEngine()
	ctx := context.Background()
	
	if err := engine.Initialize(ctx); err != nil {
		t.Fatalf("Engine init failed: %v", err)
	}
	
	status := engine.Status()
	
	// Log what provider was selected
	t.Logf("Engine selected provider: %s", status.ActiveProvider)
	t.Logf("  Model: %s", status.ModelID)
	t.Logf("  Loaded: %v", status.ModelLoaded)
	
	// Verify no external API providers are used
	if status.ActiveProvider == "claude" || status.ActiveProvider == "openai" {
		t.Errorf("Engine should NOT use paid API providers, got: %s", status.ActiveProvider)
	}
	
	// Valid local providers
	validProviders := []string{"ollama", "llama-cpp", "embedded", "heuristic"}
	isValid := false
	for _, valid := range validProviders {
		if status.ActiveProvider == valid {
			isValid = true
			break
		}
	}
	
	if !isValid {
		t.Errorf("Unknown provider selected: %s", status.ActiveProvider)
	}
}

// TestHeuristicFallbackWorks ensures heuristic works when no AI is available
func TestHeuristicFallbackWorks(t *testing.T) {
	provider := NewHeuristicProvider()
	ctx := context.Background()
	
	input := PromptContext{
		Prompt:          "Fix this bug in the login function",
		FileCount:       1,
		HasErrorOutput:  true,
		EstimatedTokens: 50,
	}
	
	result, err := provider.Analyze(ctx, input)
	if err != nil {
		t.Fatalf("Heuristic analysis failed: %v", err)
	}
	
	if result.Provider != "heuristic" {
		t.Errorf("Expected provider 'heuristic', got '%s'", result.Provider)
	}
	
	// Heuristic should have lower confidence
	if result.Confidence > 0.6 {
		t.Errorf("Heuristic confidence should be <= 0.6, got %.2f", result.Confidence)
	}
	
	// Should still provide valid output
	if result.Complexity < 1 || result.Complexity > 10 {
		t.Errorf("Invalid complexity: %d", result.Complexity)
	}
	
	t.Logf("Heuristic Result: complexity=%d, task=%s, confidence=%.2f",
		result.Complexity, result.TaskType, result.Confidence)
}
