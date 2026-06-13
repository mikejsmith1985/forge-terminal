package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestHandleWorkflowGlobalInstall_RejectsNonPost proves the endpoint only
// accepts POST — a GET must not trigger any filesystem writes.
func TestHandleWorkflowGlobalInstall_RejectsNonPost(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/api/workflow/global-install", nil)
	recorder := httptest.NewRecorder()

	handleWorkflowGlobalInstall(recorder, request)

	if recorder.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405 for GET, got %d", recorder.Code)
	}
}

// TestHandleWorkflowGlobalInstall_WritesToHome proves a POST renders the real
// constitution and installs it into each CLI tool's global file. HOME and
// USERPROFILE are redirected to a temp dir so the test never touches the real
// home directory (USERPROFILE is what os.UserHomeDir reads on Windows; HOME on
// Unix — set both for cross-platform safety).
func TestHandleWorkflowGlobalInstall_WritesToHome(t *testing.T) {
	tempHome := t.TempDir()
	t.Setenv("USERPROFILE", tempHome)
	t.Setenv("HOME", tempHome)

	request := httptest.NewRequest(http.MethodPost, "/api/workflow/global-install", nil)
	recorder := httptest.NewRecorder()

	handleWorkflowGlobalInstall(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (body: %s)", recorder.Code, recorder.Body.String())
	}

	var result struct {
		MasterPath     string   `json:"masterPath"`
		TargetsWritten []string `json:"targetsWritten"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &result); err != nil {
		t.Fatalf("response is not valid JSON: %v", err)
	}
	if len(result.TargetsWritten) != 3 {
		t.Errorf("expected 3 CLI targets written, got %d", len(result.TargetsWritten))
	}

	// The Claude global file should exist and carry the real constitution.
	claudeFile := filepath.Join(tempHome, ".claude", "CLAUDE.md")
	content, err := os.ReadFile(claudeFile)
	if err != nil {
		t.Fatalf("Claude global file not written: %v", err)
	}
	if !strings.Contains(string(content), "fterm.exe") {
		t.Error("installed constitution missing process-protection rule")
	}
}
