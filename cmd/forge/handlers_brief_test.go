// handlers_brief_test.go — the endpoint that restores a brief after a reload.
//
// The behaviour worth pinning is the empty case. A session that has published
// nothing is the ordinary state at the start of a change, not an error, and
// answering it with a 404 would make the client interpret a failure that never
// happened. The panel should stay quiet, not break.
package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/mikejsmith1985/forge-terminal/internal/workflow"
)

// withWorkingDirectory runs a test from a temporary project root.
//
// The handler reads the project from the process working directory, so a test
// that did not change it would read the real repository and see whatever briefs
// happen to be lying around.
func withWorkingDirectory(t *testing.T, projectRoot string) {
	t.Helper()

	originalDirectory, err := os.Getwd()
	if err != nil {
		t.Fatalf("reading the working directory: %v", err)
	}
	if err := os.Chdir(projectRoot); err != nil {
		t.Fatalf("changing to the temp project: %v", err)
	}
	t.Cleanup(func() { _ = os.Chdir(originalDirectory) })
}

func publishTestBrief(t *testing.T, projectRoot, sessionID string) {
	t.Helper()

	brief := workflow.ChangeBrief{
		BriefID:        "brief-test-001",
		SessionID:      sessionID,
		TaskID:         "task-test-001",
		Headline:       "Folders now give up their path on a right-click",
		WhatChanged:    "Right-clicking a folder offers Copy Path in both surfaces of the interface.",
		WhyItChanged:   "Copy Path existed on files only, so a folder path could not be obtained.",
		WhatCouldBreak: "The clipboard is unavailable outside a secure context, so a copy reports failure.",
		IsRoutine:      true,
		FilesTouched:   6,
	}

	if err := workflow.SaveBrief(projectRoot, &brief); err != nil {
		t.Fatalf("publishing a test brief: %v", err)
	}
}

func TestBriefLatestReturnsAPublishedBrief(t *testing.T) {
	projectRoot := t.TempDir()
	withWorkingDirectory(t, projectRoot)
	publishTestBrief(t, projectRoot, "session-001")

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/brief/latest?sessionId=session-001", nil)

	handleBriefLatest(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", recorder.Code)
	}

	var body struct {
		Brief *workflow.ChangeBrief `json:"brief"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("decoding the response: %v", err)
	}
	if body.Brief == nil || body.Brief.TaskID != "task-test-001" {
		t.Errorf("the published brief should be returned, got: %s", recorder.Body.String())
	}
}

func TestBriefLatestAnswersEmptyWhenNothingWasPublished(t *testing.T) {
	// The ordinary state at the start of a change. A 404 here would make the
	// client treat a normal situation as a failure.
	withWorkingDirectory(t, t.TempDir())

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/brief/latest?sessionId=session-001", nil)

	handleBriefLatest(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("a session with no brief is not an error: want 200, got %d", recorder.Code)
	}

	var body map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("the response should still be valid JSON, got: %s", recorder.Body.String())
	}
	if _, hasBrief := body["brief"]; hasBrief {
		t.Error("no brief should be reported when none was published")
	}
}

func TestBriefLatestRejectsAWrongMethod(t *testing.T) {
	withWorkingDirectory(t, t.TempDir())

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/brief/latest", nil)

	handleBriefLatest(recorder, request)

	if recorder.Code != http.StatusMethodNotAllowed {
		t.Errorf("want 405, got %d", recorder.Code)
	}
}

func TestBriefLatestStoresBriefsBesideTheTicket(t *testing.T) {
	// One gitignored directory holds the whole of the workflow's local state,
	// so the hook and the panel have a single place to look.
	projectRoot := t.TempDir()
	publishTestBrief(t, projectRoot, "session-001")

	briefDirectory := filepath.Join(projectRoot, workflow.TicketDir, workflow.BriefDirName)
	if _, err := os.Stat(briefDirectory); err != nil {
		t.Errorf("briefs should live at %s, got: %v", briefDirectory, err)
	}
}
