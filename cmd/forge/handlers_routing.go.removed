package main

import (
	"encoding/json"
	"log"
	"net/http"
	"path/filepath"
	"regexp"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/routing"
)

// ClassifyRequest represents the classification request
type ClassifyRequest struct {
	Prompt         string   `json:"prompt"`
	MentionedFiles []string `json:"mentionedFiles"`
}

// LogEffectivenessRequest represents a task completion log request
type LogEffectivenessRequest struct {
	Pattern      string `json:"pattern"`
	Model        string `json:"model"`
	Prompts      int    `json:"prompts"`
	Success      bool   `json:"success"`
	FilesChanged int    `json:"files_changed,omitempty"`
}

// GetRecommendationRequest represents a recommendation request
type GetRecommendationRequest struct {
	Pattern      string `json:"pattern"`
	CurrentModel string `json:"current_model"`
}

// handleRoutingClassify handles POST /api/routing/classify
func handleRoutingClassify(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ClassifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON request", http.StatusBadRequest)
		return
	}

	// Extract @-mentioned files from prompt if not provided
	if len(req.MentionedFiles) == 0 {
		req.MentionedFiles = extractMentionedFiles(req.Prompt)
	}

	// Classify the task
	classification := routing.ClassifyTask(req.Prompt, req.MentionedFiles)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(classification)
}

// handleRoutingRecommend handles POST /api/routing/recommend
func handleRoutingRecommend(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req GetRecommendationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON request", http.StatusBadRequest)
		return
	}

	// Get data directory from config
	dataDir := filepath.Join(".", "dev-data")

	// Create effectiveness tracker
	tracker := routing.NewEffectivenessTracker(dataDir)

	// Get recommendation
	recommendation, err := tracker.GetRecommendation(routing.TaskPattern(req.Pattern), req.CurrentModel)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(recommendation)
}

// handleRoutingLog handles POST /api/routing/log
func handleRoutingLog(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req LogEffectivenessRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON request", http.StatusBadRequest)
		return
	}

	// Get data directory from config
	dataDir := filepath.Join(".", "dev-data")

	// Create effectiveness tracker
	tracker := routing.NewEffectivenessTracker(dataDir)

	// Create log entry
	logEntry := routing.EffectivenessLog{
		Pattern:      routing.TaskPattern(req.Pattern),
		Model:        req.Model,
		Prompts:      req.Prompts,
		Success:      req.Success,
		Timestamp:    time.Now(),
		FilesChanged: req.FilesChanged,
	}

	// Log the completion
	if err := tracker.LogCompletion(logEntry); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	log.Printf("[Routing API] Logged effectiveness: pattern=%s, model=%s, prompts=%d, success=%v",
		req.Pattern, req.Model, req.Prompts, req.Success)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "logged"})
}

// handleRoutingEffectivenessLog handles GET /api/routing/effectiveness-log
func handleRoutingEffectivenessLog(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Get data directory from config
	dataDir := filepath.Join(".", "dev-data")

	// Create effectiveness tracker
	tracker := routing.NewEffectivenessTracker(dataDir)

	// Get all logs
	logs, err := tracker.GetAllLogs()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(logs)
}

// extractMentionedFiles extracts @-mentioned files from a prompt
func extractMentionedFiles(prompt string) []string {
	// Match @path/to/file patterns
	re := regexp.MustCompile(`@([\w\/\.\-]+)`)
	matches := re.FindAllStringSubmatch(prompt, -1)

	var files []string
	for _, match := range matches {
		if len(match) > 1 {
			files = append(files, match[1])
		}
	}

	return files
}
