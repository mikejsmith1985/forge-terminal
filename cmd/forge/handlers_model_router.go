package main

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/mikejsmith1985/forge-terminal/internal/llm"
)

// ModelTierRequest represents a request to classify a task.
type ModelTierRequest struct {
	Input string `json:"input"`
}

// ModelTierResponse represents the recommended model tier.
type ModelTierResponse struct {
	Tier           string `json:"tier"`           // "Haiku", "Sonnet", or "Opus"
	Recommendation string `json:"recommendation"` // Human-readable explanation
	Input          string `json:"input"`
}

// handleModelTier handles POST /api/llm/model-tier
// Analyzes input text and returns the recommended model tier.
func handleModelTier(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ModelTierRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON request", http.StatusBadRequest)
		return
	}

	if req.Input == "" {
		http.Error(w, "Input required", http.StatusBadRequest)
		return
	}

	log.Printf("[Model Router API] Classifying task: %s", req.Input)

	// Classify the task
	tier := llm.ClassifyTask(req.Input)
	recommendation := llm.GetModelRecommendation(tier)

	response := ModelTierResponse{
		Tier:           string(tier),
		Recommendation: recommendation,
		Input:          req.Input,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
