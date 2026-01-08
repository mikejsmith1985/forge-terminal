package main

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// devDataDir is the base directory for dev data (configurable for testing)
var devDataDir = "dev-data"

// DebugLog represents an external log entry ingested during a Follow Me session
type DebugLog struct {
	SessionID string                 `json:"sessionId"`
	Source    string                 `json:"source"`    // "backend", "database", "redis", "custom"
	Level     string                 `json:"level"`     // "error", "warn", "info", "debug"
	Message   string                 `json:"message"`
	Stack     string                 `json:"stack,omitempty"`
	Timestamp int64                  `json:"timestamp"` // Unix milliseconds
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
}

// debugLogsMutex protects concurrent writes to log files
var debugLogsMutex sync.Mutex

// handleDebugLogs handles POST /api/debug-logs for single log ingestion
func handleDebugLogs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	// Parse the log entry
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, `{"error":"Failed to read request body"}`, http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	var logEntry DebugLog
	if err := json.Unmarshal(body, &logEntry); err != nil {
		http.Error(w, `{"error":"Invalid JSON"}`, http.StatusBadRequest)
		return
	}

	// Validate required fields
	if logEntry.SessionID == "" {
		http.Error(w, `{"error":"sessionId is required"}`, http.StatusBadRequest)
		return
	}

	// Save the log entry
	if err := saveDebugLog(logEntry); err != nil {
		http.Error(w, `{"error":"Failed to save log"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// handleDebugLogsBatch handles POST /api/debug-logs/batch for multiple logs
func handleDebugLogsBatch(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, `{"error":"Failed to read request body"}`, http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	var logEntries []DebugLog
	if err := json.Unmarshal(body, &logEntries); err != nil {
		http.Error(w, `{"error":"Invalid JSON array"}`, http.StatusBadRequest)
		return
	}

	if len(logEntries) == 0 {
		http.Error(w, `{"error":"Empty log array"}`, http.StatusBadRequest)
		return
	}

	// All logs must have the same sessionId
	sessionID := logEntries[0].SessionID
	if sessionID == "" {
		http.Error(w, `{"error":"sessionId is required"}`, http.StatusBadRequest)
		return
	}

	// Save all logs
	for _, entry := range logEntries {
		entry.SessionID = sessionID // Ensure consistency
		if err := saveDebugLog(entry); err != nil {
			http.Error(w, `{"error":"Failed to save logs"}`, http.StatusInternalServerError)
			return
		}
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "ok",
		"count":  len(logEntries),
	})
}

// handleDebugLogsGet handles GET /api/debug-logs/{sessionId}
func handleDebugLogsGet(w http.ResponseWriter, r *http.Request, sessionID string) {
	w.Header().Set("Content-Type", "application/json")

	if sessionID == "" {
		http.Error(w, `{"error":"sessionId is required"}`, http.StatusBadRequest)
		return
	}

	logs, err := loadDebugLogs(sessionID)
	if err != nil {
		if os.IsNotExist(err) {
			// Return empty array if no logs yet
			json.NewEncoder(w).Encode([]DebugLog{})
			return
		}
		http.Error(w, `{"error":"Failed to load logs"}`, http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(logs)
}

// handleDebugLogsRouter routes requests to the appropriate handler
func handleDebugLogsRouter(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	log.Printf("[DEBUG-LOGS] Router called: %s %s", r.Method, path)

	// POST /api/debug-logs - single log
	if path == "/api/debug-logs" && r.Method == http.MethodPost {
		handleDebugLogs(w, r)
		return
	}

	// POST /api/debug-logs/batch - batch logs
	if path == "/api/debug-logs/batch" && r.Method == http.MethodPost {
		handleDebugLogsBatch(w, r)
		return
	}

	// GET /api/debug-logs/{sessionId}
	if strings.HasPrefix(path, "/api/debug-logs/") && r.Method == http.MethodGet {
		sessionID := strings.TrimPrefix(path, "/api/debug-logs/")
		if sessionID != "" && sessionID != "batch" {
			handleDebugLogsGet(w, r, sessionID)
			return
		}
	}

	http.Error(w, `{"error":"Not found"}`, http.StatusNotFound)
}

// saveDebugLog appends a log entry to the session's external-logs.json
func saveDebugLog(entry DebugLog) error {
	debugLogsMutex.Lock()
	defer debugLogsMutex.Unlock()

	// Get the session directory
	var sessionDir string
	if filepath.IsAbs(devDataDir) {
		// Absolute path (test mode)
		sessionDir = filepath.Join(devDataDir, "debug-sessions", entry.SessionID)
	} else {
		// Relative path (production mode)
		cwd, _ := os.Getwd()
		sessionDir = filepath.Join(cwd, devDataDir, "debug-sessions", entry.SessionID)
	}
	logsFile := filepath.Join(sessionDir, "external-logs.json")

	// Ensure session directory exists
	if err := os.MkdirAll(sessionDir, 0755); err != nil {
		return err
	}

	// Load existing logs
	var logs []DebugLog
	if data, err := os.ReadFile(logsFile); err == nil {
		json.Unmarshal(data, &logs)
	}

	// Append new log
	logs = append(logs, entry)

	// Save back
	data, err := json.MarshalIndent(logs, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(logsFile, data, 0644)
}

// loadDebugLogs reads all logs for a session
func loadDebugLogs(sessionID string) ([]DebugLog, error) {
	var logsFile string
	if filepath.IsAbs(devDataDir) {
		logsFile = filepath.Join(devDataDir, "debug-sessions", sessionID, "external-logs.json")
	} else {
		cwd, _ := os.Getwd()
		logsFile = filepath.Join(cwd, devDataDir, "debug-sessions", sessionID, "external-logs.json")
	}

	data, err := os.ReadFile(logsFile)
	if err != nil {
		return nil, err
	}

	var logs []DebugLog
	if err := json.Unmarshal(data, &logs); err != nil {
		return nil, err
	}

	return logs, nil
}
