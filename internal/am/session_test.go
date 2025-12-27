package am

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

// =============================================================================
// Session Data Structure Tests
// =============================================================================

func TestSessionStructure(t *testing.T) {
	t.Run("Session has required fields", func(t *testing.T) {
		session := &Session{
			ID:        "sess-1735326351-abc123",
			TabID:     "tab-uuid-here",
			StartTime: time.Now(),
			Status:    StatusActive,
			Project: ProjectContext{
				Name:      "forge-terminal",
				Path:      "/home/user/projects/forge-terminal",
				GitBranch: "main",
			},
		}

		if session.ID == "" {
			t.Error("Session ID should not be empty")
		}
		if session.TabID == "" {
			t.Error("Session TabID should not be empty")
		}
		if session.StartTime.IsZero() {
			t.Error("Session StartTime should be set")
		}
		if session.Status != StatusActive {
			t.Errorf("Session Status should be active, got %s", session.Status)
		}
		if session.Project.Name == "" {
			t.Error("Project Name should not be empty")
		}
	})

	t.Run("Session status constants are defined", func(t *testing.T) {
		statuses := []SessionStatus{
			StatusActive,
			StatusComplete,
			StatusCrashed,
			StatusRecovered,
		}

		for _, s := range statuses {
			if s == "" {
				t.Error("Session status constant should not be empty")
			}
		}
	})

	t.Run("Session can have conversation turns", func(t *testing.T) {
		session := &Session{
			ID:        "sess-test",
			TabID:     "tab-1",
			StartTime: time.Now(),
			Status:    StatusActive,
			Turns: []ConversationTurn{
				{
					Role:      "user",
					Content:   "Hello, can you help me?",
					Timestamp: time.Now(),
				},
				{
					Role:      "assistant",
					Content:   "Of course! What do you need?",
					Timestamp: time.Now(),
				},
			},
		}

		if len(session.Turns) != 2 {
			t.Errorf("Session should have 2 turns, got %d", len(session.Turns))
		}
		if session.Turns[0].Role != "user" {
			t.Errorf("First turn should be user, got %s", session.Turns[0].Role)
		}
	})

	t.Run("Session can have raw captures", func(t *testing.T) {
		session := &Session{
			ID:        "sess-test",
			TabID:     "tab-1",
			StartTime: time.Now(),
			Status:    StatusActive,
			RawCaptures: []RawCapture{
				{
					Timestamp:   time.Now(),
					ContentHash: "sha256:abc123",
					ByteOffset:  0,
					ByteLength:  4096,
				},
			},
		}

		if len(session.RawCaptures) != 1 {
			t.Errorf("Session should have 1 raw capture, got %d", len(session.RawCaptures))
		}
		if session.RawCaptures[0].ContentHash == "" {
			t.Error("RawCapture ContentHash should not be empty")
		}
	})
}

// =============================================================================
// ProjectContext Tests
// =============================================================================

func TestProjectContext(t *testing.T) {
	t.Run("ProjectContext from git repository", func(t *testing.T) {
		ctx := ProjectContext{
			Name:      "forge-terminal",
			Path:      "/home/user/projects/forge-terminal",
			GitBranch: "main",
			GitRemote: "github.com/mikejsmith1985/forge-terminal",
		}

		if ctx.Name != "forge-terminal" {
			t.Errorf("Expected name 'forge-terminal', got '%s'", ctx.Name)
		}
		if ctx.GitBranch != "main" {
			t.Errorf("Expected branch 'main', got '%s'", ctx.GitBranch)
		}
	})

	t.Run("ProjectContext without git (adhoc)", func(t *testing.T) {
		ctx := ProjectContext{
			Name: "adhoc",
			Path: "/tmp/random-dir",
		}

		if ctx.Name != "adhoc" {
			t.Errorf("Expected name 'adhoc', got '%s'", ctx.Name)
		}
		if ctx.GitBranch != "" {
			t.Errorf("GitBranch should be empty for adhoc, got '%s'", ctx.GitBranch)
		}
	})
}

// =============================================================================
// SessionSummary Tests
// =============================================================================

func TestSessionSummary(t *testing.T) {
	t.Run("SessionSummary contains recovery info", func(t *testing.T) {
		summary := SessionSummary{
			ID:             "sess-123",
			Project:        "forge-terminal",
			Provider:       "github-copilot",
			StartTime:      time.Now().Add(-1 * time.Hour),
			Duration:       45 * time.Minute,
			TurnCount:      15,
			LastTopic:      "Designing session recovery system...",
			RecoveryPrompt: "Continue our conversation about session recovery...",
			Status:         StatusCrashed,
		}

		if summary.TurnCount != 15 {
			t.Errorf("Expected 15 turns, got %d", summary.TurnCount)
		}
		if summary.RecoveryPrompt == "" {
			t.Error("RecoveryPrompt should not be empty")
		}
		if summary.Status != StatusCrashed {
			t.Errorf("Expected status 'crashed', got '%s'", summary.Status)
		}
	})
}

// =============================================================================
// SessionManager Interface Tests
// =============================================================================

func TestSessionManagerBasicOperations(t *testing.T) {
	// Create temp directory for test
	tmpDir, err := os.MkdirTemp("", "am-session-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	amDir := filepath.Join(tmpDir, "am")

	t.Run("Create new SessionManager", func(t *testing.T) {
		manager := NewSessionManager(amDir)
		if manager == nil {
			t.Fatal("NewSessionManager should return non-nil manager")
		}
	})

	t.Run("StartSession creates new session", func(t *testing.T) {
		manager := NewSessionManager(amDir)
		projectCtx := &ProjectContext{
			Name:      "test-project",
			Path:      "/test/path",
			GitBranch: "main",
		}

		session := manager.StartSession("tab-123", projectCtx)

		if session == nil {
			t.Fatal("StartSession should return non-nil session")
		}
		if session.TabID != "tab-123" {
			t.Errorf("Expected TabID 'tab-123', got '%s'", session.TabID)
		}
		if session.Project.Name != "test-project" {
			t.Errorf("Expected project 'test-project', got '%s'", session.Project.Name)
		}
		if session.Status != StatusActive {
			t.Errorf("New session should be active, got '%s'", session.Status)
		}
		if session.ID == "" {
			t.Error("Session ID should be generated")
		}
	})

	t.Run("GetSession returns active session", func(t *testing.T) {
		manager := NewSessionManager(amDir)
		projectCtx := &ProjectContext{
			Name: "test-project",
			Path: "/test/path",
		}

		created := manager.StartSession("tab-456", projectCtx)
		retrieved := manager.GetSession("tab-456")

		if retrieved == nil {
			t.Fatal("GetSession should return the session")
		}
		if retrieved.ID != created.ID {
			t.Errorf("Retrieved session ID should match: expected '%s', got '%s'", created.ID, retrieved.ID)
		}
	})

	t.Run("GetSession returns nil for unknown tab", func(t *testing.T) {
		manager := NewSessionManager(amDir)
		session := manager.GetSession("nonexistent-tab")

		if session != nil {
			t.Error("GetSession should return nil for unknown tab")
		}
	})

	t.Run("EndSession marks session complete", func(t *testing.T) {
		manager := NewSessionManager(amDir)
		projectCtx := &ProjectContext{
			Name: "test-project",
			Path: "/test/path",
		}

		session := manager.StartSession("tab-789", projectCtx)
		err := manager.EndSession("tab-789")

		if err != nil {
			t.Fatalf("EndSession should not error: %v", err)
		}

		// Session should be marked complete
		if session.Status != StatusComplete {
			t.Errorf("Session should be complete, got '%s'", session.Status)
		}
		if session.EndTime == nil {
			t.Error("Session EndTime should be set")
		}

		// GetSession should return nil after ending
		if manager.GetSession("tab-789") != nil {
			t.Error("GetSession should return nil after EndSession")
		}
	})

	t.Run("EndSession returns error for unknown tab", func(t *testing.T) {
		manager := NewSessionManager(amDir)
		err := manager.EndSession("nonexistent-tab")

		if err == nil {
			t.Error("EndSession should return error for unknown tab")
		}
	})
}

// =============================================================================
// Session Persistence Tests
// =============================================================================

func TestSessionPersistence(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "am-session-persist-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	amDir := filepath.Join(tmpDir, "am")

	t.Run("Session is saved to disk", func(t *testing.T) {
		manager := NewSessionManager(amDir)
		projectCtx := &ProjectContext{
			Name:      "persist-test",
			Path:      "/test/path",
			GitBranch: "main",
		}

		session := manager.StartSession("tab-persist", projectCtx)
		session.Turns = append(session.Turns, ConversationTurn{
			Role:      "user",
			Content:   "Test message",
			Timestamp: time.Now(),
		})

		// Force save
		err := manager.SaveSession(session)
		if err != nil {
			t.Fatalf("SaveSession should not error: %v", err)
		}

		// Check file exists
		projectDir := filepath.Join(amDir, "projects", "persist-test")
		entries, err := os.ReadDir(projectDir)
		if err != nil {
			t.Fatalf("Project directory should exist: %v", err)
		}

		// Should have date subdirectory
		if len(entries) == 0 {
			t.Error("Project directory should have date subdirectory")
		}
	})

	t.Run("Session can be loaded from disk", func(t *testing.T) {
		manager := NewSessionManager(amDir)
		projectCtx := &ProjectContext{
			Name:      "load-test",
			Path:      "/test/path",
			GitBranch: "feature",
		}

		// Create and save session
		original := manager.StartSession("tab-load", projectCtx)
		original.Turns = append(original.Turns, ConversationTurn{
			Role:      "user",
			Content:   "Original message",
			Timestamp: time.Now(),
		})
		err := manager.SaveSession(original)
		if err != nil {
			t.Fatalf("SaveSession failed: %v", err)
		}

		// Create new manager and load
		manager2 := NewSessionManager(amDir)
		loaded, err := manager2.LoadSession(original.ID)
		if err != nil {
			t.Fatalf("LoadSession failed: %v", err)
		}

		if loaded == nil {
			t.Fatal("LoadSession should return session")
		}
		if loaded.ID != original.ID {
			t.Errorf("Loaded session ID mismatch: expected '%s', got '%s'", original.ID, loaded.ID)
		}
		if len(loaded.Turns) != 1 {
			t.Errorf("Loaded session should have 1 turn, got %d", len(loaded.Turns))
		}
		if loaded.Turns[0].Content != "Original message" {
			t.Errorf("Turn content mismatch: got '%s'", loaded.Turns[0].Content)
		}
	})
}

// =============================================================================
// Session Recovery Tests
// =============================================================================

func TestSessionRecovery(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "am-session-recovery-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	amDir := filepath.Join(tmpDir, "am")

	t.Run("RecoverSessions finds crashed sessions", func(t *testing.T) {
		manager := NewSessionManager(amDir)

		// Create an "active" session (simulating crash)
		projectCtx := &ProjectContext{
			Name: "crash-test",
			Path: "/test/path",
		}
		session := manager.StartSession("tab-crash", projectCtx)
		session.Turns = append(session.Turns, ConversationTurn{
			Role:    "user",
			Content: "I was working on something...",
		})
		err := manager.SaveSession(session)
		if err != nil {
			t.Fatalf("SaveSession failed: %v", err)
		}

		// Simulate crash by creating new manager (old one "died")
		manager2 := NewSessionManager(amDir)
		recovered, err := manager2.RecoverSessions()
		if err != nil {
			t.Fatalf("RecoverSessions failed: %v", err)
		}

		if len(recovered) == 0 {
			t.Error("Should find at least one crashed session")
		}

		// Find our session
		var found *Session
		for _, s := range recovered {
			if s.ID == session.ID {
				found = s
				break
			}
		}

		if found == nil {
			t.Error("Should find the crashed session")
		} else {
			if found.Status != StatusCrashed {
				t.Errorf("Recovered session should be marked crashed, got '%s'", found.Status)
			}
		}
	})

	t.Run("GetProjectSessions returns recent sessions", func(t *testing.T) {
		manager := NewSessionManager(amDir)

		// Create multiple sessions for same project
		projectCtx := &ProjectContext{
			Name: "multi-session",
			Path: "/test/path",
		}

		for i := 0; i < 3; i++ {
			s := manager.StartSession("tab-multi-"+string(rune('0'+i)), projectCtx)
			s.Turns = append(s.Turns, ConversationTurn{
				Role:    "user",
				Content: "Session content",
			})
			manager.SaveSession(s)
			manager.EndSession("tab-multi-" + string(rune('0'+i)))
		}

		summaries, err := manager.GetProjectSessions("multi-session", 10)
		if err != nil {
			t.Fatalf("GetProjectSessions failed: %v", err)
		}

		if len(summaries) != 3 {
			t.Errorf("Expected 3 sessions, got %d", len(summaries))
		}
	})
}

// =============================================================================
// Recovery Prompt Generation Tests
// =============================================================================

func TestRecoveryPromptGeneration(t *testing.T) {
	t.Run("GenerateRecoveryPrompt creates meaningful prompt", func(t *testing.T) {
		session := &Session{
			ID:        "sess-prompt-test",
			TabID:     "tab-1",
			StartTime: time.Now().Add(-1 * time.Hour),
			Status:    StatusCrashed,
			Project: ProjectContext{
				Name:      "forge-terminal",
				GitBranch: "main",
			},
			Turns: []ConversationTurn{
				{Role: "user", Content: "Help me design a session recovery system"},
				{Role: "assistant", Content: "Sure, let me help with that..."},
				{Role: "user", Content: "Can you add persistence?"},
			},
		}

		prompt := GenerateRecoveryPrompt(session)

		if prompt == "" {
			t.Error("Recovery prompt should not be empty")
		}
		if len(prompt) < 50 {
			t.Errorf("Recovery prompt seems too short: '%s'", prompt)
		}
		// Should mention project
		if !containsString(prompt, "forge-terminal") {
			t.Error("Recovery prompt should mention project name")
		}
		// Should mention last user message context
		if !containsString(prompt, "persistence") {
			t.Error("Recovery prompt should reference last user message")
		}
	})

	t.Run("GenerateRecoveryPrompt handles empty turns", func(t *testing.T) {
		session := &Session{
			ID:        "sess-empty",
			TabID:     "tab-1",
			StartTime: time.Now(),
			Status:    StatusCrashed,
			Project: ProjectContext{
				Name: "test-project",
			},
			Turns: []ConversationTurn{},
		}

		prompt := GenerateRecoveryPrompt(session)

		if prompt == "" {
			t.Error("Should generate prompt even with empty turns")
		}
	})
}

// Helper function
func containsString(haystack, needle string) bool {
	return len(haystack) >= len(needle) && (haystack == needle || len(needle) == 0 ||
		(len(haystack) > 0 && len(needle) > 0 && findSubstring(haystack, needle)))
}

func findSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
