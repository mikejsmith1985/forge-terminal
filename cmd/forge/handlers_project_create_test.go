package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestHandleProjectCreate_RejectsNonPost(t *testing.T) {
	for _, method := range []string{"GET", "PUT", "DELETE", "PATCH"} {
		req := httptest.NewRequest(method, "/api/project/create", nil)
		rec := httptest.NewRecorder()
		handleProjectCreate(rec, req)
		if rec.Code != 405 {
			t.Errorf("method %s: want 405, got %d", method, rec.Code)
		}
	}
}

func TestHandleProjectCreate_RejectsBadJSON(t *testing.T) {
	req := httptest.NewRequest("POST", "/api/project/create", strings.NewReader("{not json"))
	rec := httptest.NewRecorder()
	handleProjectCreate(rec, req)
	if rec.Code != 400 {
		t.Fatalf("want 400 for malformed body, got %d", rec.Code)
	}
}

func TestHandleProjectCreate_RejectsEmptyName(t *testing.T) {
	body := `{"name":"","rootPath":"/tmp"}`
	req := httptest.NewRequest("POST", "/api/project/create", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handleProjectCreate(rec, req)
	if rec.Code != 400 {
		t.Fatalf("want 400 for empty name, got %d", rec.Code)
	}
}

func TestHandleProjectCreate_RejectsPathSeparatorsInName(t *testing.T) {
	cases := []string{"my/project", `my\project`, "../escape"}
	for _, name := range cases {
		body := `{"name":"` + name + `","rootPath":"/tmp"}`
		req := httptest.NewRequest("POST", "/api/project/create", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		handleProjectCreate(rec, req)
		if rec.Code != 400 {
			t.Errorf("name %q: want 400 (path traversal guard), got %d", name, rec.Code)
		}
	}
}

func TestHandleProjectCreate_RejectsMissingRootPath(t *testing.T) {
	body := `{"name":"my-project","rootPath":""}`
	req := httptest.NewRequest("POST", "/api/project/create", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handleProjectCreate(rec, req)
	if rec.Code != 400 {
		t.Fatalf("want 400 for missing rootPath, got %d", rec.Code)
	}
}

func TestHandleProjectCreate_CreatesGitHubRepoAfterInitialCommit(t *testing.T) {
	tempRoot := t.TempDir()
	fakeBinDir := t.TempDir()
	expectedProjectPath := filepath.Join(tempRoot, "github-project")
	t.Setenv("FORGE_TEST_GITHUB_SOURCE", expectedProjectPath)
	writeFakeGitHubCLI(t, fakeBinDir, createFakeGitHubScriptRequiringInitialCommit())
	t.Setenv("PATH", fakeBinDir+string(os.PathListSeparator)+os.Getenv("PATH"))

	body := `{"name":"github-project","rootPath":` + createJSONString(t, tempRoot) + `,"createGitHub":true,"visibility":"public"}`
	req := httptest.NewRequest(http.MethodPost, "/api/project/create", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	handleProjectCreate(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("want 200 for project creation, got %d: %s", rec.Code, rec.Body.String())
	}

	var response projectCreateResponse
	if decodeErr := json.NewDecoder(rec.Body).Decode(&response); decodeErr != nil {
		t.Fatalf("response JSON decode failed: %v", decodeErr)
	}
	if response.GitHub == nil || !response.GitHub.Created {
		t.Fatalf("expected GitHub repo to be created, got: %#v", response.GitHub)
	}
	if response.GitHub.URL != "https://github.com/example/github-project" {
		t.Fatalf("GitHub URL = %q, want fake gh URL", response.GitHub.URL)
	}
}

func writeFakeGitHubCLI(t *testing.T, fakeBinDir string, scriptBody string) {
	t.Helper()

	if runtime.GOOS == "windows" {
		scriptPath := filepath.Join(fakeBinDir, "gh.cmd")
		if writeErr := os.WriteFile(scriptPath, []byte("@echo off\r\n"+scriptBody), 0o755); writeErr != nil {
			t.Fatalf("writing fake gh.cmd: %v", writeErr)
		}
		return
	}

	scriptPath := filepath.Join(fakeBinDir, "gh")
	if writeErr := os.WriteFile(scriptPath, []byte("#!/usr/bin/env sh\n"+scriptBody), 0o755); writeErr != nil {
		t.Fatalf("writing fake gh: %v", writeErr)
	}
}

func createFakeGitHubScriptRequiringInitialCommit() string {
	if runtime.GOOS == "windows" {
		return strings.Join([]string{
			"git -C \"%FORGE_TEST_GITHUB_SOURCE%\" rev-parse --verify HEAD >nul 2>nul",
			"if errorlevel 1 (echo missing initial commit 1>&2 & exit /b 1)",
			"echo https://github.com/example/github-project",
			"exit /b 0",
		}, "\r\n")
	}

	return strings.Join([]string{
		`git -C "$FORGE_TEST_GITHUB_SOURCE" rev-parse --verify HEAD >/dev/null 2>&1 || { echo "missing initial commit" >&2; exit 1; }`,
		`echo "https://github.com/example/github-project"`,
	}, "\n")
}

func createJSONString(t *testing.T, value string) string {
	t.Helper()
	quoted, marshalErr := json.Marshal(value)
	if marshalErr != nil {
		t.Fatalf("JSON quote failed: %v", marshalErr)
	}
	return string(quoted)
}
