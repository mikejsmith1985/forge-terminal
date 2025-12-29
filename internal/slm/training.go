// Package slm provides initial training data for the SLM.
// This is applied after the model is first downloaded to provide
// baseline context for prompt classification.
package slm

import (
	"log"
	"time"
)

// InitialTrainingData contains pre-labeled examples for the SLM.
// These examples help the model understand how to classify prompts
// by task type and complexity from the start.
var InitialTrainingData = []FeedbackRecord{
	// ===== SIMPLE TASKS (Complexity 1-3) =====
	{
		PromptHash:          "training_simple_01",
		PredictedComplexity: 2,
		PredictedTaskType:   TaskExplain,
		PredictedModel:      "haiku",
		ActualModel:         "haiku",
		ActualIterations:    1,
		Outcome:             OutcomeSuccess,
		Timestamp:           time.Now(),
	},
	{
		PromptHash:          "training_simple_02",
		PredictedComplexity: 1,
		PredictedTaskType:   TaskSimple,
		PredictedModel:      "haiku",
		ActualModel:         "haiku",
		ActualIterations:    1,
		Outcome:             OutcomeSuccess,
		Timestamp:           time.Now(),
	},
	{
		PromptHash:          "training_simple_03",
		PredictedComplexity: 3,
		PredictedTaskType:   TaskExplain,
		PredictedModel:      "haiku",
		ActualModel:         "haiku",
		ActualIterations:    1,
		Outcome:             OutcomeSuccess,
		Timestamp:           time.Now(),
	},

	// ===== MEDIUM TASKS (Complexity 4-6) =====
	{
		PromptHash:          "training_medium_01",
		PredictedComplexity: 5,
		PredictedTaskType:   TaskDebug,
		PredictedModel:      "sonnet",
		ActualModel:         "sonnet",
		ActualIterations:    2,
		Outcome:             OutcomeSuccess,
		Timestamp:           time.Now(),
	},
	{
		PromptHash:          "training_medium_02",
		PredictedComplexity: 4,
		PredictedTaskType:   TaskGenerate,
		PredictedModel:      "sonnet",
		ActualModel:         "sonnet",
		ActualIterations:    1,
		Outcome:             OutcomeSuccess,
		Timestamp:           time.Now(),
	},
	{
		PromptHash:          "training_medium_03",
		PredictedComplexity: 6,
		PredictedTaskType:   TaskRefactor,
		PredictedModel:      "sonnet",
		ActualModel:         "sonnet",
		ActualIterations:    2,
		Outcome:             OutcomeSuccess,
		Timestamp:           time.Now(),
	},

	// ===== COMPLEX TASKS (Complexity 7-10) =====
	{
		PromptHash:          "training_complex_01",
		PredictedComplexity: 8,
		PredictedTaskType:   TaskRefactor,
		PredictedModel:      "opus",
		ActualModel:         "opus",
		ActualIterations:    1,
		Outcome:             OutcomeSuccess,
		Timestamp:           time.Now(),
	},
	{
		PromptHash:          "training_complex_02",
		PredictedComplexity: 9,
		PredictedTaskType:   TaskDebug,
		PredictedModel:      "opus",
		ActualModel:         "opus",
		ActualIterations:    1,
		Outcome:             OutcomeSuccess,
		Timestamp:           time.Now(),
	},
	{
		PromptHash:          "training_complex_03",
		PredictedComplexity: 7,
		PredictedTaskType:   TaskGenerate,
		PredictedModel:      "opus",
		ActualModel:         "opus",
		ActualIterations:    1,
		Outcome:             OutcomeSuccess,
		Timestamp:           time.Now(),
	},

	// ===== EDGE CASES =====
	// Reading GitHub issues - should be SIMPLE
	{
		PromptHash:          "training_gh_issue_read",
		PredictedComplexity: 2,
		PredictedTaskType:   TaskExplain,
		PredictedModel:      "haiku",
		ActualModel:         "haiku",
		ActualIterations:    1,
		Outcome:             OutcomeSuccess,
		Timestamp:           time.Now(),
	},
	// Fixing a tour - should be MEDIUM, not complex
	{
		PromptHash:          "training_fix_tour",
		PredictedComplexity: 4,
		PredictedTaskType:   TaskDebug,
		PredictedModel:      "sonnet",
		ActualModel:         "sonnet",
		ActualIterations:    1,
		Outcome:             OutcomeSuccess,
		Timestamp:           time.Now(),
	},
	// Simple code explanation
	{
		PromptHash:          "training_explain_code",
		PredictedComplexity: 2,
		PredictedTaskType:   TaskExplain,
		PredictedModel:      "haiku",
		ActualModel:         "haiku",
		ActualIterations:    1,
		Outcome:             OutcomeSuccess,
		Timestamp:           time.Now(),
	},
	// Architecture design - should be COMPLEX
	{
		PromptHash:          "training_architecture",
		PredictedComplexity: 9,
		PredictedTaskType:   TaskRefactor,
		PredictedModel:      "opus",
		ActualModel:         "opus",
		ActualIterations:    1,
		Outcome:             OutcomeSuccess,
		Timestamp:           time.Now(),
	},
}

// ApplyInitialTraining loads the initial training data into the feedback store.
// This is called after the model is first downloaded.
func ApplyInitialTraining() error {
	store, err := NewFeedbackStore()
	if err != nil {
		return err
	}

	// Check if we already have training data
	existing, err := store.GetAll()
	if err != nil {
		return err
	}

	// If we already have data, don't overwrite
	if len(existing) > 0 {
		log.Printf("[SLM/Training] Feedback store already has %d entries, skipping initial training", len(existing))
		return nil
	}

	// Apply initial training data
	log.Printf("[SLM/Training] Applying %d initial training samples...", len(InitialTrainingData))
	
	for _, record := range InitialTrainingData {
		if err := store.Record(record); err != nil {
			log.Printf("[SLM/Training] Failed to record training sample: %v", err)
			continue
		}
	}

	log.Printf("[SLM/Training] Initial training complete!")
	return nil
}

// HasInitialTraining checks if initial training has been applied.
func HasInitialTraining() bool {
	store, err := NewFeedbackStore()
	if err != nil {
		return false
	}

	records, err := store.GetAll()
	if err != nil {
		return false
	}

	return len(records) >= len(InitialTrainingData)
}
