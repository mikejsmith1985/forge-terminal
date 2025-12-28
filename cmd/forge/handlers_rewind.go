package main

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/am"
)

// RewindRequest represents a rewind API request.
type RewindRequest struct {
	Timestamp string `json:"timestamp"`
}

// RewindResponse contains the reconstructed terminal state.
type RewindResponse struct {
	Timestamp        time.Time `json:"timestamp"`
	CleanedContent   string    `json:"cleanedContent"`
	WorkingDirectory string    `json:"workingDirectory"`
	LastCommand      string    `json:"lastCommand"`
	LastExitCode     int       `json:"lastExitCode"`
	SequenceNum      int64     `json:"sequenceNum"`
	SnapshotCount    int       `json:"snapshotCount"`
}

// TimeRangeResponse contains the available time range for a tab.
type TimeRangeResponse struct {
	TabID         string    `json:"tabId"`
	Earliest      time.Time `json:"earliest"`
	Latest        time.Time `json:"latest"`
	SnapshotCount int       `json:"snapshotCount"`
	Available     bool      `json:"available"`
}

// handleAMSessionRewind handles the /api/am/session/:tabId/rewind endpoint.
// GET /api/am/session/:tabId/rewind?t=2025-12-28T01:15:30Z - rewind to timestamp
// GET /api/am/session/:tabId/range - get available time range
// GET /api/am/session/:tabId/snapshots - get all snapshots
func handleAMSessionRewind(w http.ResponseWriter, r *http.Request) {
	// Extract path components: /api/am/session/{tabId}/{action}
	path := strings.TrimPrefix(r.URL.Path, "/api/am/session/")
	parts := strings.Split(path, "/")

	if len(parts) < 1 || parts[0] == "" {
		http.Error(w, "Tab ID required", http.StatusBadRequest)
		return
	}

	tabID := parts[0]
	action := "rewind"
	if len(parts) > 1 {
		action = parts[1]
	}

	switch action {
	case "rewind":
		handleRewind(w, r, tabID)
	case "range":
		handleTimeRange(w, r, tabID)
	case "snapshots":
		handleSnapshots(w, r, tabID)
	default:
		http.Error(w, "Unknown action: "+action, http.StatusBadRequest)
	}
}

// handleRewind handles GET /api/am/session/:tabId/rewind?t=<timestamp>
func handleRewind(w http.ResponseWriter, r *http.Request, tabID string) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse timestamp from query parameter
	tStr := r.URL.Query().Get("t")
	if tStr == "" {
		http.Error(w, "Timestamp parameter 't' required (ISO 8601 format)", http.StatusBadRequest)
		return
	}

	targetTime, err := time.Parse(time.RFC3339, tStr)
	if err != nil {
		// Try other formats
		targetTime, err = time.Parse("2006-01-02T15:04:05", tStr)
		if err != nil {
			http.Error(w, "Invalid timestamp format. Use ISO 8601 (e.g., 2025-12-28T01:15:30Z)", http.StatusBadRequest)
			return
		}
	}

	log.Printf("[Rewind API] GET /api/am/session/%s/rewind?t=%s", tabID, tStr)

	// Get StateStore for this tab
	store := am.GetStateStore(tabID)
	if store == nil {
		http.Error(w, "No state history for tab", http.StatusNotFound)
		return
	}

	// Rewind to timestamp
	snapshot, err := store.RewindToTimestamp(targetTime)
	if err != nil {
		log.Printf("[Rewind API] Rewind failed: %v", err)
		http.Error(w, "No snapshot found near timestamp", http.StatusNotFound)
		return
	}

	// Build response
	response := RewindResponse{
		Timestamp:        snapshot.Timestamp,
		CleanedContent:   snapshot.CleanedContent,
		WorkingDirectory: snapshot.WorkingDirectory,
		LastCommand:      snapshot.LastCommand,
		LastExitCode:     snapshot.LastExitCode,
		SequenceNum:      snapshot.SequenceNum,
		SnapshotCount:    store.GetSnapshotCount(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleTimeRange handles GET /api/am/session/:tabId/range
func handleTimeRange(w http.ResponseWriter, r *http.Request, tabID string) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	log.Printf("[Rewind API] GET /api/am/session/%s/range", tabID)

	// Get StateStore for this tab
	store := am.GetStateStore(tabID)

	earliest, latest := time.Time{}, time.Time{}
	snapshotCount := 0
	available := false

	if store != nil {
		earliest, latest = store.GetTimeRange()
		snapshotCount = store.GetSnapshotCount()
		available = snapshotCount > 0
	}

	response := TimeRangeResponse{
		TabID:         tabID,
		Earliest:      earliest,
		Latest:        latest,
		SnapshotCount: snapshotCount,
		Available:     available,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleSnapshots handles GET /api/am/session/:tabId/snapshots
func handleSnapshots(w http.ResponseWriter, r *http.Request, tabID string) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	log.Printf("[Rewind API] GET /api/am/session/%s/snapshots", tabID)

	// Get StateStore for this tab
	store := am.GetStateStore(tabID)
	if store == nil {
		http.Error(w, "No state history for tab", http.StatusNotFound)
		return
	}

	// Get all snapshots
	snapshots := store.GetAllSnapshots()

	// Limit response size - only return metadata for large responses
	if len(snapshots) > 100 {
		// Return summary only
		type SnapshotSummary struct {
			Timestamp   time.Time `json:"timestamp"`
			SequenceNum int64     `json:"sequenceNum"`
			ContentLen  int       `json:"contentLen"`
		}

		summaries := make([]SnapshotSummary, len(snapshots))
		for i, snap := range snapshots {
			summaries[i] = SnapshotSummary{
				Timestamp:   snap.Timestamp,
				SequenceNum: snap.SequenceNum,
				ContentLen:  len(snap.CleanedContent),
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"count":     len(snapshots),
			"summaries": summaries,
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"count":     len(snapshots),
		"snapshots": snapshots,
	})
}
