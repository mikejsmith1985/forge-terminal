package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// Test: POST /api/debug-logs accepts valid log entries
func TestDebugLogsEndpoint_AcceptsValidLog(t *testing.T) {
	// Setup: Create temp directory for test data
	tmpDir := t.TempDir()
	originalDataDir := devDataDir
	devDataDir = tmpDir
	defer func() { devDataDir = originalDataDir }()

	// Create a mock active session
	sessionID := "debug-" + time.Now().Format("20060102150405")
	sessionDir := filepath.Join(tmpDir, "debug-sessions", sessionID)
	os.MkdirAll(sessionDir, 0755)

	// Create the log entry
	logEntry := DebugLog{
		SessionID: sessionID,
		Source:    "backend",
		Level:     "error",
		Message:   "Database connection failed",
		Stack:     "Error: ECONNREFUSED\n  at connect (db.js:42)",
		Timestamp: time.Now().UnixMilli(),
		Metadata: map[string]interface{}{
			"query": "SELECT * FROM users",
			"host":  "localhost:5432",
		},
	}

	body, _ := json.Marshal(logEntry)
	req := httptest.NewRequest(http.MethodPost, "/api/debug-logs", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	// Execute
	handleDebugLogs(w, req)

	// Assert
	resp := w.Result()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	// Verify log was saved
	logsFile := filepath.Join(sessionDir, "external-logs.json")
	if _, err := os.Stat(logsFile); os.IsNotExist(err) {
		t.Error("Expected external-logs.json to be created")
	}
}

// Test: POST /api/debug-logs rejects missing sessionId
func TestDebugLogsEndpoint_RejectsMissingSessionID(t *testing.T) {
	logEntry := DebugLog{
		Source:    "backend",
		Level:     "error",
		Message:   "Some error",
		Timestamp: time.Now().UnixMilli(),
	}

	body, _ := json.Marshal(logEntry)
	req := httptest.NewRequest(http.MethodPost, "/api/debug-logs", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handleDebugLogs(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("Expected status 400 for missing sessionId, got %d", resp.StatusCode)
	}
}

// Test: POST /api/debug-logs rejects invalid JSON
func TestDebugLogsEndpoint_RejectsInvalidJSON(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/debug-logs", bytes.NewReader([]byte("not json")))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handleDebugLogs(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("Expected status 400 for invalid JSON, got %d", resp.StatusCode)
	}
}

// Test: GET /api/debug-logs/{sessionId} returns stored logs
func TestDebugLogsEndpoint_GetLogs(t *testing.T) {
	// Setup
	tmpDir := t.TempDir()
	originalDataDir := devDataDir
	devDataDir = tmpDir
	defer func() { devDataDir = originalDataDir }()

	sessionID := "debug-test-get"
	sessionDir := filepath.Join(tmpDir, "debug-sessions", sessionID)
	os.MkdirAll(sessionDir, 0755)

	// Pre-populate with some logs
	existingLogs := []DebugLog{
		{SessionID: sessionID, Source: "backend", Level: "info", Message: "Server started", Timestamp: 1000},
		{SessionID: sessionID, Source: "backend", Level: "error", Message: "DB error", Timestamp: 2000},
	}
	logsJSON, _ := json.Marshal(existingLogs)
	os.WriteFile(filepath.Join(sessionDir, "external-logs.json"), logsJSON, 0644)

	// Execute GET request
	req := httptest.NewRequest(http.MethodGet, "/api/debug-logs/"+sessionID, nil)
	w := httptest.NewRecorder()

	handleDebugLogsGet(w, req, sessionID)

	// Assert
	resp := w.Result()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	var logs []DebugLog
	json.NewDecoder(resp.Body).Decode(&logs)
	if len(logs) != 2 {
		t.Errorf("Expected 2 logs, got %d", len(logs))
	}
}

// Test: Logs are appended to existing file
func TestDebugLogsEndpoint_AppendsToExisting(t *testing.T) {
	tmpDir := t.TempDir()
	originalDataDir := devDataDir
	devDataDir = tmpDir
	defer func() { devDataDir = originalDataDir }()

	sessionID := "debug-append-test"
	sessionDir := filepath.Join(tmpDir, "debug-sessions", sessionID)
	os.MkdirAll(sessionDir, 0755)

	// Pre-populate with one log
	existingLogs := []DebugLog{
		{SessionID: sessionID, Source: "backend", Level: "info", Message: "First log", Timestamp: 1000},
	}
	logsJSON, _ := json.Marshal(existingLogs)
	os.WriteFile(filepath.Join(sessionDir, "external-logs.json"), logsJSON, 0644)

	// Add a new log
	newLog := DebugLog{
		SessionID: sessionID,
		Source:    "database",
		Level:     "error",
		Message:   "Query timeout",
		Timestamp: 2000,
	}
	body, _ := json.Marshal(newLog)
	req := httptest.NewRequest(http.MethodPost, "/api/debug-logs", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handleDebugLogs(w, req)

	// Verify both logs exist
	logsFile := filepath.Join(sessionDir, "external-logs.json")
	data, _ := os.ReadFile(logsFile)
	var logs []DebugLog
	json.Unmarshal(data, &logs)

	if len(logs) != 2 {
		t.Errorf("Expected 2 logs after append, got %d", len(logs))
	}
}

// Test: Batch log ingestion
func TestDebugLogsEndpoint_BatchIngestion(t *testing.T) {
	tmpDir := t.TempDir()
	originalDataDir := devDataDir
	devDataDir = tmpDir
	defer func() { devDataDir = originalDataDir }()

	sessionID := "debug-batch-test"
	sessionDir := filepath.Join(tmpDir, "debug-sessions", sessionID)
	os.MkdirAll(sessionDir, 0755)

	// Send multiple logs in batch
	batchLogs := []DebugLog{
		{SessionID: sessionID, Source: "backend", Level: "info", Message: "Log 1", Timestamp: 1000},
		{SessionID: sessionID, Source: "backend", Level: "warn", Message: "Log 2", Timestamp: 2000},
		{SessionID: sessionID, Source: "backend", Level: "error", Message: "Log 3", Timestamp: 3000},
	}
	body, _ := json.Marshal(batchLogs)
	req := httptest.NewRequest(http.MethodPost, "/api/debug-logs/batch", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handleDebugLogsBatch(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	// Verify all logs saved
	logsFile := filepath.Join(sessionDir, "external-logs.json")
	data, _ := os.ReadFile(logsFile)
	var logs []DebugLog
	json.Unmarshal(data, &logs)

	if len(logs) != 3 {
		t.Errorf("Expected 3 logs from batch, got %d", len(logs))
	}
}
