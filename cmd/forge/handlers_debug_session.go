package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
	
	"github.com/mikejsmith1985/forge-terminal/internal/terminal"
)

// DebugSession represents a captured debug session
type DebugSession struct {
	ID              string          `json:"id"`
	Timestamp       string          `json:"timestamp"`
	Duration        int             `json:"duration"`
	Events          json.RawMessage `json:"events"`
	ConsoleLogs     json.RawMessage `json:"consoleLogs"`
	NetworkRequests json.RawMessage `json:"networkRequests"`
	PTYLogs         json.RawMessage `json:"ptyLogs,omitempty"` // PTY byte-level I/O logs
	HasVideo        bool            `json:"hasVideo"`
	Summary         SessionSummary  `json:"summary"`
	VideoPath       string          `json:"videoPath,omitempty"`
	SessionPath     string          `json:"sessionPath,omitempty"`
	TargetDirectory string          `json:"targetDirectory,omitempty"`
}

// SessionSummary contains aggregate stats from the session
type SessionSummary struct {
	TotalEvents      int `json:"totalEvents"`
	Keystrokes       int `json:"keystrokes"`
	Clicks           int `json:"clicks"`
	ConsoleLogs      int `json:"consoleLogs"`
	Errors           int `json:"errors"`
	Warnings         int `json:"warnings"`
	NetworkRequests  int `json:"networkRequests"`
	FailedRequests   int `json:"failedRequests"`
	PTYBytesSent     int `json:"ptyBytesSent,omitempty"`     // Total bytes sent to PTY
	PTYBytesReceived int `json:"ptyBytesReceived,omitempty"` // Total bytes received from PTY
}

// handleSaveDebugSession saves a debug session to disk
// POST /api/debug-sessions
func handleSaveDebugSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse multipart form (max 100MB for video)
	err := r.ParseMultipartForm(100 << 20)
	if err != nil {
		log.Printf("[DebugSession] Failed to parse form: %v", err)
		http.Error(w, "Failed to parse form", http.StatusBadRequest)
		return
	}

	// Get session JSON
	sessionJSON := r.FormValue("session")
	if sessionJSON == "" {
		http.Error(w, "Missing session data", http.StatusBadRequest)
		return
	}

	var session DebugSession
	if err := json.Unmarshal([]byte(sessionJSON), &session); err != nil {
		log.Printf("[DebugSession] Failed to parse session JSON: %v", err)
		http.Error(w, "Invalid session data", http.StatusBadRequest)
		return
	}

	// Create session directory
	cwd, _ := os.Getwd()
	sessionsDir := filepath.Join(cwd, "dev-data", "debug-sessions")
	sessionDir := filepath.Join(sessionsDir, session.ID)

	if err := os.MkdirAll(sessionDir, 0755); err != nil {
		log.Printf("[DebugSession] Failed to create session directory: %v", err)
		http.Error(w, "Failed to create session directory", http.StatusInternalServerError)
		return
	}

	// Save session JSON
	sessionPath := filepath.Join(sessionDir, "session.json")
	if err := os.WriteFile(sessionPath, []byte(sessionJSON), 0644); err != nil {
		log.Printf("[DebugSession] Failed to save session JSON: %v", err)
		http.Error(w, "Failed to save session", http.StatusInternalServerError)
		return
	}
	session.SessionPath = sessionPath

	// Save video if present
	videoFile, videoHeader, err := r.FormFile("video")
	if err == nil && videoFile != nil {
		defer videoFile.Close()

		videoPath := filepath.Join(sessionDir, videoHeader.Filename)
		outFile, err := os.Create(videoPath)
		if err != nil {
			log.Printf("[DebugSession] Failed to create video file: %v", err)
		} else {
			defer outFile.Close()
			if _, err := io.Copy(outFile, videoFile); err != nil {
				log.Printf("[DebugSession] Failed to save video: %v", err)
			} else {
				session.VideoPath = videoPath
				log.Printf("[DebugSession] Saved video: %s", videoPath)
			}
		}
	}

	// Generate analysis prompt file
	promptPath := filepath.Join(sessionDir, "analysis-prompt.md")
	if session.Events != nil {
		prompt := generateAnalysisPromptFromSession(&session)
		if err := os.WriteFile(promptPath, []byte(prompt), 0644); err != nil {
			log.Printf("[DebugSession] Failed to save analysis prompt: %v", err)
		}
	}

	log.Printf("[DebugSession] Saved session %s to %s", session.ID, sessionDir)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"id":      session.ID,
		"path":    sessionDir,
	})
}

// handleListDebugSessions lists all saved debug sessions
// GET /api/debug-sessions
func handleListDebugSessions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	cwd, _ := os.Getwd()
	sessionsDir := filepath.Join(cwd, "dev-data", "debug-sessions")

	// Create directory if it doesn't exist
	if _, err := os.Stat(sessionsDir); os.IsNotExist(err) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]DebugSession{})
		return
	}

	entries, err := os.ReadDir(sessionsDir)
	if err != nil {
		log.Printf("[DebugSession] Failed to read sessions directory: %v", err)
		http.Error(w, "Failed to list sessions", http.StatusInternalServerError)
		return
	}

	var sessions []DebugSession

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		sessionPath := filepath.Join(sessionsDir, entry.Name(), "session.json")
		data, err := os.ReadFile(sessionPath)
		if err != nil {
			continue
		}

		var session DebugSession
		if err := json.Unmarshal(data, &session); err != nil {
			continue
		}

		// Check for video
		videoPath := filepath.Join(sessionsDir, entry.Name(), session.ID+".webm")
		if _, err := os.Stat(videoPath); err == nil {
			session.HasVideo = true
			session.VideoPath = videoPath
		}

		session.SessionPath = sessionPath
		sessions = append(sessions, session)
	}

	// Sort by timestamp descending (newest first)
	sort.Slice(sessions, func(i, j int) bool {
		return sessions[i].Timestamp > sessions[j].Timestamp
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(sessions)
}

// handleGetDebugSession gets a specific debug session
// GET /api/debug-sessions/{id}
func handleGetDebugSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract session ID from path
	path := r.URL.Path
	parts := strings.Split(path, "/")
	if len(parts) < 4 {
		http.Error(w, "Invalid session ID", http.StatusBadRequest)
		return
	}
	sessionID := parts[len(parts)-1]

	cwd, _ := os.Getwd()
	sessionPath := filepath.Join(cwd, "dev-data", "debug-sessions", sessionID, "session.json")

	data, err := os.ReadFile(sessionPath)
	if err != nil {
		if os.IsNotExist(err) {
			http.Error(w, "Session not found", http.StatusNotFound)
		} else {
			http.Error(w, "Failed to read session", http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

// generateAnalysisPromptFromSession creates an AI-ready analysis prompt
func generateAnalysisPromptFromSession(session *DebugSession) string {
	var sb strings.Builder

	sb.WriteString("# Debug Session Analysis Request\n\n")
	sb.WriteString("## Session Overview\n")
	sb.WriteString("- **Session ID:** " + session.ID + "\n")
	sb.WriteString("- **Timestamp:** " + session.Timestamp + "\n")
	sb.WriteString("- **Duration:** " + (time.Duration(session.Duration) * time.Second).String() + "\n")
	if session.TargetDirectory != "" {
		sb.WriteString("- **Target Directory:** " + session.TargetDirectory + "\n")
	}
	sb.WriteString("\n## Summary\n")
	sb.WriteString("- **Total Events:** " + fmt.Sprintf("%d", session.Summary.TotalEvents) + "\n")
	sb.WriteString("- **Keystrokes:** " + fmt.Sprintf("%d", session.Summary.Keystrokes) + "\n")
	sb.WriteString("- **Clicks:** " + fmt.Sprintf("%d", session.Summary.Clicks) + "\n")
	sb.WriteString("- **Console Errors:** " + fmt.Sprintf("%d", session.Summary.Errors) + "\n")
	sb.WriteString("- **Failed Network Requests:** " + fmt.Sprintf("%d", session.Summary.FailedRequests) + "\n")
	
	// v3.12.16: Check for external logs
	externalLogs, _ := loadDebugLogs(session.ID)
	if len(externalLogs) > 0 {
		sb.WriteString("- **External Logs:** " + fmt.Sprintf("%d", len(externalLogs)) + "\n")
	}

	sb.WriteString("\n## Raw Data\n")
	sb.WriteString("Session data is available at: " + session.SessionPath + "\n")
	sb.WriteString("\n## Analysis Request\n")
	if session.TargetDirectory != "" {
		sb.WriteString("CONTEXT: The user is debugging an application located at: " + session.TargetDirectory + "\n")
		sb.WriteString("IMPORTANT: Please perform all file searches and reads relative to this directory.\n\n")
	}

	// v3.12.16: Include external logs in the prompt
	if len(externalLogs) > 0 {
		sb.WriteString("## External Application Logs\n")
		sb.WriteString("```json\n")
		
		// Limit to last 50 logs to avoid token limits
		logsToInclude := externalLogs
		if len(logsToInclude) > 50 {
			logsToInclude = logsToInclude[len(logsToInclude)-50:]
		}
		
		data, _ := json.MarshalIndent(logsToInclude, "", "  ")
		sb.WriteString(string(data))
		sb.WriteString("\n```\n\n")
	}

	sb.WriteString("Please analyze this debug session and:\n")
	sb.WriteString("1. Identify any errors or issues\n")
	sb.WriteString("2. Explain what the user was trying to do\n")
	sb.WriteString("3. Diagnose the root cause\n")
	sb.WriteString("4. Propose a specific fix\n")

	return sb.String()
}

// handleSetActiveDebugSession sets the global active debug session ID
// POST /api/debug-sessions/active
func handleSetActiveDebugSession(w http.ResponseWriter, r *http.Request) {
if r.Method != http.MethodPost {
http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
return
}

var req struct {
SessionID string `json:"sessionId"`
}
if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
http.Error(w, "Invalid JSON", http.StatusBadRequest)
return
}

terminal.SetActiveDebugSession(req.SessionID)

w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(map[string]interface{}{
"success": true,
"activeSessionId": req.SessionID,
})
}
// GET /api/debug/pty-logs?sessionId=<id>
func handleGetPTYLogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	sessionID := r.URL.Query().Get("sessionId")
	if sessionID == "" {
		http.Error(w, "Missing sessionId parameter", http.StatusBadRequest)
		return
	}

	logs := terminal.GetPTYLogsForSession(sessionID)
	if logs == nil {
		logs = []terminal.PTYLogEntry{} // Return empty array instead of null
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"sessionId": sessionID,
		"logs":      logs,
		"count":     len(logs),
	})
}
