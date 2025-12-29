// Package slm provides Small Language Model integration for smart routing.
// The SLM analyzes prompts to predict complexity and iteration requirements,
// enabling the CFO router to make optimal model selection decisions.
package slm

import "time"

// TaskType represents the category of coding task.
type TaskType string

const (
	TaskDebug    TaskType = "debug"
	TaskExplain  TaskType = "explain"
	TaskRefactor TaskType = "refactor"
	TaskGenerate TaskType = "generate"
	TaskSimple   TaskType = "simple"
	TaskUnknown  TaskType = "unknown"
)

// PromptContext contains metadata about the prompt being analyzed.
type PromptContext struct {
	// The actual prompt text
	Prompt string `json:"prompt"`

	// File context
	FileCount  int      `json:"file_count"`
	FilePaths  []string `json:"file_paths,omitempty"`
	FileTypes  []string `json:"file_types,omitempty"`
	TotalLines int      `json:"total_lines,omitempty"`

	// Token estimates
	EstimatedTokens int `json:"estimated_tokens"`

	// Content indicators
	HasErrorOutput bool `json:"has_error_output"`
	HasStackTrace  bool `json:"has_stack_trace"`
	HasCodeBlock   bool `json:"has_code_block"`

	// Budget context (passed to SLM for awareness)
	RemainingBudget float64 `json:"remaining_budget,omitempty"`
	DaysUntilReset  int     `json:"days_until_reset,omitempty"`
	CurrentModel    string  `json:"current_model,omitempty"`
}

// IterationEstimate predicts how many iterations a model will need.
type IterationEstimate struct {
	ModelID    string  `json:"model_id"`
	Iterations int     `json:"iterations"`
	Confidence float64 `json:"confidence"` // 0.0 to 1.0
}

// AnalysisResult is the output from SLM prompt analysis.
type AnalysisResult struct {
	// Complexity score (1-10)
	Complexity int `json:"complexity"`

	// Task classification
	TaskType TaskType `json:"task_type"`

	// Per-model iteration predictions
	Iterations map[string]int `json:"iterations"`

	// Overall confidence in the analysis
	Confidence float64 `json:"confidence"`

	// Brief explanation of the analysis
	Reasoning string `json:"reasoning,omitempty"`

	// Analysis timing
	LatencyMs int64 `json:"latency_ms"`

	// Which provider performed the analysis
	Provider string `json:"provider"`
}

// ModelTier represents a class of models by capability.
type ModelTier string

const (
	TierSpeed     ModelTier = "speed"     // Fast, cheap (Haiku, GPT-4o-mini)
	TierBalanced  ModelTier = "balanced"  // Good balance (Sonnet, GPT-4o)
	TierReasoning ModelTier = "reasoning" // Maximum capability (Opus, O1)
	TierFree      ModelTier = "free"      // Local/free models
)

// ModelProfile contains iteration estimates for standard model tiers.
type ModelProfile struct {
	Speed     int `json:"speed"`     // e.g., Haiku iterations
	Balanced  int `json:"balanced"`  // e.g., Sonnet iterations
	Reasoning int `json:"reasoning"` // e.g., Opus iterations
}

// FeedbackRecord captures the outcome of a routing decision for learning.
type FeedbackRecord struct {
	// Identity
	Timestamp    time.Time `json:"timestamp"`
	PromptHash   string    `json:"prompt_hash"`   // SHA256 of prompt
	PromptLength int       `json:"prompt_length"` // For correlation

	// What was predicted
	PredictedComplexity  int            `json:"predicted_complexity"`
	PredictedTaskType    TaskType       `json:"predicted_task_type"`
	PredictedIterations  map[string]int `json:"predicted_iterations"`
	PredictedModel       string         `json:"predicted_model"`

	// What actually happened
	ActualModel      string  `json:"actual_model"`
	ActualIterations int     `json:"actual_iterations"`
	ActualTokensIn   int     `json:"actual_tokens_in"`
	ActualTokensOut  int     `json:"actual_tokens_out"`
	DurationSeconds  float64 `json:"duration_seconds"`

	// Outcome
	Outcome      Outcome `json:"outcome"`
	UserOverride bool    `json:"user_override"` // Did user manually switch?

	// Context
	FileCount int      `json:"file_count"`
	FileTypes []string `json:"file_types,omitempty"`
}

// Outcome represents the result of a prompt execution.
type Outcome string

const (
	OutcomeSuccess   Outcome = "success"   // Completed successfully
	OutcomePartial   Outcome = "partial"   // Needed follow-up but completed
	OutcomeFailed    Outcome = "failed"    // User switched models or gave up
	OutcomeAbandoned Outcome = "abandoned" // User stopped without completing
)

// EngineStatus represents the current state of the SLM engine.
type EngineStatus struct {
	// Which provider is active
	ActiveProvider string `json:"active_provider"` // "embedded", "ollama", "heuristic"

	// Model info
	ModelID     string `json:"model_id,omitempty"`
	ModelLoaded bool   `json:"model_loaded"`
	ModelSizeMB int    `json:"model_size_mb,omitempty"`

	// LoRA adapter info
	AdapterLoaded  bool   `json:"adapter_loaded"`
	AdapterSamples int    `json:"adapter_samples,omitempty"` // Training samples used
	LastTrained    string `json:"last_trained,omitempty"`

	// Performance stats
	AvgLatencyMs   int64   `json:"avg_latency_ms"`
	TotalAnalyses  int     `json:"total_analyses"`
	AccuracyRate   float64 `json:"accuracy_rate,omitempty"` // If we have feedback data

	// Ollama availability
	OllamaAvailable bool   `json:"ollama_available"`
	OllamaModel     string `json:"ollama_model,omitempty"`
}

// RoutingPreferences stores user preferences for model selection.
type RoutingPreferences struct {
	// Preferred model when budget is healthy
	HealthyBudgetModel string `json:"healthy_budget_model,omitempty"`

	// Fallback model when budget is tight
	TightBudgetModel string `json:"tight_budget_model,omitempty"`

	// Models to never use
	Blacklist []string `json:"blacklist,omitempty"`

	// Ollama preferences
	UseOllamaIfAvailable bool `json:"use_ollama_if_available"`
	PreferOllama         bool `json:"prefer_ollama"`

	// Auto-routing enabled
	AutoRoutingEnabled bool `json:"auto_routing_enabled"`
}
