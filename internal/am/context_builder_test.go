package am

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestContextBuilder_BuildRestoreContext(t *testing.T) {
	cb := NewContextBuilder("/tmp/am-test")

	conv := &LLMConversation{
		ConversationID: "conv-123",
		TabID:          "tab-1",
		Provider:       "github-copilot",
		StartTime:      time.Now().Add(-10 * time.Minute),
		Complete:       false,
		AutoRespond:    true,
		Metadata: &ConversationMetadata{
			WorkingDirectory: "/home/user/projects/test",
			GitBranch:        "main",
		},
		Turns: []ConversationTurn{
			{
				Role:      "user",
				Content:   "Fix the bug in handler.go",
				Timestamp: time.Now().Add(-9 * time.Minute),
				Provider:  "github-copilot",
			},
			{
				Role:      "assistant",
				Content:   "I'll analyze handler.go and identify the issue...",
				Timestamp: time.Now().Add(-8 * time.Minute),
				Provider:  "github-copilot",
			},
			{
				Role:      "user",
				Content:   "Also check the test file",
				Timestamp: time.Now().Add(-5 * time.Minute),
				Provider:  "github-copilot",
			},
		},
	}

	ctx := cb.BuildRestoreContext(conv)

	if ctx == nil {
		t.Fatal("Expected non-nil context")
	}

	if ctx.ConversationID != "conv-123" {
		t.Errorf("ConversationID = %s, want conv-123", ctx.ConversationID)
	}

	if ctx.TurnCount != 3 {
		t.Errorf("TurnCount = %d, want 3", ctx.TurnCount)
	}

	if !ctx.WasAutoRespond {
		t.Error("Expected WasAutoRespond to be true")
	}

	if !ctx.WasInterrupted {
		t.Error("Expected WasInterrupted to be true")
	}

	if ctx.LastUserPrompt != "Also check the test file" {
		t.Errorf("LastUserPrompt = %s, want 'Also check the test file'", ctx.LastUserPrompt)
	}

	if ctx.Summary == "" {
		t.Error("Expected non-empty summary")
	}

	if ctx.RestorePrompt == "" {
		t.Error("Expected non-empty restore prompt")
	}

	if ctx.FullContext == "" {
		t.Error("Expected non-empty full context")
	}
}

func TestContextBuilder_BuildRestoreContext_EmptyConversation(t *testing.T) {
	cb := NewContextBuilder("/tmp/am-test")

	conv := &LLMConversation{
		ConversationID: "conv-empty",
		Turns:          []ConversationTurn{},
	}

	ctx := cb.BuildRestoreContext(conv)

	if ctx != nil {
		t.Error("Expected nil context for empty conversation")
	}
}

func TestContextBuilder_BuildRestoreContext_NilConversation(t *testing.T) {
	cb := NewContextBuilder("/tmp/am-test")

	ctx := cb.BuildRestoreContext(nil)

	if ctx != nil {
		t.Error("Expected nil context for nil conversation")
	}
}

func TestContextBuilder_buildSummary(t *testing.T) {
	cb := NewContextBuilder("/tmp/am-test")

	conv := &LLMConversation{
		Provider:  "claude",
		StartTime: time.Now().Add(-5 * time.Minute),
		Complete:  false,
		Metadata: &ConversationMetadata{
			WorkingDirectory: "/home/user/projects/myapp",
		},
		Turns: []ConversationTurn{
			{Role: "user", Content: "test", Timestamp: time.Now().Add(-4 * time.Minute)},
			{Role: "assistant", Content: "response", Timestamp: time.Now().Add(-3 * time.Minute)},
			{Role: "user", Content: "test2", Timestamp: time.Now()},
		},
	}

	summary := cb.buildSummary(conv)

	if summary == "" {
		t.Error("Expected non-empty summary")
	}

	// Should contain provider name
	if !contains(summary, "claude") {
		t.Errorf("Summary should contain provider, got: %s", summary)
	}

	// Should indicate interrupted
	if !contains(summary, "interrupted") {
		t.Errorf("Summary should indicate interrupted, got: %s", summary)
	}
}

func TestContextBuilder_GetRecoverableSessions(t *testing.T) {
	// Create temp directory
	tmpDir, err := os.MkdirTemp("", "am-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	// Create some test conversations
	incomplete := &LLMConversation{
		ConversationID: "conv-incomplete",
		TabID:          "tab-1",
		Provider:       "github-copilot",
		StartTime:      time.Now().Add(-10 * time.Minute),
		Complete:       false,
		Turns: []ConversationTurn{
			{Role: "user", Content: "help me", Timestamp: time.Now().Add(-9 * time.Minute)},
			{Role: "assistant", Content: "sure", Timestamp: time.Now().Add(-8 * time.Minute)},
		},
	}

	complete := &LLMConversation{
		ConversationID: "conv-complete",
		TabID:          "tab-2",
		Provider:       "claude",
		StartTime:      time.Now().Add(-20 * time.Minute),
		Complete:       true,
		EndTime:        time.Now().Add(-15 * time.Minute),
		Turns: []ConversationTurn{
			{Role: "user", Content: "done", Timestamp: time.Now().Add(-19 * time.Minute)},
		},
	}

	// Write conversations
	writeConv(t, tmpDir, "llm-conv-tab-1-conv-incomplete.json", incomplete)
	writeConv(t, tmpDir, "llm-conv-tab-2-conv-complete.json", complete)

	cb := NewContextBuilder(tmpDir)
	sessions, err := cb.GetRecoverableSessions()
	if err != nil {
		t.Fatal(err)
	}

	// Should only return incomplete sessions
	if len(sessions) != 1 {
		t.Errorf("Expected 1 recoverable session, got %d", len(sessions))
	}

	if len(sessions) > 0 && sessions[0].Conversation.ConversationID != "conv-incomplete" {
		t.Errorf("Expected conv-incomplete, got %s", sessions[0].Conversation.ConversationID)
	}
}

func TestContextBuilder_MarkAsRestored(t *testing.T) {
	// Create temp directory
	tmpDir, err := os.MkdirTemp("", "am-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	// Create incomplete conversation
	conv := &LLMConversation{
		ConversationID: "conv-to-restore",
		TabID:          "tab-1",
		Provider:       "github-copilot",
		Complete:       false,
		Turns: []ConversationTurn{
			{Role: "user", Content: "test", Timestamp: time.Now()},
		},
	}

	writeConv(t, tmpDir, "llm-conv-tab-1-conv-to-restore.json", conv)

	cb := NewContextBuilder(tmpDir)

	// Mark as restored
	err = cb.MarkAsRestored("conv-to-restore")
	if err != nil {
		t.Fatal(err)
	}

	// Verify it's marked complete
	sessions, _ := cb.GetRecoverableSessions()
	if len(sessions) != 0 {
		t.Error("Expected no recoverable sessions after marking as restored")
	}
}

func TestTruncate(t *testing.T) {
	tests := []struct {
		input    string
		maxLen   int
		expected string
	}{
		{"hello", 10, "hello"},
		{"hello world", 5, "he..."},
		{"abc", 3, "abc"},
		{"abcd", 3, "..."},
		{"", 10, ""},
	}

	for _, tt := range tests {
		result := truncate(tt.input, tt.maxLen)
		if result != tt.expected {
			t.Errorf("truncate(%q, %d) = %q, want %q", tt.input, tt.maxLen, result, tt.expected)
		}
	}
}

// Helper functions

func writeConv(t *testing.T, dir, filename string, conv *LLMConversation) {
	t.Helper()
	data, err := json.MarshalIndent(conv, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, filename), data, 0644); err != nil {
		t.Fatal(err)
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsHelper(s, substr))
}

func containsHelper(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
