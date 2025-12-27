// Package am provides the Artificial Memory session management system.
package am

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// =============================================================================
// Session Status Constants
// =============================================================================

// SessionStatus tracks session state
type SessionStatus string

const (
	StatusActive    SessionStatus = "active"
	StatusComplete  SessionStatus = "complete"
	StatusCrashed   SessionStatus = "crashed"
	StatusRecovered SessionStatus = "recovered"
)

// =============================================================================
// Core Data Structures
// =============================================================================

// Session represents an active capture session
type Session struct {
	ID             string             `json:"id"`
	TabID          string             `json:"tabId"`
	Project        ProjectContext     `json:"project"`
	StartTime      time.Time          `json:"startTime"`
	EndTime        *time.Time         `json:"endTime,omitempty"`
	Provider       string             `json:"provider,omitempty"`
	Turns          []ConversationTurn `json:"turns"`
	RawCaptures    []RawCapture       `json:"rawCaptures,omitempty"`
	RecoveryPrompt string             `json:"recoveryPrompt,omitempty"`
	Status         SessionStatus      `json:"status"`
	Metadata       SessionMetadata    `json:"metadata,omitempty"`
	mu             sync.RWMutex       // Protects concurrent access
}

// SessionMetadata holds additional context
type SessionMetadata struct {
	ShellType    string `json:"shellType,omitempty"`
	TerminalCols int    `json:"terminalCols,omitempty"`
	TerminalRows int    `json:"terminalRows,omitempty"`
}

// ProjectContext provides human-readable session context
type ProjectContext struct {
	Name      string `json:"name"`                // "forge-terminal"
	Path      string `json:"path"`                // "/home/user/projects/forge-terminal"
	GitBranch string `json:"gitBranch,omitempty"` // "main"
	GitRemote string `json:"gitRemote,omitempty"` // For cross-machine recovery
}

// RawCapture stores periodic PTY snapshots
type RawCapture struct {
	Timestamp   time.Time `json:"timestamp"`
	ContentHash string    `json:"contentHash"` // For deduplication
	ByteOffset  int64     `json:"byteOffset"`  // Offset in .raw file
	ByteLength  int       `json:"byteLength"`
}

// SessionSummary for UI display
type SessionSummary struct {
	ID             string        `json:"id"`
	Project        string        `json:"project"`
	Provider       string        `json:"provider"`
	StartTime      time.Time     `json:"startTime"`
	Duration       time.Duration `json:"duration"`
	TurnCount      int           `json:"turnCount"`
	LastTopic      string        `json:"lastTopic"`      // First 100 chars of last user message
	RecoveryPrompt string        `json:"recoveryPrompt"` // Suggested prompt for context restoration
	Status         SessionStatus `json:"status"`
}

// =============================================================================
// SessionManager Implementation
// =============================================================================

// SessionManager handles project-based session lifecycle
type SessionManager struct {
	amDir          string
	activeSessions map[string]*Session // tabID -> Session
	sessionIndex   map[string]string   // sessionID -> file path
	mu             sync.RWMutex
}

// NewSessionManager creates a new session manager
func NewSessionManager(amDir string) *SessionManager {
	sm := &SessionManager{
		amDir:          amDir,
		activeSessions: make(map[string]*Session),
		sessionIndex:   make(map[string]string),
	}

	// Ensure directories exist
	if err := os.MkdirAll(filepath.Join(amDir, "projects"), 0755); err != nil {
		log.Printf("[SessionManager] Warning: Failed to create projects dir: %v", err)
	}

	return sm
}

// StartSession begins tracking a new session for a tab
func (sm *SessionManager) StartSession(tabID string, projectCtx *ProjectContext) *Session {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	// Generate unique session ID
	sessionID := generateNewSessionID()

	// Create new session
	session := &Session{
		ID:        sessionID,
		TabID:     tabID,
		StartTime: time.Now(),
		Status:    StatusActive,
		Turns:     []ConversationTurn{},
	}

	// Set project context
	if projectCtx != nil {
		session.Project = *projectCtx
	} else {
		session.Project = ProjectContext{Name: "adhoc"}
	}

	// Store in active sessions
	sm.activeSessions[tabID] = session

	log.Printf("[SessionManager] Started session %s for tab %s (project: %s)",
		sessionID, tabID, session.Project.Name)

	return session
}

// GetSession retrieves active session for a tab
func (sm *SessionManager) GetSession(tabID string) *Session {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	return sm.activeSessions[tabID]
}

// EndSession finalizes and persists a session
func (sm *SessionManager) EndSession(tabID string) error {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	session, exists := sm.activeSessions[tabID]
	if !exists {
		return fmt.Errorf("no active session for tab %s", tabID)
	}

	// Mark as complete
	now := time.Now()
	session.EndTime = &now
	session.Status = StatusComplete

	// Generate recovery prompt before saving
	session.RecoveryPrompt = GenerateRecoveryPrompt(session)

	// Save to disk
	if err := sm.saveSessionInternal(session); err != nil {
		log.Printf("[SessionManager] Error saving session %s: %v", session.ID, err)
		return err
	}

	// Remove from active sessions
	delete(sm.activeSessions, tabID)

	log.Printf("[SessionManager] Ended session %s for tab %s", session.ID, tabID)
	return nil
}

// SaveSession persists a session to disk
func (sm *SessionManager) SaveSession(session *Session) error {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	return sm.saveSessionInternal(session)
}

// saveSessionInternal saves session without locking (caller must hold lock)
func (sm *SessionManager) saveSessionInternal(session *Session) error {
	// Build path: projects/{project}/{date}/session-{time}-{tabShort}.json
	projectDir := sm.getProjectDir(session.Project.Name)
	dateDir := filepath.Join(projectDir, session.StartTime.Format("2006-01-02"))

	if err := os.MkdirAll(dateDir, 0755); err != nil {
		return fmt.Errorf("failed to create date directory: %w", err)
	}

	// Generate filename
	filename := sm.generateFilename(session)
	filePath := filepath.Join(dateDir, filename)

	// Marshal session
	data, err := json.MarshalIndent(session, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal session: %w", err)
	}

	// Write atomically (write to temp, then rename)
	tmpPath := filePath + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write session file: %w", err)
	}

	if err := os.Rename(tmpPath, filePath); err != nil {
		os.Remove(tmpPath) // Clean up temp file
		return fmt.Errorf("failed to rename session file: %w", err)
	}

	// Update index
	sm.sessionIndex[session.ID] = filePath

	log.Printf("[SessionManager] Saved session %s to %s", session.ID, filePath)
	return nil
}

// LoadSession loads a session by ID
func (sm *SessionManager) LoadSession(sessionID string) (*Session, error) {
	sm.mu.RLock()
	filePath, exists := sm.sessionIndex[sessionID]
	sm.mu.RUnlock()

	// If not in index, scan for it
	if !exists {
		var err error
		filePath, err = sm.findSessionFile(sessionID)
		if err != nil {
			return nil, err
		}
	}

	// Read file
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read session file: %w", err)
	}

	var session Session
	if err := json.Unmarshal(data, &session); err != nil {
		return nil, fmt.Errorf("failed to unmarshal session: %w", err)
	}

	return &session, nil
}

// RecoverSessions finds and returns crashed/incomplete sessions
func (sm *SessionManager) RecoverSessions() ([]*Session, error) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	var recovered []*Session

	projectsDir := filepath.Join(sm.amDir, "projects")
	if _, err := os.Stat(projectsDir); os.IsNotExist(err) {
		return recovered, nil
	}

	// Walk all project directories
	err := filepath.Walk(projectsDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // Skip errors, continue walking
		}

		// Only process .json files
		if info.IsDir() || !strings.HasSuffix(path, ".json") {
			return nil
		}

		// Read and parse session
		data, err := os.ReadFile(path)
		if err != nil {
			return nil
		}

		var session Session
		if err := json.Unmarshal(data, &session); err != nil {
			return nil
		}

		// Find active sessions (these crashed)
		if session.Status == StatusActive {
			session.Status = StatusCrashed
			recovered = append(recovered, &session)

			// Update index
			sm.sessionIndex[session.ID] = path
		}

		return nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to walk sessions: %w", err)
	}

	log.Printf("[SessionManager] Recovered %d crashed sessions", len(recovered))
	return recovered, nil
}

// GetProjectSessions returns recent sessions for a project
func (sm *SessionManager) GetProjectSessions(project string, limit int) ([]*SessionSummary, error) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	var summaries []*SessionSummary

	projectDir := sm.getProjectDir(project)
	if _, err := os.Stat(projectDir); os.IsNotExist(err) {
		return summaries, nil
	}

	// Walk project directory
	var sessions []*Session
	err := filepath.Walk(projectDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() || !strings.HasSuffix(path, ".json") {
			return nil
		}

		data, err := os.ReadFile(path)
		if err != nil {
			return nil
		}

		var session Session
		if err := json.Unmarshal(data, &session); err != nil {
			return nil
		}

		sessions = append(sessions, &session)
		return nil
	})

	if err != nil {
		return nil, err
	}

	// Sort by start time (newest first)
	sort.Slice(sessions, func(i, j int) bool {
		return sessions[i].StartTime.After(sessions[j].StartTime)
	})

	// Limit results
	if limit > 0 && len(sessions) > limit {
		sessions = sessions[:limit]
	}

	// Convert to summaries
	for _, s := range sessions {
		summary := sessionToSummary(s)
		summaries = append(summaries, summary)
	}

	return summaries, nil
}

// =============================================================================
// Helper Functions
// =============================================================================

// generateNewSessionID creates a unique session ID for the new session system
func generateNewSessionID() string {
	timestamp := time.Now().UnixNano()
	hash := sha256.Sum256([]byte(fmt.Sprintf("%d-%d", timestamp, time.Now().UnixMicro())))
	shortHash := hex.EncodeToString(hash[:])[:8]
	return fmt.Sprintf("sess-%d-%s", timestamp/1e9, shortHash)
}

// getProjectDir returns the directory for a project
func (sm *SessionManager) getProjectDir(projectName string) string {
	// Sanitize project name for filesystem
	safeName := sanitizeProjectName(projectName)
	if safeName == "" {
		safeName = "adhoc"
	}
	return filepath.Join(sm.amDir, "projects", safeName)
}

// generateFilename creates a human-readable filename for a session
func (sm *SessionManager) generateFilename(session *Session) string {
	timeStr := session.StartTime.Format("15h04m05s")
	// Use session ID suffix for uniqueness
	idSuffix := session.ID
	if len(idSuffix) > 12 {
		// Extract the unique hash part from "sess-timestamp-hash"
		parts := strings.Split(idSuffix, "-")
		if len(parts) >= 3 {
			idSuffix = parts[len(parts)-1]
		} else {
			idSuffix = idSuffix[len(idSuffix)-8:]
		}
	}
	return fmt.Sprintf("session-%s-%s.json", timeStr, idSuffix)
}

// findSessionFile searches for a session file by ID
func (sm *SessionManager) findSessionFile(sessionID string) (string, error) {
	projectsDir := filepath.Join(sm.amDir, "projects")

	var foundPath string
	err := filepath.Walk(projectsDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() || !strings.HasSuffix(path, ".json") {
			return nil
		}

		data, err := os.ReadFile(path)
		if err != nil {
			return nil
		}

		// Quick check for session ID in file
		if strings.Contains(string(data), sessionID) {
			var session Session
			if err := json.Unmarshal(data, &session); err == nil {
				if session.ID == sessionID {
					foundPath = path
					return filepath.SkipAll // Stop walking
				}
			}
		}
		return nil
	})

	if err != nil && err != filepath.SkipAll {
		return "", err
	}

	if foundPath == "" {
		return "", fmt.Errorf("session %s not found", sessionID)
	}

	return foundPath, nil
}

// sessionToSummary converts a Session to SessionSummary
func sessionToSummary(s *Session) *SessionSummary {
	var duration time.Duration
	if s.EndTime != nil {
		duration = s.EndTime.Sub(s.StartTime)
	} else {
		duration = time.Since(s.StartTime)
	}

	lastTopic := ""
	for i := len(s.Turns) - 1; i >= 0; i-- {
		if s.Turns[i].Role == "user" {
			lastTopic = s.Turns[i].Content
			if len(lastTopic) > 100 {
				lastTopic = lastTopic[:100] + "..."
			}
			break
		}
	}

	return &SessionSummary{
		ID:             s.ID,
		Project:        s.Project.Name,
		Provider:       s.Provider,
		StartTime:      s.StartTime,
		Duration:       duration,
		TurnCount:      len(s.Turns),
		LastTopic:      lastTopic,
		RecoveryPrompt: s.RecoveryPrompt,
		Status:         s.Status,
	}
}

// GenerateRecoveryPrompt creates a prompt to restore LLM context
func GenerateRecoveryPrompt(session *Session) string {
	if session == nil {
		return ""
	}

	project := session.Project.Name
	branch := session.Project.GitBranch
	turnCount := len(session.Turns)

	// Find last user message
	var lastUserMessage string
	for i := len(session.Turns) - 1; i >= 0; i-- {
		if session.Turns[i].Role == "user" {
			lastUserMessage = session.Turns[i].Content
			break
		}
	}

	// Truncate if too long
	if len(lastUserMessage) > 200 {
		lastUserMessage = lastUserMessage[:200] + "..."
	}

	// Build prompt
	var parts []string
	parts = append(parts, fmt.Sprintf("Continue our conversation in the %s project", project))

	if branch != "" {
		parts[0] = fmt.Sprintf("Continue our conversation in the %s project (branch: %s)", project, branch)
	}

	if turnCount > 0 {
		parts = append(parts, fmt.Sprintf("We had %d exchanges.", turnCount))
	}

	if lastUserMessage != "" {
		parts = append(parts, fmt.Sprintf("My last message was: \"%s\"", lastUserMessage))
	}

	parts = append(parts, "Please acknowledge the context and continue from where we left off.")

	return strings.Join(parts, " ")
}
