package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/mikejsmith1985/forge-terminal/internal/am"
)

// Task 3 TDD Tests: Backend Chat Handler
//
// Tests for:
// - /api/llm/chat endpoint
// - Terminal context prepending (last 50 lines)
// - Image summary integration
// - Tier-based routing
// - Streaming response

// Test 1: Chat request parsing
func TestChatRequestParsing(t *testing.T) {
	reqBody := `{"message": "How do I fix this error?", "tabId": "tab-123"}`
	reader := strings.NewReader(reqBody)

	var req ChatRequest
	if err := json.NewDecoder(reader).Decode(&req); err != nil {
		t.Fatalf("Failed to decode request: %v", err)
	}

	if req.Message != "How do I fix this error?" {
		t.Errorf("Expected message 'How do I fix this error?', got '%s'", req.Message)
	}

	if req.TabID != "tab-123" {
		t.Errorf("Expected tabId 'tab-123', got '%s'", req.TabID)
	}
}

// Test 2: Empty message validation
func TestChatEmptyMessageValidation(t *testing.T) {
	req := httptest.NewRequest("POST", "/api/llm/chat", strings.NewReader(`{"message": "", "tabId": "tab-1"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handleChat(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", w.Code)
	}
}

// Test 3: Method not allowed
func TestChatMethodNotAllowed(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/llm/chat", nil)
	w := httptest.NewRecorder()

	handleChat(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("Expected status 405, got %d", w.Code)
	}
}

// Test 4: Context building function
func TestBuildChatContext(t *testing.T) {
	// This tests the context building logic
	// The function should return terminal output and vision insights
	tabID := "test-tab-nonexistent"
	context, err := buildChatContext(tabID)

	// For a non-existent tab, it should return empty context without error
	if err != nil {
		t.Errorf("Expected no error for missing tab, got: %v", err)
	}

	// Context can be empty for non-existent tabs
	// Just verify it doesn't crash
	_ = context
}

// Test 5: Prompt construction
func TestBuildChatPrompt(t *testing.T) {
	userMessage := "What does this error mean?"
	context := "Recent Terminal Output:\nERROR: undefined variable 'foo'"

	prompt := buildChatPrompt(userMessage, context)

	// Should contain both context and user message
	if !strings.Contains(prompt, "=== CONTEXT ===") {
		t.Error("Prompt should contain context section")
	}
	if !strings.Contains(prompt, userMessage) {
		t.Error("Prompt should contain user message")
	}
	if !strings.Contains(prompt, context) {
		t.Error("Prompt should contain the context")
	}
}

// Test 6: Prompt without context
func TestBuildChatPromptNoContext(t *testing.T) {
	userMessage := "Hello, how are you?"
	context := ""

	prompt := buildChatPrompt(userMessage, context)

	// Should still contain user message
	if !strings.Contains(prompt, userMessage) {
		t.Error("Prompt should contain user message")
	}

	// Should NOT contain context section when context is empty
	if strings.Contains(prompt, "=== CONTEXT ===") {
		t.Error("Prompt should not contain context section when empty")
	}
}

// Test 7: Line extraction function  
func TestExtractRecentLines(t *testing.T) {
	// Empty snapshots should return empty string
	result := extractRecentLines(nil, 50)
	if result != "" {
		t.Errorf("Expected empty string for nil snapshots, got: %s", result)
	}

	// Empty slice should return empty string
	result = extractRecentLines([]am.StateSnapshot{}, 50)
	if result != "" {
		t.Errorf("Expected empty string for empty snapshots, got: %s", result)
	}
}

func TestExtractRecentLinesWithContent(t *testing.T) {
	snapshots := []am.StateSnapshot{
		{CleanedContent: "line1\nline2\nline3\nline4\nline5"},
	}

	result := extractRecentLines(snapshots, 3)
	if !strings.Contains(result, "line3") {
		t.Error("Should contain line3")
	}
	if !strings.Contains(result, "line4") {
		t.Error("Should contain line4")
	}
	if !strings.Contains(result, "line5") {
		t.Error("Should contain line5")
	}
	if strings.Contains(result, "line1") {
		t.Error("Should not contain line1 (too old)")
	}
}
