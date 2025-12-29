package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/slm"
)

// SLMStatusResponse represents the SLM engine status.
type SLMStatusResponse struct {
	Status slm.EngineStatus `json:"status"`
}

// SLMAnalyzeRequest represents a request to analyze a prompt.
type SLMAnalyzeRequest struct {
	Prompt          string   `json:"prompt"`
	FileCount       int      `json:"file_count"`
	FileTypes       []string `json:"file_types,omitempty"`
	EstimatedTokens int      `json:"estimated_tokens,omitempty"`
	HasErrorOutput  bool     `json:"has_error_output"`
	HasStackTrace   bool     `json:"has_stack_trace"`
}

// SLMAnalyzeResponse represents the analysis result.
type SLMAnalyzeResponse struct {
	Result *slm.AnalysisResult `json:"result"`
}

// SLMPreferencesResponse represents routing preferences.
type SLMPreferencesResponse struct {
	Preferences *slm.RoutingPreferences `json:"preferences"`
}

// SLMLearningStatsResponse represents learning statistics.
type SLMLearningStatsResponse struct {
	Stats slm.FeedbackStats `json:"stats"`
}

// handleSLMStatus handles GET /api/slm/status
// Returns the current SLM engine status.
func handleSLMStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	engine := slm.GetEngine()
	status := engine.Status()

	response := SLMStatusResponse{
		Status: status,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleSLMAnalyze handles POST /api/slm/analyze
// Analyzes a prompt and returns complexity/iteration predictions.
// This is for testing/debugging the SLM engine.
func handleSLMAnalyze(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req SLMAnalyzeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON request", http.StatusBadRequest)
		return
	}

	if req.Prompt == "" {
		http.Error(w, "Prompt required", http.StatusBadRequest)
		return
	}

	// Build context
	input := slm.PromptContext{
		Prompt:          req.Prompt,
		FileCount:       req.FileCount,
		FileTypes:       req.FileTypes,
		EstimatedTokens: req.EstimatedTokens,
		HasErrorOutput:  req.HasErrorOutput,
		HasStackTrace:   req.HasStackTrace,
	}

	// Estimate tokens if not provided
	if input.EstimatedTokens == 0 {
		input.EstimatedTokens = len(req.Prompt) / 4
		if input.EstimatedTokens < 100 {
			input.EstimatedTokens = 100
		}
	}

	// Get engine and analyze
	engine := slm.GetEngine()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	result, err := engine.Analyze(ctx, input)
	if err != nil {
		log.Printf("[SLM API] Analysis failed: %v", err)
		http.Error(w, "Analysis failed", http.StatusInternalServerError)
		return
	}

	response := SLMAnalyzeResponse{
		Result: result,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleSLMLearningStats handles GET /api/slm/learning
// Returns learning statistics from feedback data.
func handleSLMLearningStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	store, err := slm.NewFeedbackStore()
	if err != nil {
		log.Printf("[SLM API] Failed to get feedback store: %v", err)
		http.Error(w, "Failed to get learning stats", http.StatusInternalServerError)
		return
	}

	stats, err := store.GetStats()
	if err != nil {
		log.Printf("[SLM API] Failed to get stats: %v", err)
		http.Error(w, "Failed to get learning stats", http.StatusInternalServerError)
		return
	}

	response := SLMLearningStatsResponse{
		Stats: stats,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleSLMLearningClear handles DELETE /api/slm/learning
// Clears all learning/feedback data.
func handleSLMLearningClear(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	store, err := slm.NewFeedbackStore()
	if err != nil {
		log.Printf("[SLM API] Failed to get feedback store: %v", err)
		http.Error(w, "Failed to clear learning data", http.StatusInternalServerError)
		return
	}

	if err := store.Clear(); err != nil {
		log.Printf("[SLM API] Failed to clear data: %v", err)
		http.Error(w, "Failed to clear learning data", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "cleared"})
}

// handleSLMPreferences handles GET/POST /api/slm/preferences
// Gets or updates routing preferences.
func handleSLMPreferences(w http.ResponseWriter, r *http.Request) {
	engine := slm.GetEngine()

	switch r.Method {
	case http.MethodGet:
		prefs := engine.GetPreferences()
		response := SLMPreferencesResponse{
			Preferences: prefs,
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)

	case http.MethodPost:
		var prefs slm.RoutingPreferences
		if err := json.NewDecoder(r.Body).Decode(&prefs); err != nil {
			http.Error(w, "Invalid JSON request", http.StatusBadRequest)
			return
		}

		engine.SetPreferences(&prefs)
		log.Printf("[SLM API] Updated preferences: %+v", prefs)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "updated"})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleOllamaStatus handles GET /api/ollama/status
// Returns Ollama availability status.
func handleOllamaStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	ollama := slm.NewOllamaProvider()
	available := ollama.IsAvailable()

	status := map[string]interface{}{
		"available": available,
	}

	if available {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		if err := ollama.Initialize(ctx); err == nil {
			engineStatus := ollama.Status()
			status["model"] = engineStatus.OllamaModel
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}

// registerSLMHandlers registers all SLM-related API endpoints.
// These are only enabled when Dev Mode is active.
func registerSLMHandlers() {
	http.HandleFunc("/api/slm/status", handleSLMStatus)
	http.HandleFunc("/api/slm/analyze", handleSLMAnalyze)
	http.HandleFunc("/api/slm/learning", handleSLMLearningStats)
	http.HandleFunc("/api/slm/learning/clear", handleSLMLearningClear)
	http.HandleFunc("/api/slm/preferences", handleSLMPreferences)
	http.HandleFunc("/api/ollama/status", handleOllamaStatus)

	log.Printf("[SLM] Registered API endpoints")
}
