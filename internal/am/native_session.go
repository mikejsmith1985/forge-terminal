// Package am provides native AI session recovery support.
package am

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// =============================================================================
// Native Session Types
// =============================================================================

// Provider represents an AI CLI provider
type Provider string

const (
	ProviderCopilot Provider = "copilot"
	ProviderClaude  Provider = "claude"
)

// NativeSession represents a native AI session that can be resumed
type NativeSession struct {
	ID           string    `json:"id"`
	Provider     Provider  `json:"provider"`
	FilePath     string    `json:"filePath"`
	StartTime    time.Time `json:"startTime"`
	LastModified time.Time `json:"lastModified"`
	WorkingDir   string    `json:"workingDir,omitempty"`
	UserMessage  string    `json:"firstMessage,omitempty"`
	TurnCount    int       `json:"turnCount"`
	Recoverable  bool      `json:"recoverable"`
	FileSize     int64     `json:"fileSize"`
}

// RecoveryStatus indicates whether a session can be resumed
type RecoveryStatus struct {
	Recoverable bool   `json:"recoverable"`
	Reason      string `json:"reason,omitempty"`
	SessionID   string `json:"sessionId"`
	Provider    Provider `json:"provider"`
}

// =============================================================================
// Native Session Monitor
// =============================================================================

// NativeMonitor watches and validates native AI session files
type NativeMonitor struct {
	copilotDir string
	claudeDir  string
	sessions   map[string]*NativeSession
	mu         sync.RWMutex
}

// NewNativeMonitor creates a new native session monitor
func NewNativeMonitor() *NativeMonitor {
	homeDir, _ := os.UserHomeDir()
	return &NativeMonitor{
		copilotDir: filepath.Join(homeDir, ".copilot", "session-state"),
		claudeDir:  filepath.Join(homeDir, ".claude", "projects"),
		sessions:   make(map[string]*NativeSession),
	}
}

// Scan discovers all available native sessions
func (nm *NativeMonitor) Scan() ([]*NativeSession, error) {
	nm.mu.Lock()
	defer nm.mu.Unlock()

	nm.sessions = make(map[string]*NativeSession)

	// Scan Copilot sessions
	if err := nm.scanCopilot(); err != nil {
		// Non-fatal - log but continue
		fmt.Printf("[NativeMonitor] Warning scanning Copilot: %v\n", err)
	}

	// Scan Claude sessions
	if err := nm.scanClaude(); err != nil {
		// Non-fatal - log but continue
		fmt.Printf("[NativeMonitor] Warning scanning Claude: %v\n", err)
	}

	// Convert to sorted slice
	sessions := make([]*NativeSession, 0, len(nm.sessions))
	for _, s := range nm.sessions {
		sessions = append(sessions, s)
	}

	// Sort by last modified, newest first
	sort.Slice(sessions, func(i, j int) bool {
		return sessions[i].LastModified.After(sessions[j].LastModified)
	})

	return sessions, nil
}

// scanCopilot discovers Copilot sessions
func (nm *NativeMonitor) scanCopilot() error {
	if _, err := os.Stat(nm.copilotDir); os.IsNotExist(err) {
		return nil // No Copilot installed
	}

	files, err := filepath.Glob(filepath.Join(nm.copilotDir, "*.jsonl"))
	if err != nil {
		return err
	}

	for _, file := range files {
		session, err := nm.parseCopilotSession(file)
		if err != nil {
			continue // Skip invalid files
		}
		nm.sessions[session.ID] = session
	}

	return nil
}

// scanClaude discovers Claude sessions
func (nm *NativeMonitor) scanClaude() error {
	if _, err := os.Stat(nm.claudeDir); os.IsNotExist(err) {
		return nil // No Claude installed
	}

	err := filepath.Walk(nm.claudeDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return err
		}

		if filepath.Ext(path) == ".jsonl" {
			session, err := nm.parseClaudeSession(path)
			if err != nil {
				return nil // Skip invalid files
			}
			nm.sessions[session.ID] = session
		}
		return nil
	})

	return err
}

// parseCopilotSession extracts metadata from a Copilot session file
func (nm *NativeMonitor) parseCopilotSession(path string) (*NativeSession, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}

	// Extract session ID from filename: session-{uuid}.jsonl
	filename := filepath.Base(path)
	sessionID := strings.TrimSuffix(filename, ".jsonl")

	session := &NativeSession{
		ID:           sessionID,
		Provider:     ProviderCopilot,
		FilePath:     path,
		LastModified: info.ModTime(),
		FileSize:     info.Size(),
		Recoverable:  info.Size() > 0, // Basic check
	}

	// Parse first few lines to extract metadata
	file, err := os.Open(path)
	if err != nil {
		return session, nil // Return basic info even if can't parse
	}
	defer file.Close()

	decoder := json.NewDecoder(file)
	
	// Read first event for session start time
	var firstEvent struct {
		Type      string    `json:"type"`
		Data      json.RawMessage `json:"data"`
		Timestamp time.Time `json:"timestamp"`
	}
	
	if err := decoder.Decode(&firstEvent); err == nil {
		session.StartTime = firstEvent.Timestamp
		
		// Try to get start data
		if firstEvent.Type == "session.start" {
			var startData struct {
				SessionID string `json:"sessionId"`
			}
			if json.Unmarshal(firstEvent.Data, &startData) == nil {
				// Validate session ID matches
				session.Recoverable = session.Recoverable && 
					strings.Contains(sessionID, strings.Split(startData.SessionID, "-")[0])
			}
		}
	}

	// Count turns and find first user message
	turnCount := 0
	for decoder.More() {
		var event struct {
			Type string          `json:"type"`
			Data json.RawMessage `json:"data"`
		}
		
		if err := decoder.Decode(&event); err != nil {
			break
		}

		if event.Type == "user.message" && session.UserMessage == "" {
			var msgData struct {
				Content string `json:"content"`
			}
			if json.Unmarshal(event.Data, &msgData) == nil {
				if len(msgData.Content) > 100 {
					session.UserMessage = msgData.Content[:97] + "..."
				} else {
					session.UserMessage = msgData.Content
				}
			}
		}

		if event.Type == "assistant.turn_start" || event.Type == "user.message" {
			turnCount++
		}
	}
	
	session.TurnCount = turnCount / 2 // Rough estimate of actual turns

	return session, nil
}

// parseClaudeSession extracts metadata from a Claude session file
func (nm *NativeMonitor) parseClaudeSession(path string) (*NativeSession, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}

	// Extract session ID from filename
	filename := filepath.Base(path)
	sessionID := strings.TrimSuffix(filename, ".jsonl")

	// Extract working directory from path structure
	workingDir := ""
	pathParts := strings.Split(filepath.Dir(path), string(filepath.Separator))
	if len(pathParts) > 0 {
		lastPart := pathParts[len(pathParts)-1]
		// Convert encoded path back (e.g., "C--Users-mikej-Downloads" -> "C:\Users\mikej\Downloads")
		workingDir = strings.ReplaceAll(lastPart, "-", string(filepath.Separator))
	}

	session := &NativeSession{
		ID:           sessionID,
		Provider:     ProviderClaude,
		FilePath:     path,
		LastModified: info.ModTime(),
		FileSize:     info.Size(),
		WorkingDir:   workingDir,
		Recoverable:  info.Size() > 0,
	}

	// Parse session content
	file, err := os.Open(path)
	if err != nil {
		return session, nil
	}
	defer file.Close()

	decoder := json.NewDecoder(file)
	turnCount := 0
	
	for decoder.More() {
		var event struct {
			Type      string    `json:"type"`
			Message   json.RawMessage `json:"message"`
			Timestamp time.Time `json:"timestamp"`
		}
		
		if err := decoder.Decode(&event); err != nil {
			break
		}

		if session.StartTime.IsZero() && !event.Timestamp.IsZero() {
			session.StartTime = event.Timestamp
		}

		if event.Type == "user" && session.UserMessage == "" {
			var msg struct {
				Content string `json:"content"`
			}
			if json.Unmarshal(event.Message, &msg) == nil {
				if len(msg.Content) > 100 {
					session.UserMessage = msg.Content[:97] + "..."
				} else {
					session.UserMessage = msg.Content
				}
			}
		}

		if event.Type == "user" || event.Type == "assistant" {
			turnCount++
		}
	}

	session.TurnCount = turnCount / 2

	return session, nil
}

// ValidateRecovery checks if a specific session can be resumed
func (nm *NativeMonitor) ValidateRecovery(sessionID string, provider Provider) RecoveryStatus {
	nm.mu.RLock()
	session, exists := nm.sessions[sessionID]
	nm.mu.RUnlock()

	if !exists {
		// Try to find it
		nm.Scan()
		nm.mu.RLock()
		session, exists = nm.sessions[sessionID]
		nm.mu.RUnlock()
		
		if !exists {
			return RecoveryStatus{
				Recoverable: false,
				Reason:      "Session not found",
				SessionID:   sessionID,
				Provider:    provider,
			}
		}
	}

	// Validate file still exists and is readable
	if _, err := os.Stat(session.FilePath); err != nil {
		return RecoveryStatus{
			Recoverable: false,
			Reason:      fmt.Sprintf("Session file not accessible: %v", err),
			SessionID:   sessionID,
			Provider:    provider,
		}
	}

	// Validate file has content
	if session.FileSize == 0 {
		return RecoveryStatus{
			Recoverable: false,
			Reason:      "Session file is empty",
			SessionID:   sessionID,
			Provider:    provider,
		}
	}

	// All checks passed
	return RecoveryStatus{
		Recoverable: true,
		SessionID:   sessionID,
		Provider:    provider,
	}
}

// GetRecentSessions returns the N most recent sessions
func (nm *NativeMonitor) GetRecentSessions(count int) ([]*NativeSession, error) {
	sessions, err := nm.Scan()
	if err != nil {
		return nil, err
	}

	if len(sessions) > count {
		sessions = sessions[:count]
	}

	return sessions, nil
}

// GetActiveSession returns the most recently modified session
func (nm *NativeMonitor) GetActiveSession() (*NativeSession, error) {
	sessions, err := nm.GetRecentSessions(1)
	if err != nil || len(sessions) == 0 {
		return nil, fmt.Errorf("no active session found")
	}
	return sessions[0], nil
}
