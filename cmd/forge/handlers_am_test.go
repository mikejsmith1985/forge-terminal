package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/am"
)

// TestHandleAMCheckEnhanced verifies the enhanced recovery endpoint returns context
func TestHandleAMCheckEnhanced(t *testing.T) {
	// Mock the AM system with test sessions
	mockSessions := []am.SessionInfo{
		{
			TabID:           "tab-1",
			TabName:         "Planning",
			Workspace:       "/project",
			LastUpdated:     time.Now(),
			LastCommand:     "npm install",
			Provider:        "copilot",
			ActiveCount:     2,
			DurationMinutes: 10,
			SessionID:       "sess-abc123",
		},
	}

	// Create test handler
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handleAMCheckEnhanced(w, r, mockSessions)
	})

	req, err := http.NewRequest("GET", "/api/am/check/enhanced", nil)
	if err != nil {
		t.Fatalf("Failed to create request: %v", err)
	}

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusOK {
		t.Errorf("Expected status 200, got %d", status)
	}

	var result map[string]interface{}
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	if err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}

	if _, ok := result["hasRecoverable"]; !ok {
		t.Errorf("Response should have hasRecoverable field")
	}
	if _, ok := result["sessions"]; !ok {
		t.Errorf("Response should have sessions field")
	}
}

// TestHandleAMCheckEnhancedWithContext verifies enhanced data is present
func TestHandleAMCheckEnhancedWithContext(t *testing.T) {
	mockSessions := []am.SessionInfo{
		{
			TabID:           "tab-1",
			TabName:         "Execution",
			Workspace:       "/home/user/project",
			LastUpdated:     time.Now(),
			LastCommand:     "npm test",
			Provider:        "claude",
			ActiveCount:     3,
			DurationMinutes: 15,
			SessionID:       "sess-xyz789",
		},
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handleAMCheckEnhanced(w, r, mockSessions)
	})

	req, _ := http.NewRequest("GET", "/api/am/check/enhanced", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	var result map[string]interface{}
	json.Unmarshal(rr.Body.Bytes(), &result)

	sessions := result["sessions"].([]interface{})
	if len(sessions) != 1 {
		t.Fatalf("Should have 1 session, got %d", len(sessions))
	}

	session := sessions[0].(map[string]interface{})
	if session["tabName"] != "Execution" {
		t.Errorf("TabName should be 'Execution', got %v", session["tabName"])
	}
	if session["workspace"] != "/home/user/project" {
		t.Errorf("Workspace should be set, got %v", session["workspace"])
	}
	if session["lastCommand"] != "npm test" {
		t.Errorf("LastCommand should be 'npm test', got %v", session["lastCommand"])
	}
	if session["provider"] != "claude" {
		t.Errorf("Provider should be 'claude', got %v", session["provider"])
	}
	if session["activeCount"] != 3.0 {
		t.Errorf("ActiveCount should be 3, got %v", session["activeCount"])
	}
	if session["durationMinutes"] != 15.0 {
		t.Errorf("DurationMinutes should be 15, got %v", session["durationMinutes"])
	}
}

// TestHandleAMCheckEnhancedEmpty verifies handling of no sessions
func TestHandleAMCheckEnhancedEmpty(t *testing.T) {
	mockSessions := []am.SessionInfo{}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handleAMCheckEnhanced(w, r, mockSessions)
	})

	req, _ := http.NewRequest("GET", "/api/am/check/enhanced", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	var result map[string]interface{}
	json.Unmarshal(rr.Body.Bytes(), &result)

	if result["hasRecoverable"] != false {
		t.Errorf("Should have hasRecoverable=false for empty sessions")
	}
}

// TestHandleAMCheckGrouped verifies workspace grouping endpoint
func TestHandleAMCheckGrouped(t *testing.T) {
	mockSessions := []am.SessionInfo{
		{
			TabID:       "tab-1",
			TabName:     "Planning",
			Workspace:   "/project/a",
			LastUpdated: time.Now().Add(-5 * time.Minute),
			SessionID:   "sess-1",
		},
		{
			TabID:       "tab-2",
			TabName:     "Execution",
			Workspace:   "/project/a",
			LastUpdated: time.Now(),
			SessionID:   "sess-2",
		},
		{
			TabID:       "tab-3",
			TabName:     "Testing",
			Workspace:   "/project/b",
			LastUpdated: time.Now(),
			SessionID:   "sess-3",
		},
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handleAMCheckGrouped(w, r, mockSessions)
	})

	req, _ := http.NewRequest("GET", "/api/am/check/grouped", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusOK {
		t.Errorf("Expected status 200, got %d", status)
	}

	var result map[string]interface{}
	json.Unmarshal(rr.Body.Bytes(), &result)

	if _, ok := result["groups"]; !ok {
		t.Errorf("Response should have groups field")
	}

	groups := result["groups"].([]interface{})
	if len(groups) != 2 {
		t.Fatalf("Should have 2 workspace groups, got %d", len(groups))
	}
}

// TestHandleAMCheckGroupedStructure verifies group structure is correct
func TestHandleAMCheckGroupedStructure(t *testing.T) {
	mockSessions := []am.SessionInfo{
		{
			TabID:       "tab-1",
			TabName:     "Planning",
			Workspace:   "/project",
			LastUpdated: time.Now().Add(-10 * time.Minute),
			SessionID:   "sess-1",
		},
		{
			TabID:       "tab-2",
			TabName:     "Execution",
			Workspace:   "/project",
			LastUpdated: time.Now(),
			SessionID:   "sess-2",
		},
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handleAMCheckGrouped(w, r, mockSessions)
	})

	req, _ := http.NewRequest("GET", "/api/am/check/grouped", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	var result map[string]interface{}
	json.Unmarshal(rr.Body.Bytes(), &result)

	groups := result["groups"].([]interface{})
	group := groups[0].(map[string]interface{})

	if group["workspace"] != "/project" {
		t.Errorf("Group workspace should be '/project', got %v", group["workspace"])
	}
	if group["count"] != 2.0 {
		t.Errorf("Group count should be 2, got %v", group["count"])
	}
	if _, ok := group["latest"]; !ok {
		t.Errorf("Group should have latest session")
	}
	if _, ok := group["sessions"]; !ok {
		t.Errorf("Group should have sessions list")
	}

	// Verify latest is the most recent one (tab-2)
	latest := group["latest"].(map[string]interface{})
	if latest["tabId"] != "tab-2" {
		t.Errorf("Latest should be tab-2, got %v", latest["tabId"])
	}
}

// TestHandleAMCheckGroupedEmpty verifies handling of no sessions
func TestHandleAMCheckGroupedEmpty(t *testing.T) {
	mockSessions := []am.SessionInfo{}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handleAMCheckGrouped(w, r, mockSessions)
	})

	req, _ := http.NewRequest("GET", "/api/am/check/grouped", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	var result map[string]interface{}
	json.Unmarshal(rr.Body.Bytes(), &result)

	if result["hasRecoverable"] != false {
		t.Errorf("Should have hasRecoverable=false for empty sessions")
	}
	if len(result["groups"].([]interface{})) != 0 {
		t.Errorf("Should have empty groups list")
	}
}

// TestHandleAMCheckGroupedMultipleWorkspaces verifies correct grouping
func TestHandleAMCheckGroupedMultipleWorkspaces(t *testing.T) {
	mockSessions := []am.SessionInfo{
		{TabID: "tab-1", Workspace: "/proj-a", TabName: "T1", LastUpdated: time.Now(), SessionID: "s1"},
		{TabID: "tab-2", Workspace: "/proj-a", TabName: "T2", LastUpdated: time.Now(), SessionID: "s2"},
		{TabID: "tab-3", Workspace: "/proj-a", TabName: "T3", LastUpdated: time.Now(), SessionID: "s3"},
		{TabID: "tab-4", Workspace: "/proj-b", TabName: "T4", LastUpdated: time.Now(), SessionID: "s4"},
		{TabID: "tab-5", Workspace: "/proj-c", TabName: "T5", LastUpdated: time.Now(), SessionID: "s5"},
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handleAMCheckGrouped(w, r, mockSessions)
	})

	req, _ := http.NewRequest("GET", "/api/am/check/grouped", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	var result map[string]interface{}
	json.Unmarshal(rr.Body.Bytes(), &result)

	groups := result["groups"].([]interface{})
	if len(groups) != 3 {
		t.Fatalf("Should have 3 workspace groups, got %d", len(groups))
	}

	// Check counts
	counts := make(map[string]int)
	for _, g := range groups {
		group := g.(map[string]interface{})
		workspace := group["workspace"].(string)
		count := int(group["count"].(float64))
		counts[workspace] = count
	}

	if counts["/proj-a"] != 3 {
		t.Errorf("Project A should have 3 sessions, got %d", counts["/proj-a"])
	}
	if counts["/proj-b"] != 1 {
		t.Errorf("Project B should have 1 session, got %d", counts["/proj-b"])
	}
	if counts["/proj-c"] != 1 {
		t.Errorf("Project C should have 1 session, got %d", counts["/proj-c"])
	}
}

// TestHandleAMCheckEnhancedContentType verifies correct content type
func TestHandleAMCheckEnhancedContentType(t *testing.T) {
	mockSessions := []am.SessionInfo{}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handleAMCheckEnhanced(w, r, mockSessions)
	})

	req, _ := http.NewRequest("GET", "/api/am/check/enhanced", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if ct := rr.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Expected Content-Type application/json, got %s", ct)
	}
}

// TestHandleAMCheckGroupedContentType verifies correct content type
func TestHandleAMCheckGroupedContentType(t *testing.T) {
	mockSessions := []am.SessionInfo{}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handleAMCheckGrouped(w, r, mockSessions)
	})

	req, _ := http.NewRequest("GET", "/api/am/check/grouped", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if ct := rr.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Expected Content-Type application/json, got %s", ct)
	}
}

// TestHandleAMCheckEnhancedValidJSON verifies response is valid JSON
func TestHandleAMCheckEnhancedValidJSON(t *testing.T) {
	mockSessions := []am.SessionInfo{
		{
			TabID:       "tab-1",
			TabName:     "Test",
			Workspace:   "/test",
			LastUpdated: time.Now(),
			SessionID:   "sess-1",
		},
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handleAMCheckEnhanced(w, r, mockSessions)
	})

	req, _ := http.NewRequest("GET", "/api/am/check/enhanced", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	var result interface{}
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	if err != nil {
		t.Errorf("Response is not valid JSON: %v", err)
	}
}

// TestHandleAMCheckGroupedValidJSON verifies response is valid JSON
func TestHandleAMCheckGroupedValidJSON(t *testing.T) {
	mockSessions := []am.SessionInfo{
		{
			TabID:       "tab-1",
			Workspace:   "/test",
			LastUpdated: time.Now(),
			SessionID:   "sess-1",
		},
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handleAMCheckGrouped(w, r, mockSessions)
	})

	req, _ := http.NewRequest("GET", "/api/am/check/grouped", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	var result interface{}
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	if err != nil {
		t.Errorf("Response is not valid JSON: %v", err)
	}
}

// TestEnhancedRecoveryInfo verifies the response structure
func TestEnhancedRecoveryInfo(t *testing.T) {
	mockSessions := []am.SessionInfo{
		{
			TabID:           "tab-1",
			TabName:         "Main",
			Workspace:       "/project",
			LastUpdated:     time.Now(),
			LastCommand:     "npm run test",
			Provider:        "copilot",
			ActiveCount:     2,
			DurationMinutes: 5,
			SessionID:       "sess-abc",
		},
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handleAMCheckEnhanced(w, r, mockSessions)
	})

	req, _ := http.NewRequest("GET", "/api/am/check/enhanced", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	var data am.RecoveryInfo
	json.Unmarshal(rr.Body.Bytes(), &data)

	if !data.HasRecoverable {
		t.Errorf("HasRecoverable should be true")
	}
	if len(data.Sessions) != 1 {
		t.Fatalf("Should have 1 session")
	}

	session := data.Sessions[0]
	if session.TabName != "Main" {
		t.Errorf("TabName mismatch")
	}
	if session.LastCommand != "npm run test" {
		t.Errorf("LastCommand mismatch")
	}
}

// TestGroupedRecoveryInfo verifies the grouped response structure
func TestGroupedRecoveryInfo(t *testing.T) {
	mockSessions := []am.SessionInfo{
		{
			TabID:       "tab-1",
			TabName:     "T1",
			Workspace:   "/proj",
			LastUpdated: time.Now(),
			SessionID:   "s1",
		},
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handleAMCheckGrouped(w, r, mockSessions)
	})

	req, _ := http.NewRequest("GET", "/api/am/check/grouped", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	var data am.RecoveryInfoGrouped
	json.Unmarshal(rr.Body.Bytes(), &data)

	if !data.HasRecoverable {
		t.Errorf("HasRecoverable should be true")
	}
	if len(data.Groups) != 1 {
		t.Fatalf("Should have 1 group")
	}

	group := data.Groups[0]
	if group.Workspace != "/proj" {
		t.Errorf("Workspace mismatch")
	}
	if group.Count != 1 {
		t.Errorf("Count should be 1")
	}
}
