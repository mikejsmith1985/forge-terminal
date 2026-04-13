package mcp_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/mikejsmith1985/forge-terminal/internal/mcp"
	"github.com/mikejsmith1985/forge-terminal/internal/workflow"
)

// buildTestServer creates an MCP server with no real terminal/workflow deps —
// suitable for testing JSON-RPC dispatch and auth without live PTY sessions.
func buildTestServer(t *testing.T) *mcp.Server {
	t.Helper()
	return mcp.NewServer("test-token", mcp.Dependencies{
		TermHandler:    nil, // terminal tools won't be called in these tests
		ProjectPath:    t.TempDir(),
		WorkflowConfig: workflow.WorkflowConfig{},
	})
}

func TestServer_HandleHTTP_RejectsNoToken(t *testing.T) {
	srv := buildTestServer(t)
	req := httptest.NewRequest(http.MethodPost, "/api/mcp", bytes.NewBufferString(`{}`))
	w := httptest.NewRecorder()

	srv.HandleHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestServer_HandleHTTP_RejectsWrongToken(t *testing.T) {
	srv := buildTestServer(t)
	req := httptest.NewRequest(http.MethodPost, "/api/mcp", bytes.NewBufferString(`{}`))
	req.Header.Set("Authorization", "Bearer wrong")
	w := httptest.NewRecorder()

	srv.HandleHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestServer_HandleHTTP_Initialize(t *testing.T) {
	srv := buildTestServer(t)

	body := `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}`
	req := httptest.NewRequest(http.MethodPost, "/api/mcp", bytes.NewBufferString(body))
	req.Header.Set("Authorization", "Bearer test-token")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	srv.HandleHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d — body: %s", w.Code, w.Body.String())
	}

	var resp map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("response is not valid JSON: %v", err)
	}

	result, hasResult := resp["result"].(map[string]any)
	if !hasResult {
		t.Fatalf("expected 'result' in response, got: %v", resp)
	}
	if result["protocolVersion"] != "2024-11-05" {
		t.Errorf("unexpected protocolVersion: %v", result["protocolVersion"])
	}
}

func TestServer_HandleHTTP_ToolsList(t *testing.T) {
	srv := buildTestServer(t)

	body := `{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}`
	req := httptest.NewRequest(http.MethodPost, "/api/mcp", bytes.NewBufferString(body))
	req.Header.Set("Authorization", "Bearer test-token")
	w := httptest.NewRecorder()

	srv.HandleHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("response is not valid JSON: %v", err)
	}

	result, ok := resp["result"].(map[string]any)
	if !ok {
		t.Fatalf("expected result object, got %T", resp["result"])
	}
	tools, ok := result["tools"].([]any)
	if !ok {
		t.Fatalf("expected tools array in result")
	}
	if len(tools) == 0 {
		t.Error("expected at least one tool in the list")
	}
}

func TestServer_HandleHTTP_UnknownMethod(t *testing.T) {
	srv := buildTestServer(t)

	body := `{"jsonrpc":"2.0","id":3,"method":"nonexistent/method","params":{}}`
	req := httptest.NewRequest(http.MethodPost, "/api/mcp", bytes.NewBufferString(body))
	req.Header.Set("Authorization", "Bearer test-token")
	w := httptest.NewRecorder()

	srv.HandleHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 (JSON-RPC errors are always 200), got %d", w.Code)
	}

	var resp map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("response is not valid JSON: %v", err)
	}
	if resp["error"] == nil {
		t.Error("expected JSON-RPC error for unknown method, but got none")
	}
}

func TestServer_Broker_IsNonNil(t *testing.T) {
	srv := buildTestServer(t)
	if srv.Broker() == nil {
		t.Error("expected Server.Broker() to return a non-nil TaskBroker")
	}
}

func TestServer_HandleHTTP_TaskSubmit(t *testing.T) {
	srv := buildTestServer(t)

	body := `{
		"jsonrpc": "2.0",
		"id": 4,
		"method": "tools/call",
		"params": {
			"name": "task_submit",
			"arguments": {
				"type": "bug-report",
				"payload": "## Bug\nSomething broke.",
				"source": "test"
			}
		}
	}`
	req := httptest.NewRequest(http.MethodPost, "/api/mcp", bytes.NewBufferString(body))
	req.Header.Set("Authorization", "Bearer test-token")
	w := httptest.NewRecorder()

	srv.HandleHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d — body: %s", w.Code, w.Body.String())
	}

	var resp map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("response is not valid JSON: %v", err)
	}
	if resp["error"] != nil {
		t.Errorf("unexpected error in response: %v", resp["error"])
	}

	result, hasResult := resp["result"].(map[string]any)
	if !hasResult {
		t.Fatalf("expected result in response")
	}
	content, hasContent := result["content"].([]any)
	if !hasContent || len(content) == 0 {
		t.Fatal("expected content in result")
	}
	contentItem, ok := content[0].(map[string]any)
	if !ok {
		t.Fatal("expected content item to be a map")
	}

	text, _ := contentItem["text"].(string)
	var taskResp map[string]any
	if err := json.Unmarshal([]byte(text), &taskResp); err != nil {
		t.Fatalf("content text is not valid JSON: %v — text: %q", err, text)
	}
	if taskResp["taskId"] == "" {
		t.Error("expected non-empty taskId in task_submit response")
	}
}
