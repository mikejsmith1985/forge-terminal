// hooks_test.go — verifies EnsureHookInstalled behaviour across all four cases.
package workflow

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// makeGitDir creates a minimal .git directory in root so EnsureHookInstalled
// treats it as a real git working tree.
func makeGitDir(t *testing.T, root string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Join(root, ".git"), 0o755); err != nil {
		t.Fatalf("makeGitDir: %v", err)
	}
}

func TestEnsureHookInstalled_InstallsOnFreshRepo(t *testing.T) {
	dir := t.TempDir()
	makeGitDir(t, dir)

	if err := EnsureHookInstalled(dir); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	content, err := os.ReadFile(filepath.Join(dir, ".git", "hooks", "pre-commit"))
	if err != nil {
		t.Fatalf("hook file not created: %v", err)
	}
	if !strings.Contains(string(content), hookMarker) {
		t.Error("installed hook is missing the forge marker")
	}
	if !strings.Contains(string(content), "workflow preflight") {
		t.Error("installed hook does not call 'workflow preflight'")
	}
}

func TestEnsureHookInstalled_Idempotent(t *testing.T) {
	dir := t.TempDir()
	makeGitDir(t, dir)

	// Install once, record the content.
	if err := EnsureHookInstalled(dir); err != nil {
		t.Fatalf("first install: %v", err)
	}
	hookPath := filepath.Join(dir, ".git", "hooks", "pre-commit")
	firstContent, _ := os.ReadFile(hookPath)
	firstInfo, _ := os.Stat(hookPath)

	// Install again — must be a no-op (content and mtime unchanged).
	if err := EnsureHookInstalled(dir); err != nil {
		t.Fatalf("second install: %v", err)
	}
	secondContent, _ := os.ReadFile(hookPath)
	secondInfo, _ := os.Stat(hookPath)

	if string(firstContent) != string(secondContent) {
		t.Error("hook content changed on second call — idempotency violated")
	}
	if firstInfo.ModTime() != secondInfo.ModTime() {
		t.Error("hook mtime changed on second call — file was rewritten unnecessarily")
	}
}

func TestEnsureHookInstalled_PreservesForeignHook(t *testing.T) {
	dir := t.TempDir()
	makeGitDir(t, dir)
	hooksDir := filepath.Join(dir, ".git", "hooks")
	if err := os.MkdirAll(hooksDir, 0o755); err != nil {
		t.Fatal(err)
	}

	foreignContent := "#!/bin/sh\necho 'my custom hook'\n"
	hookPath := filepath.Join(hooksDir, "pre-commit")
	if err := os.WriteFile(hookPath, []byte(foreignContent), 0o755); err != nil {
		t.Fatal(err)
	}

	// Preserved, but no longer silently: the caller is told the gate is absent.
	if err := EnsureHookInstalled(dir); !errors.Is(err, ErrForeignPreCommitHook) {
		t.Fatalf("expected ErrForeignPreCommitHook, got: %v", err)
	}

	got, _ := os.ReadFile(hookPath)
	if string(got) != foreignContent {
		t.Error("EnsureHookInstalled overwrote an existing non-Forge pre-commit hook")
	}
}

func TestEnsureHookInstalled_NoopWithoutGitDir(t *testing.T) {
	dir := t.TempDir()
	// No .git directory at all — must succeed silently.
	if err := EnsureHookInstalled(dir); err != nil {
		t.Fatalf("expected nil error when .git is absent, got: %v", err)
	}
}
