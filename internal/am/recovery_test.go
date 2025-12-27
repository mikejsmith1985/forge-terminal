package am

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// =============================================================================
// Recovery API Tests
// =============================================================================

func TestRecoveryAPI(t *testing.T) {
	t.Run("GetRecoverableSessions returns crashed sessions", func(t *testing.T) {
		tmpDir, err := os.MkdirTemp("", "recovery-api-*")
		if err != nil {
			t.Fatalf("Failed to create temp dir: %v", err)
		}
		defer os.RemoveAll(tmpDir)

		amDir := filepath.Join(tmpDir, "am")

		// Create a "crashed" session (active status, saved to disk)
		manager := NewSessionManager(amDir)
		projectCtx := &ProjectContext{
			Name:      "test-project",
			Path:      "/test/path",
			GitBranch: "main",
		}
		session := manager.StartSession("tab-crash", projectCtx)
		session.Turns = append(session.Turns, ConversationTurn{
			Role:    "user",
			Content: "Working on something important...",
		})
		session.Provider = "github-copilot"
		manager.SaveSession(session)

		// Simulate restart - new recovery API instance
		recovery := NewRecoveryAPI(amDir)
		sessions, err := recovery.GetRecoverableSessions()

		if err != nil {
			t.Fatalf("GetRecoverableSessions failed: %v", err)
		}
		if len(sessions) == 0 {
			t.Error("Should find at least one recoverable session")
		}
	})

	t.Run("GetSessionSummary returns detailed summary", func(t *testing.T) {
		tmpDir, err := os.MkdirTemp("", "recovery-summary-*")
		if err != nil {
			t.Fatalf("Failed to create temp dir: %v", err)
		}
		defer os.RemoveAll(tmpDir)

		amDir := filepath.Join(tmpDir, "am")

		// Create session with content
		manager := NewSessionManager(amDir)
		projectCtx := &ProjectContext{
			Name:      "summary-project",
			GitBranch: "feature",
		}
		session := manager.StartSession("tab-summary", projectCtx)
		session.Turns = append(session.Turns,
			ConversationTurn{Role: "user", Content: "First message"},
			ConversationTurn{Role: "assistant", Content: "First response"},
			ConversationTurn{Role: "user", Content: "Second message"},
		)
		session.Provider = "github-copilot"
		manager.SaveSession(session)

		recovery := NewRecoveryAPI(amDir)
		summary, err := recovery.GetSessionSummary(session.ID)

		if err != nil {
			t.Fatalf("GetSessionSummary failed: %v", err)
		}
		if summary == nil {
			t.Fatal("Summary should not be nil")
		}
		if summary.TurnCount != 3 {
			t.Errorf("Expected 3 turns, got %d", summary.TurnCount)
		}
		if summary.RecoveryPrompt == "" {
			t.Error("RecoveryPrompt should be generated")
		}
	})

	t.Run("MarkSessionRestored updates status", func(t *testing.T) {
		tmpDir, err := os.MkdirTemp("", "recovery-restore-*")
		if err != nil {
			t.Fatalf("Failed to create temp dir: %v", err)
		}
		defer os.RemoveAll(tmpDir)

		amDir := filepath.Join(tmpDir, "am")

		// Create crashed session
		manager := NewSessionManager(amDir)
		session := manager.StartSession("tab-restore", &ProjectContext{Name: "restore-test"})
		manager.SaveSession(session)

		recovery := NewRecoveryAPI(amDir)
		err = recovery.MarkSessionRestored(session.ID)

		if err != nil {
			t.Fatalf("MarkSessionRestored failed: %v", err)
		}

		// Verify status changed
		loaded, _ := manager.LoadSession(session.ID)
		if loaded.Status != StatusRecovered {
			t.Errorf("Expected status 'recovered', got '%s'", loaded.Status)
		}
	})

	t.Run("GetProjectSummaries groups by project", func(t *testing.T) {
		tmpDir, err := os.MkdirTemp("", "recovery-projects-*")
		if err != nil {
			t.Fatalf("Failed to create temp dir: %v", err)
		}
		defer os.RemoveAll(tmpDir)

		amDir := filepath.Join(tmpDir, "am")
		manager := NewSessionManager(amDir)

		// Create sessions for different projects
		s1 := manager.StartSession("tab-p1", &ProjectContext{Name: "project-a"})
		manager.SaveSession(s1)
		manager.EndSession("tab-p1")

		s2 := manager.StartSession("tab-p2", &ProjectContext{Name: "project-b"})
		manager.SaveSession(s2)
		manager.EndSession("tab-p2")

		s3 := manager.StartSession("tab-p3", &ProjectContext{Name: "project-a"})
		manager.SaveSession(s3)

		recovery := NewRecoveryAPI(amDir)
		summaries, err := recovery.GetProjectSummaries()

		if err != nil {
			t.Fatalf("GetProjectSummaries failed: %v", err)
		}
		if len(summaries) < 2 {
			t.Errorf("Expected at least 2 project summaries, got %d", len(summaries))
		}
	})
}

// =============================================================================
// RecoveryState Persistence Tests
// =============================================================================

func TestRecoveryStatePersistence(t *testing.T) {
	t.Run("SaveRecoveryState writes to file", func(t *testing.T) {
		tmpDir, err := os.MkdirTemp("", "recovery-state-*")
		if err != nil {
			t.Fatalf("Failed to create temp dir: %v", err)
		}
		defer os.RemoveAll(tmpDir)

		amDir := filepath.Join(tmpDir, "am")
		os.MkdirAll(amDir, 0755)

		state := &RecoveryState{
			Version:       1,
			LastHeartbeat: time.Now(),
			ActiveSessions: []ActiveSessionRef{
				{
					TabID:       "tab-1",
					SessionPath: "projects/test/session.json",
					LastWrite:   time.Now(),
				},
			},
		}

		err = SaveRecoveryState(amDir, state)
		if err != nil {
			t.Fatalf("SaveRecoveryState failed: %v", err)
		}

		// Check file exists
		statePath := filepath.Join(amDir, "recovery-state.json")
		if _, err := os.Stat(statePath); os.IsNotExist(err) {
			t.Error("recovery-state.json should exist")
		}
	})

	t.Run("LoadRecoveryState reads from file", func(t *testing.T) {
		tmpDir, err := os.MkdirTemp("", "recovery-load-*")
		if err != nil {
			t.Fatalf("Failed to create temp dir: %v", err)
		}
		defer os.RemoveAll(tmpDir)

		amDir := filepath.Join(tmpDir, "am")
		os.MkdirAll(amDir, 0755)

		// Write state file
		state := &RecoveryState{
			Version:       1,
			LastHeartbeat: time.Now(),
			ActiveSessions: []ActiveSessionRef{
				{TabID: "tab-load", SessionPath: "test/path.json"},
			},
		}
		data, _ := json.MarshalIndent(state, "", "  ")
		os.WriteFile(filepath.Join(amDir, "recovery-state.json"), data, 0644)

		loaded, err := LoadRecoveryState(amDir)
		if err != nil {
			t.Fatalf("LoadRecoveryState failed: %v", err)
		}
		if loaded == nil {
			t.Fatal("Loaded state should not be nil")
		}
		if len(loaded.ActiveSessions) != 1 {
			t.Errorf("Expected 1 active session, got %d", len(loaded.ActiveSessions))
		}
	})

	t.Run("LoadRecoveryState returns nil for missing file", func(t *testing.T) {
		tmpDir, err := os.MkdirTemp("", "recovery-missing-*")
		if err != nil {
			t.Fatalf("Failed to create temp dir: %v", err)
		}
		defer os.RemoveAll(tmpDir)

		amDir := filepath.Join(tmpDir, "am")
		os.MkdirAll(amDir, 0755)

		loaded, err := LoadRecoveryState(amDir)
		if err != nil {
			t.Fatalf("Should not error for missing file: %v", err)
		}
		if loaded != nil {
			t.Error("Should return nil for missing file")
		}
	})
}

// =============================================================================
// Heartbeat Tests
// =============================================================================

func TestHeartbeat(t *testing.T) {
	t.Run("UpdateHeartbeat updates state file", func(t *testing.T) {
		tmpDir, err := os.MkdirTemp("", "heartbeat-*")
		if err != nil {
			t.Fatalf("Failed to create temp dir: %v", err)
		}
		defer os.RemoveAll(tmpDir)

		amDir := filepath.Join(tmpDir, "am")
		os.MkdirAll(amDir, 0755)

		// Initial save
		state := &RecoveryState{Version: 1, LastHeartbeat: time.Now().Add(-1 * time.Minute)}
		SaveRecoveryState(amDir, state)

		// Update heartbeat
		err = UpdateHeartbeat(amDir)
		if err != nil {
			t.Fatalf("UpdateHeartbeat failed: %v", err)
		}

		// Verify updated
		loaded, _ := LoadRecoveryState(amDir)
		if time.Since(loaded.LastHeartbeat) > 5*time.Second {
			t.Error("Heartbeat should be updated to recent time")
		}
	})

	t.Run("IsHeartbeatStale detects old heartbeat", func(t *testing.T) {
		state := &RecoveryState{
			LastHeartbeat: time.Now().Add(-2 * time.Minute),
		}

		stale := IsHeartbeatStale(state, 1*time.Minute)
		if !stale {
			t.Error("2-minute-old heartbeat should be stale with 1-minute threshold")
		}
	})

	t.Run("IsHeartbeatStale returns false for recent", func(t *testing.T) {
		state := &RecoveryState{
			LastHeartbeat: time.Now().Add(-30 * time.Second),
		}

		stale := IsHeartbeatStale(state, 1*time.Minute)
		if stale {
			t.Error("30-second-old heartbeat should not be stale with 1-minute threshold")
		}
	})
}
