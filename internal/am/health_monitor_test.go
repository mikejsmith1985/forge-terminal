package am

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

// TestValidateConversationContent_CleanContent tests validation of clean conversation files
func TestValidateConversationContent_CleanContent(t *testing.T) {
	// Create temp dir
	tmpDir := t.TempDir()

	// Create a clean conversation file
	cleanContent := `{
		"conversationId": "test-123",
		"tabId": "tab-1",
		"turns": [
			{"role": "user", "content": "Hello, how are you?"},
			{"role": "assistant", "content": "I am doing well, thank you for asking!"}
		]
	}`

	filePath := filepath.Join(tmpDir, "clean-conv.json")
	err := os.WriteFile(filePath, []byte(cleanContent), 0644)
	if err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	valid, errMsg := ValidateConversationContent(filePath)
	if !valid {
		t.Errorf("Clean content should be valid, got error: %s", errMsg)
	}
}

// TestValidateConversationContent_CorruptedANSI tests detection of ANSI artifacts
func TestValidateConversationContent_CorruptedANSI(t *testing.T) {
	tmpDir := t.TempDir()

	// Create a file with orphaned ANSI codes (the bug we fixed)
	corruptedContent := `{
		"conversationId": "test-456",
		"tabId": "tab-1",
		"turns": [
			{"role": "assistant", "content": "[?25l[?25h Welcome to the CLI [?2004h"}
		]
	}`

	filePath := filepath.Join(tmpDir, "corrupted-conv.json")
	err := os.WriteFile(filePath, []byte(corruptedContent), 0644)
	if err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	valid, errMsg := ValidateConversationContent(filePath)
	if valid {
		t.Error("Corrupted content with ANSI artifacts should be invalid")
	}
	if errMsg == "" {
		t.Error("Should have error message for corrupted content")
	}
}

// TestValidateConversationContent_EmptyTurns tests detection of empty conversations
func TestValidateConversationContent_EmptyTurns(t *testing.T) {
	tmpDir := t.TempDir()

	emptyContent := `{
		"conversationId": "test-789",
		"tabId": "tab-1",
		"turns": []
	}`

	filePath := filepath.Join(tmpDir, "empty-conv.json")
	err := os.WriteFile(filePath, []byte(emptyContent), 0644)
	if err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	valid, errMsg := ValidateConversationContent(filePath)
	if valid {
		t.Error("Empty turns should be invalid")
	}
	if errMsg != "no conversation turns found" {
		t.Errorf("Expected 'no conversation turns found' error, got: %s", errMsg)
	}
}

// TestValidateConversationContent_InsufficientContent tests minimum content requirement
func TestValidateConversationContent_InsufficientContent(t *testing.T) {
	tmpDir := t.TempDir()

	shortContent := `{
		"conversationId": "test-short",
		"tabId": "tab-1",
		"turns": [
			{"role": "user", "content": "Hi"}
		]
	}`

	filePath := filepath.Join(tmpDir, "short-conv.json")
	err := os.WriteFile(filePath, []byte(shortContent), 0644)
	if err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	valid, errMsg := ValidateConversationContent(filePath)
	if valid {
		t.Error("Short content (< 10 chars) should be invalid")
	}
	if errMsg != "insufficient content (less than 10 characters)" {
		t.Errorf("Expected insufficient content error, got: %s", errMsg)
	}
}

// TestValidateConversationContent_InvalidJSON tests handling of invalid JSON
func TestValidateConversationContent_InvalidJSON(t *testing.T) {
	tmpDir := t.TempDir()

	invalidJSON := `{not valid json`

	filePath := filepath.Join(tmpDir, "invalid.json")
	err := os.WriteFile(filePath, []byte(invalidJSON), 0644)
	if err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	valid, errMsg := ValidateConversationContent(filePath)
	if valid {
		t.Error("Invalid JSON should be invalid")
	}
	if errMsg == "" {
		t.Error("Should have error message for invalid JSON")
	}
}

// TestValidateConversationContent_FileNotFound tests handling of missing files
func TestValidateConversationContent_FileNotFound(t *testing.T) {
	valid, errMsg := ValidateConversationContent("/nonexistent/path/file.json")
	if valid {
		t.Error("Missing file should be invalid")
	}
	if errMsg == "" {
		t.Error("Should have error message for missing file")
	}
}

// TestHealthMonitor_ValidateAllConversations tests bulk validation
func TestHealthMonitor_ValidateAllConversations(t *testing.T) {
	tmpDir := t.TempDir()

	// Create mix of valid and corrupted files
	cleanContent := `{"turns": [{"role": "user", "content": "This is a clean conversation message"}]}`
	corruptedContent := `{"turns": [{"role": "assistant", "content": "[?25l corrupted [?25h"}]}`

	os.WriteFile(filepath.Join(tmpDir, "llm-conv-clean.json"), []byte(cleanContent), 0644)
	os.WriteFile(filepath.Join(tmpDir, "llm-conv-corrupted.json"), []byte(corruptedContent), 0644)

	// Create health monitor and run validation
	hm := NewHealthMonitor()
	validation := hm.ValidateAllConversations(tmpDir)

	if validation.TotalFiles != 2 {
		t.Errorf("Expected 2 total files, got %d", validation.TotalFiles)
	}
	if validation.ValidFiles != 1 {
		t.Errorf("Expected 1 valid file, got %d", validation.ValidFiles)
	}
	if validation.CorruptedFiles != 1 {
		t.Errorf("Expected 1 corrupted file, got %d", validation.CorruptedFiles)
	}
	if len(validation.Errors) != 1 {
		t.Errorf("Expected 1 error, got %d", len(validation.Errors))
	}
}

// TestHealthMonitor_GetMetrics_OnlyCountsIncompleteConversations is a TDD test
// for the snapshot counting fix. It verifies that only incomplete (active)
// conversations are counted in the snapshot metrics, not completed ones.
func TestHealthMonitor_GetMetrics_OnlyCountsIncompleteConversations(t *testing.T) {
	// Enable test mode
	SetTestMode(true)
	defer SetTestMode(false)

	// Setup: Create mock conversations
	mockConvs := make(map[string]*LLMConversation)

	// Incomplete (active) conversation with 2 snapshots
	incompleteConv := &LLMConversation{
		ConversationID: "conv-active-1",
		TabID:          "tab-1",
		Provider:       "github-copilot",
		CommandType:    "ask",
		Complete:       false, // ACTIVE
		Turns:          []ConversationTurn{{Role: "user", Content: "test"}},
		ScreenSnapshots: []ScreenSnapshot{
			{Timestamp: time.Now(), SequenceNumber: 0, CleanedContent: "screen1"},
			{Timestamp: time.Now(), SequenceNumber: 1, CleanedContent: "screen2"},
		},
	}

	// Completed (idle) conversation with 1 snapshot
	completedConv := &LLMConversation{
		ConversationID: "conv-complete-1",
		TabID:          "tab-1",
		Provider:       "github-copilot",
		CommandType:    "ask",
		Complete:       true, // COMPLETED
		Turns:          []ConversationTurn{{Role: "user", Content: "old"}},
		ScreenSnapshots: []ScreenSnapshot{
			{Timestamp: time.Now(), SequenceNumber: 0, CleanedContent: "old_screen"},
		},
	}

	mockConvs["conv-active-1"] = incompleteConv
	mockConvs["conv-complete-1"] = completedConv

	// Inject mock conversations
	SetTestConversations(mockConvs)

	// Create health monitor
	hm := NewHealthMonitor()

	// Get metrics
	metrics := hm.GetMetrics()

	// ASSERTION: Should count only 2 snapshots (from incomplete conversation)
	// NOT 3 (from both complete and incomplete)
	if metrics.SnapshotsCaptured != 2 {
		t.Errorf("Expected 2 snapshots (only from incomplete conv), got %d", metrics.SnapshotsCaptured)
	}
}

// TestHealthMonitor_GetSystemHealth_OnlyCountsIncompleteConversations is a TDD test
// verifying that GetSystemHealth() also correctly filters conversations
func TestHealthMonitor_GetSystemHealth_OnlyCountsIncompleteConversations(t *testing.T) {
	// Enable test mode
	SetTestMode(true)
	defer SetTestMode(false)

	// Setup: Create mock conversations
	mockConvs := make(map[string]*LLMConversation)

	incompleteConv := &LLMConversation{
		ConversationID: "conv-active-2",
		TabID:          "tab-2",
		Provider:       "claude",
		CommandType:    "ask",
		Complete:       false,
		Turns:          []ConversationTurn{{Role: "user", Content: "test"}},
		ScreenSnapshots: []ScreenSnapshot{
			{Timestamp: time.Now(), SequenceNumber: 0, CleanedContent: "screen1"},
			{Timestamp: time.Now(), SequenceNumber: 1, CleanedContent: "screen2"},
			{Timestamp: time.Now(), SequenceNumber: 2, CleanedContent: "screen3"},
		},
	}

	mockConvs["conv-active-2"] = incompleteConv

	// Inject mock conversations
	SetTestConversations(mockConvs)

	hm := NewHealthMonitor()
	health := hm.GetSystemHealth()

	// Should count only 3 snapshots from the one incomplete conversation
	if health.Metrics.SnapshotsCaptured != 3 {
		t.Errorf("Expected 3 snapshots, got %d", health.Metrics.SnapshotsCaptured)
	}

	// Status should be HEALTHY when we have activity
	if health.Status != "HEALTHY" {
		t.Errorf("Expected HEALTHY status, got %s", health.Status)
	}
}
