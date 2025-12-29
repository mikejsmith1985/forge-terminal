// Package am provides SLM feedback integration.
package am

import (
	"crypto/sha256"
	"encoding/hex"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/slm"
)

// FeedbackRecorder bridges AM conversation tracking with SLM learning.
type FeedbackRecorder struct {
	mu    sync.Mutex
	store *slm.JSONLFeedbackStore
}

var (
	globalFeedbackRecorder     *FeedbackRecorder
	globalFeedbackRecorderOnce sync.Once
)

// GetFeedbackRecorder returns the global feedback recorder instance.
func GetFeedbackRecorder() *FeedbackRecorder {
	globalFeedbackRecorderOnce.Do(func() {
		store, err := slm.NewFeedbackStore()
		if err != nil {
			log.Printf("[SLM Feedback] Warning: failed to create feedback store: %v", err)
			return
		}
		globalFeedbackRecorder = &FeedbackRecorder{
			store: store,
		}
		log.Printf("[SLM Feedback] Recorder initialized")
	})
	return globalFeedbackRecorder
}

// InitializeSLMTracking sets up SLM tracking for a new conversation.
// Called when a conversation starts with initial prompt analysis.
func (r *FeedbackRecorder) InitializeSLMTracking(conv *LLMConversation, analysis *slm.AnalysisResult, initialPrompt string) {
	if conv == nil {
		return
	}

	// Create tracking data
	tracking := &SLMTrackingData{
		PromptHash:          hashPrompt(initialPrompt),
		InitialPrompt:       truncatePrompt(initialPrompt, 200),
		AnalysisProvider:    analysis.Provider,
		PredictedComplexity: analysis.Complexity,
		UserIterations:      0,
		TotalTokensIn:       0,
		TotalTokensOut:      0,
	}

	// Extract predicted iterations for common models
	if analysis.Iterations != nil {
		// Try to find prediction for likely model
		for _, model := range []string{"haiku", "sonnet", "gemini-3", "gpt-4o"} {
			if iters, ok := analysis.Iterations[model]; ok {
				tracking.PredictedModel = model
				tracking.PredictedIterations = iters
				break
			}
		}
	}

	conv.SLMTracking = tracking
	log.Printf("[SLM Feedback] Initialized tracking for conversation %s: complexity=%d, predicted=%s/%d",
		conv.ConversationID, tracking.PredictedComplexity, tracking.PredictedModel, tracking.PredictedIterations)
}

// RecordUserTurn increments the iteration count when user sends a message.
func (r *FeedbackRecorder) RecordUserTurn(conv *LLMConversation, inputText string) {
	if conv == nil || conv.SLMTracking == nil {
		return
	}

	conv.SLMTracking.UserIterations++
	conv.SLMTracking.TotalTokensIn += estimateTokens(inputText)

	log.Printf("[SLM Feedback] User turn %d for conversation %s",
		conv.SLMTracking.UserIterations, conv.ConversationID)
}

// RecordAssistantTurn tracks assistant response tokens.
func (r *FeedbackRecorder) RecordAssistantTurn(conv *LLMConversation, outputText string) {
	if conv == nil || conv.SLMTracking == nil {
		return
	}

	conv.SLMTracking.TotalTokensOut += estimateTokens(outputText)
}

// RecordModelSwitch notes when user switches models mid-conversation.
func (r *FeedbackRecorder) RecordModelSwitch(conv *LLMConversation, newModel string) {
	if conv == nil || conv.SLMTracking == nil {
		return
	}

	if conv.SLMTracking.ActualModel != "" && conv.SLMTracking.ActualModel != newModel {
		conv.SLMTracking.ModelSwitched = true
		conv.SLMTracking.SwitchedToModel = newModel
		log.Printf("[SLM Feedback] Model switch detected: %s -> %s",
			conv.SLMTracking.ActualModel, newModel)
	}

	conv.SLMTracking.ActualModel = newModel
}

// DetectOutcome analyzes conversation to determine success/failure.
// Called when conversation ends or becomes inactive.
func (r *FeedbackRecorder) DetectOutcome(conv *LLMConversation) string {
	if conv == nil {
		return ""
	}

	tracking := conv.SLMTracking
	if tracking == nil {
		return ""
	}

	// Already detected
	if tracking.Outcome != "" {
		return tracking.Outcome
	}

	outcome := r.analyzeOutcome(conv)
	tracking.Outcome = outcome
	tracking.OutcomeDetected = time.Now()

	log.Printf("[SLM Feedback] Detected outcome for %s: %s (iterations=%d, model=%s)",
		conv.ConversationID, outcome, tracking.UserIterations, tracking.ActualModel)

	return outcome
}

// analyzeOutcome examines conversation content to guess the outcome.
func (r *FeedbackRecorder) analyzeOutcome(conv *LLMConversation) string {
	if len(conv.Turns) == 0 {
		return "abandoned"
	}

	tracking := conv.SLMTracking
	if tracking == nil {
		return "unknown"
	}

	// Model switch often indicates failure
	if tracking.ModelSwitched {
		return "failed"
	}

	// Very high iteration count suggests struggle
	if tracking.UserIterations > 5 {
		// Check last turn for success indicators
		lastTurn := conv.Turns[len(conv.Turns)-1]
		if containsSuccessIndicators(lastTurn.Content) {
			return "partial" // Eventually succeeded after many tries
		}
		return "failed"
	}

	// Single iteration is usually success
	if tracking.UserIterations <= 1 {
		return "success"
	}

	// 2-3 iterations - check content
	lastTurn := conv.Turns[len(conv.Turns)-1]
	if containsSuccessIndicators(lastTurn.Content) {
		return "success"
	}
	if containsFailureIndicators(lastTurn.Content) {
		return "failed"
	}

	return "partial"
}

// FinalizeAndRecord saves the feedback when conversation completes.
func (r *FeedbackRecorder) FinalizeAndRecord(conv *LLMConversation) error {
	if r == nil || r.store == nil {
		return nil
	}
	if conv == nil || conv.SLMTracking == nil {
		return nil
	}

	// Detect outcome if not already done
	r.DetectOutcome(conv)

	tracking := conv.SLMTracking

	// Build feedback record
	feedback := slm.FeedbackRecord{
		Timestamp:    time.Now(),
		PromptHash:   tracking.PromptHash,
		PromptLength: len(tracking.InitialPrompt),

		PredictedComplexity: tracking.PredictedComplexity,
		PredictedModel:      tracking.PredictedModel,
		PredictedIterations: map[string]int{
			tracking.PredictedModel: tracking.PredictedIterations,
		},

		ActualModel:      tracking.ActualModel,
		ActualIterations: tracking.UserIterations,
		ActualTokensIn:   tracking.TotalTokensIn,
		ActualTokensOut:  tracking.TotalTokensOut,
		DurationSeconds:  conv.EndTime.Sub(conv.StartTime).Seconds(),

		Outcome:      slm.Outcome(tracking.Outcome),
		UserOverride: tracking.ModelSwitched,

		FileCount: 0, // TODO: Extract from context
	}

	// Infer task type from conversation
	feedback.PredictedTaskType = r.inferTaskType(conv)

	// Record to feedback store
	if err := r.store.Record(feedback); err != nil {
		log.Printf("[SLM Feedback] Failed to record feedback: %v", err)
		return err
	}

	log.Printf("[SLM Feedback] Recorded feedback for %s: predicted=%d, actual=%d, outcome=%s",
		conv.ConversationID, tracking.PredictedIterations, tracking.UserIterations, tracking.Outcome)

	return nil
}

// inferTaskType guesses the task type from conversation content.
func (r *FeedbackRecorder) inferTaskType(conv *LLMConversation) slm.TaskType {
	if len(conv.Turns) == 0 {
		return slm.TaskUnknown
	}

	// Look at first user turn
	var firstUserContent string
	for _, turn := range conv.Turns {
		if turn.Role == "user" {
			firstUserContent = turn.Content
			break
		}
	}

	lower := strings.ToLower(firstUserContent)

	debugPatterns := []string{"debug", "fix", "error", "bug", "issue", "crash"}
	for _, p := range debugPatterns {
		if strings.Contains(lower, p) {
			return slm.TaskDebug
		}
	}

	explainPatterns := []string{"explain", "what", "how", "why", "describe"}
	for _, p := range explainPatterns {
		if strings.Contains(lower, p) {
			return slm.TaskExplain
		}
	}

	refactorPatterns := []string{"refactor", "improve", "clean", "optimize"}
	for _, p := range refactorPatterns {
		if strings.Contains(lower, p) {
			return slm.TaskRefactor
		}
	}

	generatePatterns := []string{"create", "generate", "write", "implement", "add"}
	for _, p := range generatePatterns {
		if strings.Contains(lower, p) {
			return slm.TaskGenerate
		}
	}

	return slm.TaskUnknown
}

// Helper functions

func hashPrompt(prompt string) string {
	hash := sha256.Sum256([]byte(prompt))
	return hex.EncodeToString(hash[:16])
}

func truncatePrompt(prompt string, maxLen int) string {
	if len(prompt) <= maxLen {
		return prompt
	}
	return prompt[:maxLen] + "..."
}

func estimateTokens(text string) int {
	// Rough approximation: 4 chars per token
	tokens := len(text) / 4
	if tokens < 1 {
		tokens = 1
	}
	return tokens
}

func containsSuccessIndicators(content string) bool {
	lower := strings.ToLower(content)
	indicators := []string{
		"completed", "done", "finished", "success",
		"works", "working", "fixed", "resolved",
		"thank", "perfect", "great", "excellent",
	}
	for _, ind := range indicators {
		if strings.Contains(lower, ind) {
			return true
		}
	}
	return false
}

func containsFailureIndicators(content string) bool {
	lower := strings.ToLower(content)
	indicators := []string{
		"doesn't work", "not working", "still broken",
		"try again", "wrong", "incorrect", "fail",
		"doesn't help", "no good", "give up",
	}
	for _, ind := range indicators {
		if strings.Contains(lower, ind) {
			return true
		}
	}
	return false
}
