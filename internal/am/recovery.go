// Package am provides recovery API for session restoration.
package am

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"time"
)

// =============================================================================
// Recovery State Types
// =============================================================================

// RecoveryState tracks active sessions for crash detection
type RecoveryState struct {
	Version        int                `json:"version"`
	LastHeartbeat  time.Time          `json:"lastHeartbeat"`
	ActiveSessions []ActiveSessionRef `json:"activeSessions"`
}

// ActiveSessionRef references an active session
type ActiveSessionRef struct {
	TabID       string    `json:"tabId"`
	SessionPath string    `json:"sessionPath"`
	LastWrite   time.Time `json:"lastWrite"`
}

// ProjectSummary provides project-level recovery info
type ProjectSummary struct {
	Name           string           `json:"name"`
	Path           string           `json:"path"`
	SessionCount   int              `json:"sessionCount"`
	LastActivity   time.Time        `json:"lastActivity"`
	RecoverCount   int              `json:"recoverCount"` // Sessions that need recovery
	RecentSessions []SessionSummary `json:"recentSessions"`
}

// =============================================================================
// Recovery API
// =============================================================================

// RecoveryAPI provides methods for session recovery
type RecoveryAPI struct {
	amDir   string
	manager *SessionManager
}

// NewRecoveryAPI creates a new recovery API instance
func NewRecoveryAPI(amDir string) *RecoveryAPI {
	return &RecoveryAPI{
		amDir:   amDir,
		manager: NewSessionManager(amDir),
	}
}

// GetRecoverableSessions returns all sessions that can be recovered
func (r *RecoveryAPI) GetRecoverableSessions() ([]*SessionSummary, error) {
	sessions, err := r.manager.RecoverSessions()
	if err != nil {
		return nil, fmt.Errorf("failed to recover sessions: %w", err)
	}

	summaries := make([]*SessionSummary, 0, len(sessions))
	for _, s := range sessions {
		summary := sessionToSummary(s)
		// Generate recovery prompt if not present
		if summary.RecoveryPrompt == "" {
			summary.RecoveryPrompt = GenerateRecoveryPrompt(s)
		}
		summaries = append(summaries, summary)
	}

	// Sort by start time (newest first)
	sort.Slice(summaries, func(i, j int) bool {
		return summaries[i].StartTime.After(summaries[j].StartTime)
	})

	return summaries, nil
}

// GetSessionSummary returns a detailed summary for a specific session
func (r *RecoveryAPI) GetSessionSummary(sessionID string) (*SessionSummary, error) {
	session, err := r.manager.LoadSession(sessionID)
	if err != nil {
		return nil, fmt.Errorf("failed to load session: %w", err)
	}

	summary := sessionToSummary(session)

	// Generate recovery prompt
	if summary.RecoveryPrompt == "" {
		summary.RecoveryPrompt = GenerateRecoveryPrompt(session)
	}

	return summary, nil
}

// MarkSessionRestored updates a session's status to recovered
func (r *RecoveryAPI) MarkSessionRestored(sessionID string) error {
	session, err := r.manager.LoadSession(sessionID)
	if err != nil {
		return fmt.Errorf("failed to load session: %w", err)
	}

	session.Status = StatusRecovered
	now := time.Now()
	session.EndTime = &now

	return r.manager.SaveSession(session)
}

// GetProjectSummaries returns recovery info grouped by project
func (r *RecoveryAPI) GetProjectSummaries() ([]*ProjectSummary, error) {
	projectsDir := filepath.Join(r.amDir, "projects")
	if _, err := os.Stat(projectsDir); os.IsNotExist(err) {
		return []*ProjectSummary{}, nil
	}

	// Find all project directories
	entries, err := os.ReadDir(projectsDir)
	if err != nil {
		return nil, fmt.Errorf("failed to read projects directory: %w", err)
	}

	summaries := make([]*ProjectSummary, 0)

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		projectName := entry.Name()
		projectPath := filepath.Join(projectsDir, projectName)

		// Get sessions for this project
		sessions, err := r.manager.GetProjectSessions(projectName, 10)
		if err != nil {
			log.Printf("[RecoveryAPI] Error getting sessions for %s: %v", projectName, err)
			continue
		}

		if len(sessions) == 0 {
			continue
		}

		// Build summary
		summary := &ProjectSummary{
			Name:           projectName,
			Path:           projectPath,
			SessionCount:   len(sessions),
			RecentSessions: make([]SessionSummary, 0),
		}

		// Count recoverable and find latest activity
		for _, s := range sessions {
			if s.Status == StatusCrashed || s.Status == StatusActive {
				summary.RecoverCount++
			}
			if s.StartTime.After(summary.LastActivity) {
				summary.LastActivity = s.StartTime
			}
			summary.RecentSessions = append(summary.RecentSessions, *s)
		}

		summaries = append(summaries, summary)
	}

	// Sort by last activity
	sort.Slice(summaries, func(i, j int) bool {
		return summaries[i].LastActivity.After(summaries[j].LastActivity)
	})

	return summaries, nil
}

// =============================================================================
// Recovery State Persistence
// =============================================================================

const recoveryStateFile = "recovery-state.json"

// SaveRecoveryState writes the recovery state to disk
func SaveRecoveryState(amDir string, state *RecoveryState) error {
	if err := os.MkdirAll(amDir, 0755); err != nil {
		return fmt.Errorf("failed to create AM directory: %w", err)
	}

	statePath := filepath.Join(amDir, recoveryStateFile)
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal state: %w", err)
	}

	// Write atomically
	tmpPath := statePath + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write state file: %w", err)
	}

	if err := os.Rename(tmpPath, statePath); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("failed to rename state file: %w", err)
	}

	return nil
}

// LoadRecoveryState reads the recovery state from disk
func LoadRecoveryState(amDir string) (*RecoveryState, error) {
	statePath := filepath.Join(amDir, recoveryStateFile)

	data, err := os.ReadFile(statePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil // No state file is not an error
		}
		return nil, fmt.Errorf("failed to read state file: %w", err)
	}

	var state RecoveryState
	if err := json.Unmarshal(data, &state); err != nil {
		return nil, fmt.Errorf("failed to unmarshal state: %w", err)
	}

	return &state, nil
}

// =============================================================================
// Heartbeat Management
// =============================================================================

// UpdateHeartbeat updates the heartbeat timestamp in the recovery state
func UpdateHeartbeat(amDir string) error {
	state, err := LoadRecoveryState(amDir)
	if err != nil {
		return err
	}

	if state == nil {
		state = &RecoveryState{
			Version:        1,
			ActiveSessions: []ActiveSessionRef{},
		}
	}

	state.LastHeartbeat = time.Now()

	return SaveRecoveryState(amDir, state)
}

// IsHeartbeatStale checks if the heartbeat is older than the threshold
func IsHeartbeatStale(state *RecoveryState, threshold time.Duration) bool {
	if state == nil {
		return true
	}
	return time.Since(state.LastHeartbeat) > threshold
}

// AddActiveSession adds a session to the recovery state
func AddActiveSession(amDir string, tabID string, sessionPath string) error {
	state, err := LoadRecoveryState(amDir)
	if err != nil {
		return err
	}

	if state == nil {
		state = &RecoveryState{
			Version:        1,
			LastHeartbeat:  time.Now(),
			ActiveSessions: []ActiveSessionRef{},
		}
	}

	// Check if already exists, update if so
	found := false
	for i, ref := range state.ActiveSessions {
		if ref.TabID == tabID {
			state.ActiveSessions[i].SessionPath = sessionPath
			state.ActiveSessions[i].LastWrite = time.Now()
			found = true
			break
		}
	}

	if !found {
		state.ActiveSessions = append(state.ActiveSessions, ActiveSessionRef{
			TabID:       tabID,
			SessionPath: sessionPath,
			LastWrite:   time.Now(),
		})
	}

	state.LastHeartbeat = time.Now()
	return SaveRecoveryState(amDir, state)
}

// RemoveActiveSession removes a session from the recovery state
func RemoveActiveSession(amDir string, tabID string) error {
	state, err := LoadRecoveryState(amDir)
	if err != nil {
		return err
	}

	if state == nil {
		return nil
	}

	// Filter out the session
	newSessions := make([]ActiveSessionRef, 0)
	for _, ref := range state.ActiveSessions {
		if ref.TabID != tabID {
			newSessions = append(newSessions, ref)
		}
	}
	state.ActiveSessions = newSessions
	state.LastHeartbeat = time.Now()

	return SaveRecoveryState(amDir, state)
}
