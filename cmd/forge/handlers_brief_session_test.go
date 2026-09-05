// handlers_brief_session_test.go — the reload path reads the tab's project, not Forge's directory.
//
// The defect this pins: the brief restored after a page reload was looked up
// in the Forge process's working directory. Launched from a shortcut on
// Windows that directory is system32, so the lookup answered "nothing
// published" for every tab, and a brief lost to a refresh stayed lost.
package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestBriefLatestReadsTheSessionsProjectNotTheProcessDirectory(t *testing.T) {
	// The process stands in an empty directory that is nobody's project.
	withWorkingDirectory(t, t.TempDir())

	sessionProject := t.TempDir()
	if err := os.MkdirAll(filepath.Join(sessionProject, ".git"), 0o755); err != nil {
		t.Fatalf("marking the project: %v", err)
	}
	const sessionID = "tab-bound-elsewhere"
	sddPipelines.Store(sessionID, &sddPipeline{repoRoot: sessionProject})
	t.Cleanup(func() { sddPipelines.Delete(sessionID) })

	publishTestBrief(t, sessionProject, sessionID)

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/brief/latest?sessionId="+sessionID, nil)
	handleBriefLatest(recorder, request)

	var body map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("decoding: %v", err)
	}
	brief, hasBrief := body["brief"].(map[string]any)
	if !hasBrief {
		t.Fatalf("the brief published in the session's project should be restored, got %s", recorder.Body.String())
	}
	if brief["briefId"] != "brief-test-001" {
		t.Errorf("expected the published brief, got %v", brief["briefId"])
	}
}
