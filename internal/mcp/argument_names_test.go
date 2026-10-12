// argument_names_test.go — a tool receives its arguments whichever spelling the client used.
//
// The defect these tests pin: some MCP clients rewrite argument keys between
// snake_case and camelCase before the request reaches Forge. terminal_read
// declares `session_id`; a client that sent `sessionId` got back
// "session_id is required" even though the session id was right there under
// another spelling. The fix matches each incoming key against the names the
// tool itself declares in its input schema, so neither direction of rewriting
// loses an argument.
package mcp_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mikejsmith1985/forge-terminal/internal/mcp"
)

// callToolOverHTTP sends one tools/call through the real JSON-RPC entry point
// and returns the first text item of the result, plus whether it was an error.
func callToolOverHTTP(t *testing.T, srv *mcp.Server, toolName string, args map[string]any) (string, bool) {
	t.Helper()
	requestBody, err := json.Marshal(map[string]any{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "tools/call",
		"params":  map[string]any{"name": toolName, "arguments": args},
	})
	if err != nil {
		t.Fatal(err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api/mcp", bytes.NewReader(requestBody))
	request.Header.Set("Authorization", "Bearer test-token")
	recorder := httptest.NewRecorder()
	srv.HandleHTTP(recorder, request)

	var response struct {
		Result *mcp.CallToolResult `json:"result"`
		Error  *mcp.JSONRPCError   `json:"error"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("response is not valid JSON: %v — body: %s", err, recorder.Body.String())
	}
	if response.Error != nil {
		t.Fatalf("unexpected JSON-RPC error: %s", response.Error.Message)
	}
	if response.Result == nil || len(response.Result.Content) == 0 {
		t.Fatalf("expected a result with content, got: %s", recorder.Body.String())
	}
	return response.Result.Content[0].Text, response.Result.IsError
}

func TestASnakeCaseArgumentSentInCamelCaseStillArrives(t *testing.T) {
	srv := buildTestServer(t)

	responseText, _ := callToolOverHTTP(t, srv, "terminal_read", map[string]any{"sessionId": "tab-1"})

	if strings.Contains(responseText, "session_id is required") {
		t.Fatalf("sessionId was not accepted as session_id: %q", responseText)
	}
}

func TestTheDeclaredSpellingStillArrivesUnchanged(t *testing.T) {
	srv := buildTestServer(t)

	responseText, _ := callToolOverHTTP(t, srv, "terminal_read", map[string]any{"session_id": "tab-1"})

	if strings.Contains(responseText, "session_id is required") {
		t.Fatalf("the declared spelling was lost: %q", responseText)
	}
}

func TestACamelCaseArgumentSentInSnakeCaseStillArrives(t *testing.T) {
	sessionProject := t.TempDir()
	createDirectoryForTest(t, filepath.Join(sessionProject, ".git"))
	createDirectoryForTest(t, filepath.Join(sessionProject, "only-in-session-project"))

	srv := mcp.NewServer("test-token", mcp.Dependencies{
		ProjectPathFunc: func() string { return "" },
		ProjectPathForSessionFunc: func(sessionID string) string {
			if sessionID == "tab-1" {
				return sessionProject
			}
			return ""
		},
	})

	responseText, isError := callToolOverHTTP(t, srv, "file_list", map[string]any{"session_id": "tab-1"})

	if isError || !strings.Contains(responseText, "only-in-session-project") {
		t.Fatalf("session_id was not accepted as sessionId: %q", responseText)
	}
}

func TestTheDeclaredSpellingWinsWhenBothAreSent(t *testing.T) {
	declaredProject := t.TempDir()
	createDirectoryForTest(t, filepath.Join(declaredProject, ".git"))
	createDirectoryForTest(t, filepath.Join(declaredProject, "declared-marker"))
	rewrittenProject := t.TempDir()
	createDirectoryForTest(t, filepath.Join(rewrittenProject, ".git"))

	srv := mcp.NewServer("test-token", mcp.Dependencies{
		ProjectPathFunc: func() string { return "" },
		ProjectPathForSessionFunc: func(sessionID string) string {
			return map[string]string{"declared": declaredProject, "rewritten": rewrittenProject}[sessionID]
		},
	})

	responseText, isError := callToolOverHTTP(t, srv, "file_list", map[string]any{
		"sessionId":  "declared",
		"session_id": "rewritten",
	})

	if isError || !strings.Contains(responseText, "declared-marker") {
		t.Fatalf("expected the declared sessionId to win, got: %q", responseText)
	}
}
