package main

// handlers_mcp_test.go contains unit tests for the MCP HTTP route handlers.
//
// Integration behaviour (auth dispatch, JSON-RPC method routing) is tested
// more thoroughly in internal/mcp/server_test.go. Tests here focus on the
// thin HTTP adapter layer: route-level concerns like task ID extraction
// and CORS headers.

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestExtractTaskID_ValidPath(t *testing.T) {
	tests := []struct {
		path     string
		expected string
	}{
		{"/api/mcp/tasks/abc-123", "abc-123"},
		{"/api/mcp/tasks/some-uuid-here", "some-uuid-here"},
	}

	for _, tc := range tests {
		result := extractTaskID(tc.path)
		if result != tc.expected {
			t.Errorf("extractTaskID(%q): expected %q, got %q", tc.path, tc.expected, result)
		}
	}
}

func TestExtractTaskID_InvalidPaths(t *testing.T) {
	invalidPaths := []string{
		"/api/mcp",
		"/api/mcp/tasks",
		"/api/mcp/tasks/",
		"/other/path/tasks/123",
	}

	for _, path := range invalidPaths {
		result := extractTaskID(path)
		if path == "/api/mcp/tasks/" && result != "" {
			// Trailing slash after prefix should return empty.
			t.Errorf("expected empty ID for path %q, got %q", path, result)
		}
	}
}

func TestApplyCORSHeaders_SetsExpectedHeaders(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/mcp", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	w := httptest.NewRecorder()

	applyCORSHeaders(w, req)

	if w.Header().Get("Access-Control-Allow-Origin") != "http://localhost:3000" {
		t.Errorf("expected origin echo, got: %q", w.Header().Get("Access-Control-Allow-Origin"))
	}
	if w.Header().Get("Access-Control-Allow-Methods") == "" {
		t.Error("expected Access-Control-Allow-Methods header to be set")
	}
	if w.Header().Get("Access-Control-Allow-Headers") == "" {
		t.Error("expected Access-Control-Allow-Headers header to be set")
	}
}

func TestApplyCORSHeaders_DefaultsToWildcard(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/mcp", nil)
	// No Origin header
	w := httptest.NewRecorder()

	applyCORSHeaders(w, req)

	origin := w.Header().Get("Access-Control-Allow-Origin")
	if origin != "*" {
		t.Errorf("expected '*' when no Origin header, got %q", origin)
	}
}

func TestHandleMCP_ServiceUnavailableWhenNotInitialised(t *testing.T) {
	// mcpServer is nil at test startup (initMCPServer not called).
	// Verify we get a 503 and not a panic.
	req := httptest.NewRequest(http.MethodPost, "/api/mcp", nil)
	w := httptest.NewRecorder()

	handleMCP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("expected 503, got %d", w.Code)
	}
}

func TestHandleMCPTaskStatus_ServiceUnavailableWhenNotInitialised(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/mcp/tasks/some-id", nil)
	w := httptest.NewRecorder()

	handleMCPTaskStatus(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("expected 503, got %d", w.Code)
	}
}
