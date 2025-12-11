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
LastCommand:     "npm run test",
DurationSeconds: 900,
SessionID:       "sess-abc123",
ConversationID:  "conv-123",
ConversationNum: 1,
Timestamp:       time.Now(),
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
if info.DurationSeconds != 900 {
t.Errorf("DurationSeconds should be 900, got %d", info.DurationSeconds)
}
if info.SessionID != "sess-abc123" {
t.Errorf("SessionID should be 'sess-abc123', got %s", info.SessionID)
}
}

// TestGroupSessionsByWorkspace verifies sessions are correctly grouped
func TestGroupSessionsByWorkspace(t *testing.T) {
sessions := []SessionInfo{
{
TabID:     "tab-1",
TabName:   "Session1",
Workspace: "/project/a",
},
{
TabID:     "tab-2",
TabName:   "Session2",
Workspace: "/project/a",
},
{
TabID:     "tab-3",
TabName:   "Session3",
Workspace: "/project/b",
},
}

grouped := GroupSessionsByWorkspace(sessions)

if len(grouped) != 2 {
t.Errorf("Expected 2 groups, got %d", len(grouped))
}
}
