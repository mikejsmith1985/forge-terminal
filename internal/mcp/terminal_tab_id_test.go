// terminal_tab_id_test.go - terminal tools take tab_id, and still accept session_id.
//
// The Claude desktop app strips an argument named session_id before it reaches
// Forge (job_id survives, so it is the name, not the underscore). The terminal
// tools therefore declare tab_id, and keep accepting session_id in any spelling
// so existing prompts and clients keep working.
package mcp_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/mikejsmith1985/forge-terminal/internal/mcp"
)

func TestTerminalReadAcceptsTabID(t *testing.T) {
	srv := buildTestServer(t)

	responseText, _ := callToolOverHTTP(t, srv, "terminal_read", map[string]any{"tab_id": "tab-1"})

	if strings.Contains(responseText, "is required") {
		t.Fatalf("tab_id was not accepted: %q", responseText)
	}
}

func TestTerminalToolsStillAcceptEverySpellingOfSessionID(t *testing.T) {
	srv := buildTestServer(t)

	for _, legacyName := range []string{"session_id", "sessionId", "Session-ID"} {
		responseText, _ := callToolOverHTTP(t, srv, "terminal_read", map[string]any{legacyName: "tab-1"})
		if strings.Contains(responseText, "is required") {
			t.Errorf("%s was not accepted as an alias: %q", legacyName, responseText)
		}
	}
}

func TestTerminalExecuteAcceptsTabID(t *testing.T) {
	srv := buildTestServer(t)

	responseText, _ := callToolOverHTTP(t, srv, "terminal_execute", map[string]any{"tab_id": "tab-1", "command": "echo hi"})

	if strings.Contains(responseText, "is required") {
		t.Fatalf("tab_id was not accepted: %q", responseText)
	}
}

func TestTerminalToolsAdvertiseTabID(t *testing.T) {
	srv := buildTestServer(t)
	request := httptest.NewRequest(http.MethodGet, "/api/mcp", nil)
	request.Header.Set("Authorization", "Bearer test-token")
	recorder := httptest.NewRecorder()
	srv.HandleHTTP(recorder, request)
	var toolList mcp.ListToolsResult
	if err := json.Unmarshal(recorder.Body.Bytes(), &toolList); err != nil {
		t.Fatalf("tool discovery is not JSON: %v", err)
	}

	for _, definition := range toolList.Tools {
		if definition.Name != "terminal_read" && definition.Name != "terminal_execute" {
			continue
		}
		schemaText := string(definition.InputSchema)
		if !strings.Contains(schemaText, `"tab_id"`) {
			t.Errorf("%s does not declare tab_id: %s", definition.Name, schemaText)
		}
		if strings.Contains(schemaText, `"session_id"`) {
			t.Errorf("%s still declares session_id, which the desktop app strips", definition.Name)
		}
	}
}
