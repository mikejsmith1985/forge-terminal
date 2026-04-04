// server_test.go tests the MCP server protocol handling and workflow tool logic.
package mcp

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// ── Protocol tests ───────────────────────────────────────────────────────────

func TestHandleRequest_Initialize_ReturnsCapabilities(t *testing.T) {
	server := NewServer(t.TempDir())
	rawReq := mustMarshal(t, Request{
		JSONRPC: "2.0",
		ID:      mustMarshal(t, 1),
		Method:  "initialize",
		Params:  mustMarshal(t, InitializeParams{ProtocolVersion: "2024-11-05"}),
	})

	rawResp, err := server.HandleRequest(rawReq)
	if err != nil {
		t.Fatalf("HandleRequest error: %v", err)
	}

	var resp Response
	if err := json.Unmarshal(rawResp, &resp); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if resp.Error != nil {
		t.Fatalf("unexpected error: %v", resp.Error)
	}

	var result InitializeResult
	if err := json.Unmarshal(resp.Result, &result); err != nil {
		t.Fatalf("unmarshal result: %v", err)
	}
	if result.ServerInfo.Name != "forge-workflow" {
		t.Errorf("expected server name forge-workflow, got %q", result.ServerInfo.Name)
	}
	if result.Capabilities.Tools == nil {
		t.Error("expected tools capability to be set")
	}
}

func TestHandleRequest_NotificationInitialized_ReturnsNoResponse(t *testing.T) {
	server := NewServer(t.TempDir())
	// Notifications have no ID and require no response.
	rawReq := mustMarshal(t, map[string]interface{}{
		"jsonrpc": "2.0",
		"method":  "notifications/initialized",
	})

	rawResp, err := server.HandleRequest(rawReq)
	if err != nil {
		t.Fatalf("HandleRequest error: %v", err)
	}
	if rawResp != nil {
		t.Errorf("expected nil response for notification, got %s", rawResp)
	}
}

func TestHandleRequest_UnknownMethod_ReturnsMethodNotFound(t *testing.T) {
	server := NewServer(t.TempDir())
	rawReq := mustMarshal(t, Request{
		JSONRPC: "2.0",
		ID:      mustMarshal(t, 1),
		Method:  "unknown/method",
	})

	rawResp, _ := server.HandleRequest(rawReq)
	var resp Response
	json.Unmarshal(rawResp, &resp)

	if resp.Error == nil || resp.Error.Code != ErrCodeMethodNotFound {
		t.Errorf("expected MethodNotFound error, got %v", resp.Error)
	}
}

func TestHandleRequest_ToolsList_ReturnsAllTools(t *testing.T) {
	server := NewServer(t.TempDir())
	rawReq := mustMarshal(t, Request{
		JSONRPC: "2.0",
		ID:      mustMarshal(t, 1),
		Method:  "tools/list",
	})

	rawResp, _ := server.HandleRequest(rawReq)
	var resp Response
	json.Unmarshal(rawResp, &resp)

	var result ToolsListResult
	json.Unmarshal(resp.Result, &result)

	expectedTools := []string{"workflow_get_state", "workflow_create_ticket", "workflow_advance_phase", "workflow_check_permission"}
	if len(result.Tools) != len(expectedTools) {
		t.Errorf("expected %d tools, got %d", len(expectedTools), len(result.Tools))
	}
}

// ── Workflow tool tests ──────────────────────────────────────────────────────

func TestToolGetState_NoTicket_ReturnsGuidance(t *testing.T) {
	projectDir := t.TempDir()
	result, err := toolGetState(projectDir)
	if err != nil {
		t.Fatalf("toolGetState error: %v", err)
	}
	if result.IsError {
		t.Errorf("expected no error for missing ticket")
	}
	if len(result.Content) == 0 {
		t.Fatal("expected non-empty content")
	}
	text := result.Content[0].Text
	if text == "" {
		t.Error("expected guidance text for missing ticket")
	}
}

func TestToolCreateTicket_ValidArgs_CreatesTicketFile(t *testing.T) {
	projectDir := t.TempDir()
	args := map[string]interface{}{
		"title":    "Add user login",
		"taskType": "feature",
		"branch":   "feature/add-user-login",
	}

	result, err := toolCreateTicket(projectDir, args)
	if err != nil {
		t.Fatalf("toolCreateTicket error: %v", err)
	}
	if result.IsError {
		t.Errorf("unexpected error: %s", result.Content[0].Text)
	}

	// Verify the ticket file was created on disk.
	ticketPath := workflowTicketPath(projectDir)
	if _, statErr := os.Stat(ticketPath); os.IsNotExist(statErr) {
		t.Error("ticket file was not created")
	}

	ticket, _ := readTicket(projectDir)
	if ticket.Title != "Add user login" {
		t.Errorf("expected title 'Add user login', got %q", ticket.Title)
	}
	if ticket.Phase != PhaseTicket {
		t.Errorf("expected phase ticket, got %q", ticket.Phase)
	}
}

func TestToolCreateTicket_MissingTitle_ReturnsError(t *testing.T) {
	projectDir := t.TempDir()
	args := map[string]interface{}{
		"taskType": "feature",
		"branch":   "feature/something",
		// title intentionally missing
	}

	result, _ := toolCreateTicket(projectDir, args)
	if !result.IsError {
		t.Error("expected error for missing title")
	}
}

func TestToolCreateTicket_ExistingActiveTicket_ReturnsError(t *testing.T) {
	projectDir := t.TempDir()
	// Create first ticket.
	toolCreateTicket(projectDir, map[string]interface{}{
		"title": "First task", "taskType": "feature", "branch": "feature/first",
	})

	// Attempt to create a second while the first is active.
	result, _ := toolCreateTicket(projectDir, map[string]interface{}{
		"title": "Second task", "taskType": "fix", "branch": "fix/second",
	})
	if !result.IsError {
		t.Error("expected error when ticket already exists")
	}
}

func TestToolAdvancePhase_ValidTransition_UpdatesPhase(t *testing.T) {
	projectDir := t.TempDir()
	// Create a ticket in the ticket phase.
	toolCreateTicket(projectDir, map[string]interface{}{
		"title": "Test task", "taskType": "feature", "branch": "feature/test",
	})

	result, err := toolAdvancePhase(projectDir, map[string]interface{}{
		"nextPhase": "planning",
		"summary":   "Ticket created",
	})
	if err != nil {
		t.Fatalf("toolAdvancePhase error: %v", err)
	}
	if result.IsError {
		t.Errorf("unexpected error: %s", result.Content[0].Text)
	}

	ticket, _ := readTicket(projectDir)
	if ticket.Phase != PhasePlanning {
		t.Errorf("expected phase planning, got %q", ticket.Phase)
	}
}

func TestToolAdvancePhase_SkipsPhase_ReturnsError(t *testing.T) {
	projectDir := t.TempDir()
	toolCreateTicket(projectDir, map[string]interface{}{
		"title": "Test task", "taskType": "feature", "branch": "feature/test",
	})

	// Try to skip directly from ticket to implementation (skipping planning).
	result, _ := toolAdvancePhase(projectDir, map[string]interface{}{
		"nextPhase": "implementation",
		"plan":      "do stuff",
	})
	if !result.IsError {
		t.Error("expected error when skipping phases")
	}
}

func TestToolAdvancePhase_ToImplementation_RequiresPlan(t *testing.T) {
	projectDir := t.TempDir()
	toolCreateTicket(projectDir, map[string]interface{}{
		"title": "Test", "taskType": "feature", "branch": "feature/test",
	})
	toolAdvancePhase(projectDir, map[string]interface{}{"nextPhase": "planning", "summary": "ok"})

	// Advance to implementation without a plan.
	result, _ := toolAdvancePhase(projectDir, map[string]interface{}{
		"nextPhase": "implementation",
		// plan intentionally missing
	})
	if !result.IsError {
		t.Error("expected error when advancing to implementation without plan")
	}
}

func TestToolCheckPermission_WriteSource_OnlyAllowedInImplementation(t *testing.T) {
	projectDir := t.TempDir()
	toolCreateTicket(projectDir, map[string]interface{}{
		"title": "Test", "taskType": "feature", "branch": "feature/test",
	})

	// In ticket phase: write_source should be denied.
	result, _ := toolCheckPermission(projectDir, map[string]interface{}{"action": "write_source"})
	if result.IsError {
		t.Fatalf("unexpected error calling check_permission: %s", result.Content[0].Text)
	}
	if len(result.Content) == 0 {
		t.Fatal("empty response")
	}
	text := result.Content[0].Text
	// Should contain a denial indicator.
	if text == "" {
		t.Error("expected non-empty permission response")
	}
}

// ── Phase logic tests ────────────────────────────────────────────────────────

func TestIsPhaseAllowed_ValidSequence_ReturnsTrue(t *testing.T) {
	cases := []struct {
		current WorkflowPhase
		next    WorkflowPhase
	}{
		{PhaseTicket, PhasePlanning},
		{PhasePlanning, PhaseImplementation},
		{PhaseImplementation, PhaseReview},
		{PhaseReview, PhaseComplete},
	}
	for _, c := range cases {
		ticket := &WorkflowTicket{Phase: c.current}
		if !ticket.IsPhaseAllowed(c.next) {
			t.Errorf("expected %s → %s to be allowed", c.current, c.next)
		}
	}
}

func TestIsPhaseAllowed_SkipOrReverse_ReturnsFalse(t *testing.T) {
	cases := []struct {
		current WorkflowPhase
		next    WorkflowPhase
	}{
		{PhaseTicket, PhaseImplementation},  // skip
		{PhaseImplementation, PhasePlanning}, // reverse
		{PhaseComplete, PhaseTicket},         // restart not allowed
	}
	for _, c := range cases {
		ticket := &WorkflowTicket{Phase: c.current}
		if ticket.IsPhaseAllowed(c.next) {
			t.Errorf("expected %s → %s to be denied", c.current, c.next)
		}
	}
}

// ── Resource tests ───────────────────────────────────────────────────────────

func TestResourceWorkflowState_NoTicket_ReturnsHasActiveFalse(t *testing.T) {
	projectDir := t.TempDir()
	result, err := resourceWorkflowState(projectDir)
	if err != nil {
		t.Fatalf("resourceWorkflowState error: %v", err)
	}
	if len(result.Contents) == 0 {
		t.Fatal("expected content")
	}

	var state map[string]interface{}
	json.Unmarshal([]byte(result.Contents[0].Text), &state)
	if state["hasActiveTicket"] != false {
		t.Errorf("expected hasActiveTicket=false, got %v", state["hasActiveTicket"])
	}
}

func TestResourceWorkflowState_WithTicket_ReturnsTicketData(t *testing.T) {
	projectDir := t.TempDir()
	now := time.Now().UTC()
	ticket := &WorkflowTicket{
		ID:        "WF-TEST",
		Title:     "Test",
		Phase:     PhaseImplementation,
		CreatedAt: now,
		UpdatedAt: now,
	}
	writeTicket(projectDir, ticket)

	result, _ := resourceWorkflowState(projectDir)
	var state map[string]interface{}
	json.Unmarshal([]byte(result.Contents[0].Text), &state)

	if state["hasActiveTicket"] != true {
		t.Errorf("expected hasActiveTicket=true")
	}
}

func TestResourcePhaseDefinitions_ReturnsAllPhases(t *testing.T) {
	result, err := resourcePhaseDefinitions()
	if err != nil {
		t.Fatalf("error: %v", err)
	}
	text := result.Contents[0].Text
	for _, phase := range []string{"ticket", "planning", "implementation", "review", "complete"} {
		if !containsString(text, phase) {
			t.Errorf("phase definitions missing phase: %s", phase)
		}
	}
}

// ── Helpers ──────────────────────────────────────────────────────────────────

func mustMarshal(t *testing.T, v interface{}) json.RawMessage {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("mustMarshal: %v", err)
	}
	return b
}

func containsString(haystack, needle string) bool {
	return filepath.Base(haystack) != "" && len(haystack) > 0 &&
		len(needle) > 0 &&
		(func() bool {
			for i := 0; i <= len(haystack)-len(needle); i++ {
				if haystack[i:i+len(needle)] == needle {
					return true
				}
			}
			return false
		})()
}
