package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
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

// handleSLMModelStatus handles GET /api/slm/model
// Returns the status of the embedded SLM model.
func handleSLMModelStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	modelExists := slm.ModelExists()
	binaryExists := slm.BinaryExists()
	modelPath := slm.GetExpectedModelPath()
	binaryPath := slm.GetExpectedBinaryPath()

	status := map[string]interface{}{
		"model_exists":  modelExists,
		"binary_exists": binaryExists,
		"model_path":    modelPath,
		"binary_path":   binaryPath,
		"model_name":    slm.DefaultModelName,
		"ready":         modelExists && binaryExists,
	}

	// Get file size if exists
	if modelExists {
		if info, err := os.Stat(modelPath); err == nil {
			status["model_size_mb"] = info.Size() / 1_000_000
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}

// handleSLMModelDownload handles POST /api/slm/model/download
// Triggers download of the embedded SLM model.
func handleSLMModelDownload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Check if already exists
	if slm.ModelExists() {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":  "exists",
			"message": "Model already downloaded",
			"path":    slm.GetExpectedModelPath(),
		})
		return
	}

	// Start download (this is synchronous for now - could be made async with SSE)
	log.Printf("[SLM API] Starting model download...")
	
	var lastProgress slm.DownloadProgress
	err := slm.DownloadModel(func(p slm.DownloadProgress) {
		lastProgress = p
		if int(p.Percent)%20 == 0 {
			log.Printf("[SLM API] Download: %.0f%%", p.Percent)
		}
	})

	if err != nil {
		log.Printf("[SLM API] Download failed: %v", err)
		http.Error(w, "Download failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Re-initialize the SLM engine with the new model
	engine := slm.GetEngine()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	engine.Initialize(ctx)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":      "downloaded",
		"message":     "Model downloaded successfully",
		"path":        slm.GetExpectedModelPath(),
		"size_mb":     lastProgress.Downloaded / 1_000_000,
	})
}

// registerSLMHandlers registers all SLM-related API endpoints.
// These are only enabled when Dev Mode is active.
func registerSLMHandlers() {
	http.HandleFunc("/api/slm/status", handleSLMStatus)
	http.HandleFunc("/api/slm/analyze", handleSLMAnalyze)
	http.HandleFunc("/api/slm/learning", handleSLMLearningStats)
	http.HandleFunc("/api/slm/learning/clear", handleSLMLearningClear)
	http.HandleFunc("/api/slm/preferences", handleSLMPreferences)
	http.HandleFunc("/api/slm/model", handleSLMModelStatus)
	http.HandleFunc("/api/slm/model/download", handleSLMModelDownload)
	http.HandleFunc("/api/ollama/status", handleOllamaStatus)

	log.Printf("[SLM] Registered API endpoints")
}
