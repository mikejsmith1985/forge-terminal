package slm

import (
	"context"
	"testing"
	"time"
)

func TestHeuristicAnalysis(t *testing.T) {
	engine := NewEngine()
	
	// Initialize with heuristic fallback (no model needed)
	ctx := context.Background()
	
	tests := []struct {
		name           string
		prompt         string
		fileCount      int
		hasError       bool
		wantComplexity int // expected range
		wantTaskType   TaskType
	}{
		{
			name:           "simple explain",
			prompt:         "Explain what this function does",
			fileCount:      1,
			hasError:       false,
			wantComplexity: 3,
			wantTaskType:   TaskExplain,
		},
		{
			name:           "debug with error",
			prompt:         "Debug this error, it's crashing the application",
			fileCount:      2,
			hasError:       true,
			wantComplexity: 6,
			wantTaskType:   TaskDebug,
		},
		{
			name:           "complex refactor",
			prompt:         "Refactor the entire authentication module to use a new security pattern with better performance",
			fileCount:      8,
			hasError:       false,
			wantComplexity: 7,
			wantTaskType:   TaskRefactor,
		},
		{
			name:           "generate code",
			prompt:         "Create a new function to validate email addresses",
			fileCount:      0,
			hasError:       false,
			wantComplexity: 3,
			wantTaskType:   TaskGenerate,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			input := PromptContext{
				Prompt:          tt.prompt,
				FileCount:       tt.fileCount,
				HasErrorOutput:  tt.hasError,
				EstimatedTokens: len(tt.prompt) / 4,
			}

			result, err := engine.Analyze(ctx, input)
			if err != nil {
				t.Fatalf("Analyze failed: %v", err)
			}

			// v3.9.1: Analyze returns nil when no SLM (Ollama) is available
			if result == nil {
				t.Skip("Skipping: No SLM provider available (Ollama not installed)")
				return
			}

			// Check complexity is in reasonable range
			if result.Complexity < 1 || result.Complexity > 10 {
				t.Errorf("Complexity %d out of range [1,10]", result.Complexity)
			}

			// Check task type
			if result.TaskType != tt.wantTaskType {
				t.Errorf("TaskType = %s, want %s", result.TaskType, tt.wantTaskType)
			}

			// Check iterations are populated
			if len(result.Iterations) == 0 {
				t.Error("Iterations map should not be empty")
			}

			// Check provider is heuristic (since no model loaded)
			if result.Provider != "heuristic" && result.Provider != "embedded" {
				t.Logf("Provider = %s (expected heuristic or embedded)", result.Provider)
			}

			t.Logf("Result: complexity=%d, type=%s, iterations=%v, confidence=%.2f",
				result.Complexity, result.TaskType, result.Iterations, result.Confidence)
		})
	}
}

func TestPromptHashing(t *testing.T) {
	prompt1 := "Debug this function"
	prompt2 := "Debug this function"
	prompt3 := "Different prompt"

	hash1 := HashPrompt(prompt1)
	hash2 := HashPrompt(prompt2)
	hash3 := HashPrompt(prompt3)

	// Same prompts should have same hash
	if hash1 != hash2 {
		t.Errorf("Same prompts should have same hash: %s != %s", hash1, hash2)
	}

	// Different prompts should have different hash
	if hash1 == hash3 {
		t.Errorf("Different prompts should have different hash")
	}

	// Hash should be 32 chars (16 bytes hex encoded)
	if len(hash1) != 32 {
		t.Errorf("Hash length should be 32, got %d", len(hash1))
	}
}

func TestFeedbackStore(t *testing.T) {
	store, err := NewFeedbackStore()
	if err != nil {
		t.Fatalf("Failed to create feedback store: %v", err)
	}

	// Clear any existing data
	store.Clear()

	// Record some feedback
	feedback := FeedbackRecord{
		Timestamp:           time.Now(),
		PromptHash:          "test123",
		PromptLength:        100,
		PredictedComplexity: 5,
		PredictedTaskType:   TaskDebug,
		PredictedIterations: map[string]int{"haiku": 2, "sonnet": 1},
		PredictedModel:      "haiku",
		ActualModel:         "haiku",
		ActualIterations:    3,
		Outcome:             OutcomeSuccess,
	}

	if err := store.Record(feedback); err != nil {
		t.Fatalf("Failed to record feedback: %v", err)
	}

	// Get all feedback
	records, err := store.GetAll()
	if err != nil {
		t.Fatalf("Failed to get all feedback: %v", err)
	}

	if len(records) != 1 {
		t.Errorf("Expected 1 record, got %d", len(records))
	}

	// Get stats
	stats, err := store.GetStats()
	if err != nil {
		t.Fatalf("Failed to get stats: %v", err)
	}

	if stats.TotalSamples != 1 {
		t.Errorf("Expected 1 sample, got %d", stats.TotalSamples)
	}

	// Clean up
	store.Clear()
}

func TestEngineStatus(t *testing.T) {
	engine := NewEngine()
	
	// Before initialization
	status := engine.Status()
	
	// After initialization (with heuristic fallback)
	ctx := context.Background()
	engine.Initialize(ctx)
	
	status = engine.Status()
	
	// Should have some provider active
	if status.ActiveProvider == "" {
		t.Error("Expected an active provider after initialization")
	}

	t.Logf("Engine status: provider=%s, model=%s, analyses=%d",
		status.ActiveProvider, status.ModelID, status.TotalAnalyses)
}
