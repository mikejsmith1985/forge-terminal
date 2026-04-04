package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/review"
)

// qualityAgent is the singleton Quality Agent that reviews PR diffs.
var qualityAgent *review.Agent

func initReviewAgent() {
	qualityAgent = review.NewAgent()
}

// handleReviewAnalyze performs a quality review on a PR diff.
// POST /api/review/analyze
// Request: { projectPath, diff, changedFiles, strictness?, focusAreas? }
// Response: ReviewReport JSON
func handleReviewAnalyze(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var requestBody struct {
		ProjectPath  string   `json:"projectPath"`
		Diff         string   `json:"diff"`
		ChangedFiles []string `json:"changedFiles"`
		Strictness   string   `json:"strictness"`
		FocusAreas   []string `json:"focusAreas"`
	}

	if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
		http.Error(w, "Invalid request body: "+err.Error(), http.StatusBadRequest)
		return
	}

	if requestBody.Diff == "" {
		http.Error(w, "diff is required", http.StatusBadRequest)
		return
	}

	// Map string values to typed enums with defaults
	strictness := review.StrictnessStandard
	switch requestBody.Strictness {
	case "lenient":
		strictness = review.StrictnessLenient
	case "strict":
		strictness = review.StrictnessStrict
	}

	focusAreas := mapFocusAreas(requestBody.FocusAreas)
	if len(focusAreas) == 0 {
		// Default: review everything
		focusAreas = []review.FocusArea{
			review.FocusNaming,
			review.FocusComplexity,
			review.FocusTests,
			review.FocusArchitecture,
			review.FocusSecurity,
		}
	}

	reviewRequest := review.ReviewRequest{
		ProjectPath:  requestBody.ProjectPath,
		Diff:         requestBody.Diff,
		ChangedFiles: requestBody.ChangedFiles,
		Strictness:   strictness,
		FocusAreas:   focusAreas,
	}

	// Use a 3-minute timeout for the LLM chain — reviews can be slow on large diffs
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Minute)
	defer cancel()

	log.Printf("[Review API] Starting quality review: %d files, strictness=%s",
		len(requestBody.ChangedFiles), strictness)

	report, err := qualityAgent.Review(ctx, reviewRequest)
	if err != nil {
		log.Printf("[Review API] Review failed: %v", err)
		http.Error(w, "Review failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	log.Printf("[Review API] Review complete: %d findings, score %d/100",
		len(report.Findings), report.Score)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(report)
}

// handleReviewConfig returns the current PR review configuration from workflow settings.
// GET /api/review/config?path=<projectPath>
func handleReviewConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Return a default config — the frontend reads .forge/workflow.json directly,
	// but this endpoint serves as a fallback and for projects without a workflow.
	defaultConfig := map[string]interface{}{
		"strategy":         "tutor-and-agent",
		"autoTrigger":      true,
		"requireChangelog": true,
		"agentStrictness":  "standard",
		"agentFocusAreas":  []string{"naming", "complexity", "tests", "architecture", "security"},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(defaultConfig)
}

// mapFocusAreas converts string focus area names to typed FocusArea values.
func mapFocusAreas(areas []string) []review.FocusArea {
	var mapped []review.FocusArea
	for _, area := range areas {
		switch area {
		case "naming":
			mapped = append(mapped, review.FocusNaming)
		case "complexity":
			mapped = append(mapped, review.FocusComplexity)
		case "tests":
			mapped = append(mapped, review.FocusTests)
		case "architecture":
			mapped = append(mapped, review.FocusArchitecture)
		case "security":
			mapped = append(mapped, review.FocusSecurity)
		}
	}
	return mapped
}
