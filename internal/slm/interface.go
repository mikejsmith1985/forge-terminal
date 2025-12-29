// Package slm provides the SLM provider interface.
package slm

import "context"

// Provider is the interface for SLM implementations.
// Both embedded (llama.cpp) and external (Ollama) providers implement this.
type Provider interface {
	// Name returns the provider identifier.
	Name() string

	// IsAvailable checks if the provider is ready to use.
	IsAvailable() bool

	// Initialize loads the model and prepares for inference.
	Initialize(ctx context.Context) error

	// Analyze examines a prompt and returns complexity/iteration predictions.
	Analyze(ctx context.Context, input PromptContext) (*AnalysisResult, error)

	// Shutdown cleanly releases resources.
	Shutdown() error

	// Status returns current provider state.
	Status() EngineStatus
}

// FeedbackStore is the interface for storing and retrieving learning data.
type FeedbackStore interface {
	// Record saves a feedback entry.
	Record(feedback FeedbackRecord) error

	// GetRecent returns the most recent N feedback entries.
	GetRecent(n int) ([]FeedbackRecord, error)

	// GetAll returns all feedback entries.
	GetAll() ([]FeedbackRecord, error)

	// GetStats returns aggregate statistics.
	GetStats() (FeedbackStats, error)

	// Clear removes all feedback data.
	Clear() error
}

// FeedbackStats contains aggregate learning statistics.
type FeedbackStats struct {
	TotalSamples      int     `json:"total_samples"`
	AccuracyRate      float64 `json:"accuracy_rate"`      // Predictions within ±1 iteration
	AvgIterationError float64 `json:"avg_iteration_error"` // Mean absolute error
	LastUpdated       string  `json:"last_updated"`
	
	// Per-task-type stats
	TaskTypeAccuracy map[TaskType]float64 `json:"task_type_accuracy,omitempty"`
	
	// Per-model stats
	ModelAccuracy map[string]float64 `json:"model_accuracy,omitempty"`
}

// PreferencesStore manages user routing preferences.
type PreferencesStore interface {
	// Get returns current preferences.
	Get() (*RoutingPreferences, error)

	// Save persists preferences.
	Save(prefs *RoutingPreferences) error
}
