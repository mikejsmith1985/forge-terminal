package main

import (
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// runGitInDir runs a git command inside dir and fails the test on error.
func runGitInDir(t *testing.T, dir string, args ...string) string {
	t.Helper()
	gitArgs := append([]string{"-C", dir}, args...)
	gitCmd := exec.Command("git", gitArgs...)
	output, err := gitCmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v failed: %s — %s", args, err, string(output))
	}
	return strings.TrimSpace(string(output))
}

// newScaffoldedTempRepo creates a temp git repo containing one unstaged file,
// mirroring the state a project is in right after scaffolding.
func newScaffoldedTempRepo(t *testing.T) string {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not installed")
	}
	repoDir := t.TempDir()
	runGitInDir(t, repoDir, "init")
	runGitInDir(t, repoDir, "config", "user.name", "Test User")
	runGitInDir(t, repoDir, "config", "user.email", "test@example.com")
	scaffoldFile := filepath.Join(repoDir, "CHANGELOG.md")
	if err := os.WriteFile(scaffoldFile, []byte("# Changelog\n"), 0o644); err != nil {
		t.Fatalf("writing scaffold file: %s", err)
	}
	return repoDir
}

func TestCreateInitialCommit_CommitsScaffoldFiles(t *testing.T) {
	repoDir := newScaffoldedTempRepo(t)

	if err := createInitialCommit(repoDir); err != nil {
		t.Fatalf("createInitialCommit: %s", err)
	}

	commitCount := runGitInDir(t, repoDir, "rev-list", "--count", "HEAD")
	if commitCount != "1" {
		t.Errorf("want exactly 1 commit after bootstrap, got %s", commitCount)
	}
	uncommitted := runGitInDir(t, repoDir, "status", "--porcelain")
	if uncommitted != "" {
		t.Errorf("want clean tree after bootstrap commit, got:\n%s", uncommitted)
	}
}

func TestCreateInitialCommit_BypassesBlockingPreCommitHook(t *testing.T) {
	// The scaffold installs a pre-commit hook that blocks commits on
	// main/master, so the bootstrap commit must not be stopped by it.
	repoDir := newScaffoldedTempRepo(t)
	hooksDir := filepath.Join(repoDir, "blocking-hooks")
	if err := os.MkdirAll(hooksDir, 0o755); err != nil {
		t.Fatalf("creating hooks dir: %s", err)
	}
	blockingHook := filepath.Join(hooksDir, "pre-commit")
	if err := os.WriteFile(blockingHook, []byte("#!/bin/sh\nexit 1\n"), 0o755); err != nil {
		t.Fatalf("writing blocking hook: %s", err)
	}
	runGitInDir(t, repoDir, "config", "core.hooksPath", "blocking-hooks")

	if err := createInitialCommit(repoDir); err != nil {
		t.Fatalf("bootstrap commit should bypass hooks, got: %s", err)
	}
}

func TestInitializeGitRepo_DefaultsToMainBranch(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not installed")
	}
	repoDir := t.TempDir()

	if err := initializeGitRepo(repoDir); err != nil {
		t.Fatalf("initializeGitRepo: %s", err)
	}

	headRef := runGitInDir(t, repoDir, "symbolic-ref", "HEAD")
	if headRef != "refs/heads/main" {
		t.Errorf("want unborn branch refs/heads/main, got %s", headRef)
	}
}

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
