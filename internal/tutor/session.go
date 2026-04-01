package tutor

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/storage"
)

// SessionManager handles creation, persistence, and navigation of tutor sessions.
type SessionManager struct {
	mu       sync.RWMutex
	sessions map[string]*TutorSession
	dataDir  string
}

// NewSessionManager creates a SessionManager and loads any persisted sessions from disk.
func NewSessionManager() *SessionManager {
	dataDir := filepath.Join(storage.GetForgeDir(), "tutor")
	if err := os.MkdirAll(dataDir, 0700); err != nil {
		log.Printf("[Tutor Session] Failed to create data dir %s: %v", dataDir, err)
	}

	sm := &SessionManager{
		sessions: make(map[string]*TutorSession),
		dataDir:  dataDir,
	}

	if err := sm.loadSessions(); err != nil {
		log.Printf("[Tutor Session] Failed to load sessions: %v", err)
	}

	return sm
}

// sessionID returns a deterministic ID for a project path (first 12 hex chars of SHA-256).
func sessionID(projectPath string) string {
	h := sha256.Sum256([]byte(projectPath))
	return fmt.Sprintf("%x", h[:6]) // 6 bytes = 12 hex chars
}

// CreateSession creates a new tutor session or resumes an existing one for the given project.
func (sm *SessionManager) CreateSession(projectPath string, learningPath *LearningPath, mode TutorMode) (*TutorSession, error) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	id := sessionID(projectPath)

	// Resume existing session for this project
	if existing, ok := sm.sessions[id]; ok {
		log.Printf("[Tutor Session] Resuming existing session %s for %s", id, projectPath)
		return existing, nil
	}

	now := time.Now()
	progress := make(map[string]FileStatus, len(learningPath.Files))
	for _, f := range learningPath.Files {
		progress[f.Path] = StatusPending
	}

	session := &TutorSession{
		ID:           id,
		ProjectPath:  projectPath,
		LearningPath: learningPath,
		CurrentIndex: 0,
		Progress:     progress,
		Mode:         mode,
		Settings:     DefaultSettings(),
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	sm.sessions[id] = session

	if err := sm.saveSession(session); err != nil {
		return nil, fmt.Errorf("save session: %w", err)
	}

	log.Printf("[Tutor Session] Created session %s for %s (%d files)", id, projectPath, len(learningPath.Files))
	return session, nil
}

// GetSession returns the session with the given ID, or an error if not found.
func (sm *SessionManager) GetSession(sessionID string) (*TutorSession, error) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	session, ok := sm.sessions[sessionID]
	if !ok {
		return nil, fmt.Errorf("session %s not found", sessionID)
	}
	return session, nil
}

// DeleteSession removes a session from memory and deletes its file on disk.
func (sm *SessionManager) DeleteSession(sessionID string) error {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	if _, ok := sm.sessions[sessionID]; !ok {
		return fmt.Errorf("session %s not found", sessionID)
	}

	delete(sm.sessions, sessionID)

	filePath := filepath.Join(sm.dataDir, sessionID+".json")
	if err := os.Remove(filePath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove session file: %w", err)
	}

	log.Printf("[Tutor Session] Deleted session %s", sessionID)
	return nil
}

// Advance marks the current file as reviewed and moves to the next non-skipped file.
func (sm *SessionManager) Advance(sessionID string) (*TutorSession, error) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	session, ok := sm.sessions[sessionID]
	if !ok {
		return nil, fmt.Errorf("session %s not found", sessionID)
	}

	files := session.LearningPath.Files
	total := len(files)
	if total == 0 {
		return nil, fmt.Errorf("session %s has no files", sessionID)
	}

	// Mark current file as reviewed
	if session.CurrentIndex >= 0 && session.CurrentIndex < total {
		session.Progress[files[session.CurrentIndex].Path] = StatusReviewed
	}

	// Advance to next non-reviewed, non-skipped file
	next := session.CurrentIndex + 1
	for next < total {
		status := session.Progress[files[next].Path]
		if status != StatusReviewed && status != StatusSkipped {
			break
		}
		next++
	}
	session.CurrentIndex = next
	session.UpdatedAt = time.Now()

	if err := sm.saveSession(session); err != nil {
		return nil, fmt.Errorf("save session: %w", err)
	}

	log.Printf("[Tutor Session] Advanced session %s to index %d", sessionID, next)
	return session, nil
}

// GoBack moves to the previous file in the learning path.
func (sm *SessionManager) GoBack(sessionID string) (*TutorSession, error) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	session, ok := sm.sessions[sessionID]
	if !ok {
		return nil, fmt.Errorf("session %s not found", sessionID)
	}

	if session.CurrentIndex <= 0 {
		return nil, fmt.Errorf("already at the first file")
	}

	session.CurrentIndex--
	session.UpdatedAt = time.Now()

	if err := sm.saveSession(session); err != nil {
		return nil, fmt.Errorf("save session: %w", err)
	}

	log.Printf("[Tutor Session] Moved session %s back to index %d", sessionID, session.CurrentIndex)
	return session, nil
}

// GoTo jumps to a specific file index in the learning path.
func (sm *SessionManager) GoTo(sessionID string, fileIndex int) (*TutorSession, error) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	session, ok := sm.sessions[sessionID]
	if !ok {
		return nil, fmt.Errorf("session %s not found", sessionID)
	}

	total := len(session.LearningPath.Files)
	if fileIndex < 0 || fileIndex >= total {
		return nil, fmt.Errorf("file index %d out of range [0, %d)", fileIndex, total)
	}

	session.CurrentIndex = fileIndex
	session.UpdatedAt = time.Now()

	if err := sm.saveSession(session); err != nil {
		return nil, fmt.Errorf("save session: %w", err)
	}

	log.Printf("[Tutor Session] Jumped session %s to index %d", sessionID, fileIndex)
	return session, nil
}

// Skip marks the current file as skipped and advances to the next file.
func (sm *SessionManager) Skip(sessionID string) (*TutorSession, error) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	session, ok := sm.sessions[sessionID]
	if !ok {
		return nil, fmt.Errorf("session %s not found", sessionID)
	}

	files := session.LearningPath.Files
	total := len(files)
	if total == 0 {
		return nil, fmt.Errorf("session %s has no files", sessionID)
	}

	// Mark current file as skipped
	if session.CurrentIndex >= 0 && session.CurrentIndex < total {
		session.Progress[files[session.CurrentIndex].Path] = StatusSkipped
	}

	// Advance to next non-reviewed, non-skipped file
	next := session.CurrentIndex + 1
	for next < total {
		status := session.Progress[files[next].Path]
		if status != StatusReviewed && status != StatusSkipped {
			break
		}
		next++
	}
	session.CurrentIndex = next
	session.UpdatedAt = time.Now()

	if err := sm.saveSession(session); err != nil {
		return nil, fmt.Errorf("save session: %w", err)
	}

	log.Printf("[Tutor Session] Skipped file in session %s, now at index %d", sessionID, next)
	return session, nil
}

// UpdateSettings replaces the session's settings.
func (sm *SessionManager) UpdateSettings(sessionID string, settings TutorSettings) error {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	session, ok := sm.sessions[sessionID]
	if !ok {
		return fmt.Errorf("session %s not found", sessionID)
	}

	session.Settings = settings
	session.UpdatedAt = time.Now()

	if err := sm.saveSession(session); err != nil {
		return fmt.Errorf("save session: %w", err)
	}

	log.Printf("[Tutor Session] Updated settings for session %s", sessionID)
	return nil
}

// ListSessions returns all active sessions.
func (sm *SessionManager) ListSessions() []*TutorSession {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	result := make([]*TutorSession, 0, len(sm.sessions))
	for _, s := range sm.sessions {
		result = append(result, s)
	}
	return result
}

// saveSession persists a session to disk as indented JSON.
func (sm *SessionManager) saveSession(session *TutorSession) error {
	data, err := json.MarshalIndent(session, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal session: %w", err)
	}

	filePath := filepath.Join(sm.dataDir, session.ID+".json")
	if err := os.WriteFile(filePath, data, 0600); err != nil {
		return fmt.Errorf("write session file: %w", err)
	}
	return nil
}

// loadSessions reads all session JSON files from the data directory.
func (sm *SessionManager) loadSessions() error {
	entries, err := os.ReadDir(sm.dataDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("read data dir: %w", err)
	}

	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}

		filePath := filepath.Join(sm.dataDir, entry.Name())
		data, err := os.ReadFile(filePath)
		if err != nil {
			log.Printf("[Tutor Session] Failed to read %s: %v", entry.Name(), err)
			continue
		}

		var session TutorSession
		if err := json.Unmarshal(data, &session); err != nil {
			log.Printf("[Tutor Session] Failed to parse %s: %v", entry.Name(), err)
			continue
		}

		sm.sessions[session.ID] = &session
		log.Printf("[Tutor Session] Loaded session %s for %s", session.ID, session.ProjectPath)
	}

	return nil
}
