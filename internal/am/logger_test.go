package am

import (
	"testing"
	"time"
)

// TestSessionInfoEnhancedFields verifies that SessionInfo contains workspace context
func TestSessionInfoEnhancedFields(t *testing.T) {
	info := SessionInfo{
		TabID:           "tab-1-test",
		TabName:         "Planning",
		Workspace:       "/home/user/project",
		FilePath:        "/path/to/session.md",
		FileName:        "session-tab-1-test.md",
		LastUpdated:     time.Now(),
		Content:         "test content",
		LastCommand:     "npm run test",
		Provider:        "copilot",
		ActiveCount:     3,
		DurationMinutes: 15,
		SessionID:       "sess-abc123",
	}

	// Verify all fields are present
	if info.TabName != "Planning" {
		t.Errorf("TabName should be 'Planning', got %s", info.TabName)
	}
	if info.Workspace != "/home/user/project" {
		t.Errorf("Workspace should be set, got %s", info.Workspace)
	}
	if info.LastCommand != "npm run test" {
		t.Errorf("LastCommand should be 'npm run test', got %s", info.LastCommand)
	}
	if info.Provider != "copilot" {
		t.Errorf("Provider should be 'copilot', got %s", info.Provider)
	}
	if info.ActiveCount != 3 {
		t.Errorf("ActiveCount should be 3, got %d", info.ActiveCount)
	}
	if info.DurationMinutes != 15 {
		t.Errorf("DurationMinutes should be 15, got %d", info.DurationMinutes)
	}
	if info.SessionID != "sess-abc123" {
		t.Errorf("SessionID should be 'sess-abc123', got %s", info.SessionID)
	}
}

// TestExtractLastCommand verifies extraction of last command from log entries
func TestExtractLastCommand(t *testing.T) {
	entries := []LogEntry{
		{
			Timestamp: time.Now().Add(-3 * time.Minute),
			Type:      EntryUserInput,
			Content:   "echo hello",
		},
		{
			Timestamp: time.Now().Add(-2 * time.Minute),
			Type:      EntryCommandExecuted,
			Content:   "npm run test",
		},
		{
			Timestamp: time.Now().Add(-1 * time.Minute),
			Type:      EntryAgentOutput,
			Content:   "Test passed",
		},
	}

	lastCmd := extractLastCommand(entries)
	if lastCmd != "npm run test" {
		t.Errorf("Should extract last command, expected 'npm run test', got '%s'", lastCmd)
	}
}

// TestExtractLastCommandEmpty verifies handling of empty entries
func TestExtractLastCommandEmpty(t *testing.T) {
	entries := []LogEntry{}
	lastCmd := extractLastCommand(entries)
	if lastCmd != "" {
		t.Errorf("Should return empty string for no entries, got '%s'", lastCmd)
	}
}

// TestExtractLastCommandNoCommandEntries verifies handling when no command entries exist
func TestExtractLastCommandNoCommandEntries(t *testing.T) {
	entries := []LogEntry{
		{
			Timestamp: time.Now(),
			Type:      EntryAgentOutput,
			Content:   "Some output",
		},
	}
	lastCmd := extractLastCommand(entries)
	if lastCmd != "" {
		t.Errorf("Should return empty string when no command entries exist, got '%s'", lastCmd)
	}
}

// TestCalculateSessionDuration verifies duration calculation
func TestCalculateSessionDuration(t *testing.T) {
	startTime := time.Now().Add(-15 * time.Minute)
	lastUpdated := time.Now()

	duration := calculateSessionDuration(startTime, lastUpdated)
	if duration < 14 || duration > 16 {
		t.Errorf("Duration should be ~15 minutes, got %d", duration)
	}
}

// TestCalculateSessionDurationLessThanMinute verifies handling of very short sessions
func TestCalculateSessionDurationLessThanMinute(t *testing.T) {
	startTime := time.Now()
	lastUpdated := time.Now().Add(30 * time.Second)

	duration := calculateSessionDuration(startTime, lastUpdated)
	if duration != 0 {
		t.Errorf("Duration less than 1 minute should round to 0, got %d", duration)
	}
}

// TestExtractConversationCount verifies conversation counting from events
func TestExtractConversationCount(t *testing.T) {
	entries := []LogEntry{
		{
			Timestamp: time.Now(),
			Type:      "LLM_START",
			Content:   `{"conversationId": "conv-1"}`,
		},
		{
			Timestamp: time.Now(),
			Type:      "LLM_START",
			Content:   `{"conversationId": "conv-2"}`,
		},
		{
			Timestamp: time.Now(),
			Type:      "LLM_END",
			Content:   `{"conversationId": "conv-1"}`,
		},
		{
			Timestamp: time.Now(),
			Type:      "LLM_START",
			Content:   `{"conversationId": "conv-3"}`,
		},
	}

	count := extractConversationCount(entries)
	if count != 3 {
		t.Errorf("Should count 3 conversations, got %d", count)
	}
}

// TestExtractConversationCountZero verifies handling of no conversations
func TestExtractConversationCountZero(t *testing.T) {
	entries := []LogEntry{
		{
			Timestamp: time.Now(),
			Type:      EntryAgentOutput,
			Content:   "Some output",
		},
	}

	count := extractConversationCount(entries)
	if count != 0 {
		t.Errorf("Should count 0 conversations when none exist, got %d", count)
	}
}

// TestSessionIDGeneration verifies consistent session ID generation
func TestSessionIDGeneration(t *testing.T) {
	workspace := "/project/test"
	tabID := "tab-1"

	id1 := generateSessionID(tabID, workspace)
	id2 := generateSessionID(tabID, workspace)

	if id1 != id2 {
		t.Errorf("Same inputs should generate same session ID, got %s and %s", id1, id2)
	}

	id3 := generateSessionID("tab-2", workspace)
	if id1 == id3 {
		t.Errorf("Different tabIDs should generate different session IDs")
	}

	if len(id1) == 0 {
		t.Errorf("Session ID should not be empty")
	}
}

// TestSessionInfoFromLog verifies SessionInfo extraction from SessionLog
func TestSessionInfoFromLog(t *testing.T) {
	log := &SessionLog{
		TabID:       "tab-1",
		TabName:     "Planning",
		Workspace:   "/project",
		StartTime:   time.Now().Add(-10 * time.Minute),
		LastUpdated: time.Now(),
		Entries: []LogEntry{
			{
				Type:    EntryUserInput,
				Content: "using copilot",
			},
			{
				Type:    EntryCommandExecuted,
				Content: "npm run test",
			},
			{
				Type:    "LLM_START",
				Content: "conv-1",
			},
		},
	}

	info, err := sessionInfoFromLog(log)
	if err != nil {
		t.Fatalf("Failed to extract session info: %v", err)
	}

	if info.TabName != "Planning" {
		t.Errorf("TabName should be 'Planning', got '%s'", info.TabName)
	}
	if info.Workspace != "/project" {
		t.Errorf("Workspace should be '/project', got '%s'", info.Workspace)
	}
	if info.LastCommand != "npm run test" {
		t.Errorf("LastCommand should be 'npm run test', got '%s'", info.LastCommand)
	}
	if info.DurationMinutes < 9 || info.DurationMinutes > 11 {
		t.Errorf("DurationMinutes should be ~10, got %d", info.DurationMinutes)
	}
	if info.ActiveCount != 1 {
		t.Errorf("ActiveCount should be 1, got %d", info.ActiveCount)
	}
	if info.SessionID == "" {
		t.Errorf("SessionID should not be empty")
	}
}

// TestSessionInfoFromLogWithProvider verifies provider extraction
func TestSessionInfoFromLogWithProvider(t *testing.T) {
	log := &SessionLog{
		TabID:       "tab-1",
		TabName:     "Main",
		Workspace:   "/project",
		StartTime:   time.Now(),
		LastUpdated: time.Now(),
		Entries: []LogEntry{
			{
				Type:    EntryUserInput,
				Content: "using copilot",
			},
		},
	}

	info, err := sessionInfoFromLog(log)
	if err != nil {
		t.Fatalf("Failed to extract session info: %v", err)
	}

	if info.Provider != "copilot" {
		t.Errorf("Provider should be 'copilot', got '%s'", info.Provider)
	}
}

// TestSessionInfoFromLogNil verifies error handling for nil log
func TestSessionInfoFromLogNil(t *testing.T) {
	_, err := sessionInfoFromLog(nil)
	if err == nil {
		t.Errorf("Should return error for nil log")
	}
}

// TestRecoveryInfoGrouped verifies grouping sessions by workspace
func TestRecoveryInfoGrouped(t *testing.T) {
	sessions := []SessionInfo{
		{
			TabID:       "tab-1",
			TabName:     "Planning",
			Workspace:   "/project/a",
			LastUpdated: time.Now().Add(-10 * time.Minute),
			Provider:    "copilot",
		},
		{
			TabID:       "tab-2",
			TabName:     "Execution",
			Workspace:   "/project/a",
			LastUpdated: time.Now().Add(-5 * time.Minute),
			Provider:    "claude",
		},
		{
			TabID:       "tab-3",
			TabName:     "Testing",
			Workspace:   "/project/b",
			LastUpdated: time.Now(),
			Provider:    "copilot",
		},
	}

	grouped := GroupSessionsByWorkspace(sessions)

	if len(grouped) != 2 {
		t.Fatalf("Should have 2 workspace groups, got %d", len(grouped))
	}

	// Check first group (project/a)
	foundProjectA := false
	for _, group := range grouped {
		if group.Workspace == "/project/a" {
			foundProjectA = true
			if len(group.Sessions) != 2 {
				t.Errorf("Project A group should have 2 sessions, got %d", len(group.Sessions))
			}
			break
		}
	}
	if !foundProjectA {
		t.Errorf("Should find /project/a group")
	}

	// Check second group (project/b)
	foundProjectB := false
	for _, group := range grouped {
		if group.Workspace == "/project/b" {
			foundProjectB = true
			if len(group.Sessions) != 1 {
				t.Errorf("Project B group should have 1 session, got %d", len(group.Sessions))
			}
			break
		}
	}
	if !foundProjectB {
		t.Errorf("Should find /project/b group")
	}
}

// TestSessionGroupLatest verifies that latest session is set correctly
func TestSessionGroupLatest(t *testing.T) {
	sessions := []SessionInfo{
		{
			TabID:       "tab-1",
			Workspace:   "/project",
			LastUpdated: time.Now().Add(-10 * time.Minute),
		},
		{
			TabID:       "tab-2",
			Workspace:   "/project",
			LastUpdated: time.Now(), // Most recent
		},
	}

	grouped := GroupSessionsByWorkspace(sessions)
	if grouped[0].Latest.TabID != "tab-2" {
		t.Errorf("Latest should be tab-2, got %s", grouped[0].Latest.TabID)
	}
}

// TestParseSessionLogContent verifies parsing of session log markdown
func TestParseSessionLogContent(t *testing.T) {
	content := `# Forge AM (Artificial Memory) Log

| Property | Value |
|----------|-------|
| Tab ID | tab-1 |
| Tab Name | Planning |
| Workspace | /home/user/project |
| Session Start | 2025-12-08T05:50:50Z |
| Last Updated | 2025-12-08T05:58:28Z |

---

## Session Activity

### 05:50:50 [USER_INPUT]
npm install

### 05:51:00 [COMMAND_EXECUTED]
npm install

### 05:52:00 [LLM_START]
conversation started
`

	log, err := parseSessionLogContent(content)
	if err != nil {
		t.Fatalf("Failed to parse session log: %v", err)
	}

	if log.TabID != "tab-1" {
		t.Errorf("TabID should be 'tab-1', got '%s'", log.TabID)
	}
	if log.TabName != "Planning" {
		t.Errorf("TabName should be 'Planning', got '%s'", log.TabName)
	}
	if log.Workspace != "/home/user/project" {
		t.Errorf("Workspace should be '/home/user/project', got '%s'", log.Workspace)
	}
	if len(log.Entries) < 2 {
		t.Errorf("Should have at least 2 entries, got %d", len(log.Entries))
	}
}

// TestParseSessionLogContentEmpty verifies error handling for invalid content
func TestParseSessionLogContentEmpty(t *testing.T) {
	content := "short"
	_, err := parseSessionLogContent(content)
	if err == nil {
		t.Errorf("Should return error for invalid content")
	}
}

