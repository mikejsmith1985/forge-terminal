package terminal

import (
	"sync"
	"testing"
)

// TestContextManager_SetGetContext verifies basic context storage and retrieval.
func TestContextManager_SetGetContext(t *testing.T) {
	cm := NewContextManager()
	sessionID := "test-session-1"

	// Initially, no context should exist
	ctx := cm.GetContext(sessionID)
	if ctx != nil {
		t.Errorf("Expected nil context for new session, got %+v", ctx)
	}

	// Set a context
	testContext := &PersistentContext{
		Enabled: true,
		Text:    "You are a senior engineer. Be concise.",
	}
	cm.SetContext(sessionID, testContext)

	// Retrieve the context
	retrieved := cm.GetContext(sessionID)
	if retrieved == nil {
		t.Fatal("Expected context to be retrieved, got nil")
	}
	if !retrieved.Enabled {
		t.Error("Expected context to be enabled")
	}
	if retrieved.Text != testContext.Text {
		t.Errorf("Expected text %q, got %q", testContext.Text, retrieved.Text)
	}
}

// TestContextManager_ClearContext verifies context deletion.
func TestContextManager_ClearContext(t *testing.T) {
	cm := NewContextManager()
	sessionID := "test-session-2"

	// Set a context
	cm.SetContext(sessionID, &PersistentContext{
		Enabled: true,
		Text:    "Test instruction",
	})

	// Verify it exists
	if cm.GetContext(sessionID) == nil {
		t.Fatal("Expected context to exist before clearing")
	}

	// Clear it
	cm.ClearContext(sessionID)

	// Verify it's gone
	if ctx := cm.GetContext(sessionID); ctx != nil {
		t.Errorf("Expected nil after clearing, got %+v", ctx)
	}
}

// TestContextManager_MultipleSessionsIsolation verifies session isolation.
func TestContextManager_MultipleSessionsIsolation(t *testing.T) {
	cm := NewContextManager()
	session1 := "session-A"
	session2 := "session-B"

	// Set different contexts for two sessions
	cm.SetContext(session1, &PersistentContext{
		Enabled: true,
		Text:    "Context for session A",
	})
	cm.SetContext(session2, &PersistentContext{
		Enabled: false,
		Text:    "Context for session B",
	})

	// Verify session1 context
	ctx1 := cm.GetContext(session1)
	if ctx1 == nil || !ctx1.Enabled || ctx1.Text != "Context for session A" {
		t.Errorf("Session1 context mismatch: %+v", ctx1)
	}

	// Verify session2 context
	ctx2 := cm.GetContext(session2)
	if ctx2 == nil || ctx2.Enabled || ctx2.Text != "Context for session B" {
		t.Errorf("Session2 context mismatch: %+v", ctx2)
	}

	// Clear session1 should not affect session2
	cm.ClearContext(session1)
	if cm.GetContext(session1) != nil {
		t.Error("Session1 should be cleared")
	}
	if cm.GetContext(session2) == nil {
		t.Error("Session2 should still exist after clearing session1")
	}
}

// TestContextManager_ThreadSafety verifies concurrent access safety.
func TestContextManager_ThreadSafety(t *testing.T) {
	cm := NewContextManager()
	const numGoroutines = 100
	const numOperations = 50

	var wg sync.WaitGroup
	wg.Add(numGoroutines)

	// Spawn goroutines performing concurrent Set/Get/Clear operations
	for i := 0; i < numGoroutines; i++ {
		go func(id int) {
			defer wg.Done()
			sessionID := "concurrent-session"
			for j := 0; j < numOperations; j++ {
				// Set
				cm.SetContext(sessionID, &PersistentContext{
					Enabled: true,
					Text:    "Concurrent test",
				})
				// Get
				cm.GetContext(sessionID)
				// Clear
				if j%10 == 0 {
					cm.ClearContext(sessionID)
				}
			}
		}(i)
	}

	wg.Wait()
	// If we reach here without data races, test passes
}

// TestIsLLMCommand_CopilotCommands verifies copilot detection.
func TestIsLLMCommand_CopilotCommands(t *testing.T) {
	tests := []struct {
		cmd      string
		expected bool
	}{
		{"copilot explain this code", true},
		{"copilot", true},
		{"  copilot  ", true}, // whitespace trimming
		{"COPILOT --help", true}, // case insensitive
		{"gh copilot suggest", true}, // GitHub CLI copilot
	}

	for _, tt := range tests {
		t.Run(tt.cmd, func(t *testing.T) {
			result := IsLLMCommand(tt.cmd)
			if result != tt.expected {
				t.Errorf("IsLLMCommand(%q) = %v, expected %v", tt.cmd, result, tt.expected)
			}
		})
	}
}

// TestIsLLMCommand_ClaudeCommands verifies claude detection.
func TestIsLLMCommand_ClaudeCommands(t *testing.T) {
	tests := []struct {
		cmd      string
		expected bool
	}{
		{"claude chat hello", true},
		{"claude", true},
		{"  claude  ", true},
	}

	for _, tt := range tests {
		t.Run(tt.cmd, func(t *testing.T) {
			result := IsLLMCommand(tt.cmd)
			if result != tt.expected {
				t.Errorf("IsLLMCommand(%q) = %v, expected %v", tt.cmd, result, tt.expected)
			}
		})
	}
}

// TestIsLLMCommand_SubagentCommands verifies @agent detection.
func TestIsLLMCommand_SubagentCommands(t *testing.T) {
	tests := []struct {
		cmd      string
		expected bool
	}{
		{"@reviewer check this PR", true},
		{"@architect design system", true},
		{"@", true}, // bare @ should match
	}

	for _, tt := range tests {
		t.Run(tt.cmd, func(t *testing.T) {
			result := IsLLMCommand(tt.cmd)
			if result != tt.expected {
				t.Errorf("IsLLMCommand(%q) = %v, expected %v", tt.cmd, result, tt.expected)
			}
		})
	}
}

// TestIsLLMCommand_ShellCommands verifies shell commands are NOT detected.
func TestIsLLMCommand_ShellCommands(t *testing.T) {
	tests := []struct {
		cmd      string
		expected bool
	}{
		{"ls -la", false},
		{"cd /home/user", false},
		{"git status", false},
		{"npm install", false},
		{"echo hello", false},
		{"copilot-not-a-command", false}, // doesn't start with copilot space
		{"my-copilot-tool", false},
		{"", false}, // empty command
		{"   ", false}, // whitespace only
	}

	for _, tt := range tests {
		t.Run(tt.cmd, func(t *testing.T) {
			result := IsLLMCommand(tt.cmd)
			if result != tt.expected {
				t.Errorf("IsLLMCommand(%q) = %v, expected %v", tt.cmd, result, tt.expected)
			}
		})
	}
}

// TestHasLLMPrompt_WithPrompt verifies prompt detection for commands WITH prompts.
func TestHasLLMPrompt_WithPrompt(t *testing.T) {
	tests := []struct {
		name     string
		cmd      string
		expected bool
	}{
		{"copilot with question", "copilot what is 2+2", true},
		{"copilot with flags and question", "copilot --allow-all-tools what is 2+2", true},
		{"copilot -i with question", "copilot -i explain this code", true},
		{"gh copilot with question", "gh copilot suggest a fix", true},
		{"claude with question", "claude how do I refactor this", true},
		{"aider with prompt", "aider fix the bug in main.go", true},
		{"@reviewer with message", "@reviewer check this PR", true},
		{"@architect with task", "@architect design the API", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := HasLLMPrompt(tt.cmd)
			if result != tt.expected {
				t.Errorf("HasLLMPrompt(%q) = %v, expected %v", tt.cmd, result, tt.expected)
			}
		})
	}
}

// TestHasLLMPrompt_WithoutPrompt verifies commands WITHOUT prompts return false.
func TestHasLLMPrompt_WithoutPrompt(t *testing.T) {
	tests := []struct {
		name     string
		cmd      string
		expected bool
	}{
		{"bare copilot", "copilot", false},
		{"copilot with only flags", "copilot --allow-all-tools", false},
		{"copilot with multiple flags", "copilot -i --help", false},
		{"bare claude", "claude", false},
		{"claude with only flags", "claude --version", false},
		{"bare @mention", "@reviewer", false},
		{"@ alone", "@", false},
		{"empty string", "", false},
		{"whitespace only", "   ", false},
		{"shell command", "ls -la", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := HasLLMPrompt(tt.cmd)
			if result != tt.expected {
				t.Errorf("HasLLMPrompt(%q) = %v, expected %v", tt.cmd, result, tt.expected)
			}
		})
	}
}
