// changes_test.go verifies git-based change detection for the Code Tutor wizard.
package tutor

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// initTestRepo creates a temporary git repository with a committed file and returns its path.
func initTestRepo(t *testing.T) string {
	t.Helper()
	repoDir := t.TempDir()

	runCmd := func(args ...string) {
		t.Helper()
		cmd := exec.Command(args[0], args[1:]...)
		cmd.Dir = repoDir
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("command %v failed: %v — output: %s", args, err, out)
		}
	}

	runCmd("git", "init")
	runCmd("git", "config", "user.email", "test@forge.test")
	runCmd("git", "config", "user.name", "Forge Test")
	runCmd("git", "commit", "--allow-empty", "-m", "initial")

	return repoDir
}

func TestDetectRecentChanges_NonGitDir(t *testing.T) {
	// A plain temp dir (not a git repo) should return an empty ChangeSet without error.
	plainDir := t.TempDir()

	changeSet, err := DetectRecentChanges(plainDir)
	if err != nil {
		t.Fatalf("expected no error for non-git dir, got: %v", err)
	}
	if changeSet == nil {
		t.Fatal("expected non-nil ChangeSet")
	}
	if changeSet.Source != "none" {
		t.Errorf("expected source=none, got %q", changeSet.Source)
	}
	if len(changeSet.Files) != 0 {
		t.Errorf("expected 0 files, got %d", len(changeSet.Files))
	}
}

func TestDetectRecentChanges_NoChanges(t *testing.T) {
	// A clean repo with no uncommitted changes and no prior commits to diff should
	// return source=none and an empty file list.
	repoDir := initTestRepo(t)

	changeSet, err := DetectRecentChanges(repoDir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if changeSet.Source != "none" {
		t.Errorf("expected source=none, got %q", changeSet.Source)
	}
	if len(changeSet.Files) != 0 {
		t.Errorf("expected 0 files for clean repo, got %d", len(changeSet.Files))
	}
}

func TestDetectRecentChanges_UncommittedChange(t *testing.T) {
	repoDir := initTestRepo(t)

	// Create and stage a new file to simulate an agent adding something.
	filePath := filepath.Join(repoDir, "hello.go")
	if err := os.WriteFile(filePath, []byte("package main\n// hello\n"), 0644); err != nil {
		t.Fatalf("writing file: %v", err)
	}

	cmd := exec.Command("git", "add", "hello.go")
	cmd.Dir = repoDir
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git add failed: %v — %s", err, out)
	}

	changeSet, err := DetectRecentChanges(repoDir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if changeSet.Source != "uncommitted" {
		t.Errorf("expected source=uncommitted, got %q", changeSet.Source)
	}
	if len(changeSet.Files) != 1 {
		t.Errorf("expected 1 changed file, got %d", len(changeSet.Files))
	}
	if changeSet.Files[0].Path != "hello.go" {
		t.Errorf("expected path=hello.go, got %q", changeSet.Files[0].Path)
	}
	if changeSet.Files[0].Operation != "added" {
		t.Errorf("expected operation=added, got %q", changeSet.Files[0].Operation)
	}
}

func TestDetectRecentChanges_LastCommit(t *testing.T) {
	repoDir := initTestRepo(t)

	// Commit a file so the "last commit" detection path triggers.
	filePath := filepath.Join(repoDir, "server.go")
	if err := os.WriteFile(filePath, []byte("package main\n"), 0644); err != nil {
		t.Fatalf("writing file: %v", err)
	}

	runGit := func(args ...string) {
		cmd := exec.Command("git", args...)
		cmd.Dir = repoDir
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v failed: %v — %s", args, err, out)
		}
	}
	runGit("add", "server.go")
	runGit("commit", "-m", "add server")

	changeSet, err := DetectRecentChanges(repoDir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if changeSet.Source != "last-commit" {
		t.Errorf("expected source=last-commit, got %q", changeSet.Source)
	}
	if len(changeSet.Files) != 1 {
		t.Errorf("expected 1 file from last commit, got %d", len(changeSet.Files))
	}
}

func TestParseNumstatLine_ValidLine(t *testing.T) {
	additions, deletions := parseNumstatLine("12\t3\tinternal/tutor/changes.go")
	if additions != 12 {
		t.Errorf("expected 12 additions, got %d", additions)
	}
	if deletions != 3 {
		t.Errorf("expected 3 deletions, got %d", deletions)
	}
}

func TestParseNumstatLine_EmptyLine(t *testing.T) {
	additions, deletions := parseNumstatLine("")
	if additions != 0 || deletions != 0 {
		t.Errorf("expected 0,0 for empty line, got %d,%d", additions, deletions)
	}
}

func TestRunGitCommand_InvalidDir(t *testing.T) {
	_, err := runGitCommand("/this/path/does/not/exist/at/all", "status")
	if err == nil {
		t.Fatal("expected error for invalid dir, got nil")
	}
}

func TestChangeSet_ProjectPathPreserved(t *testing.T) {
	plainDir := t.TempDir()
	changeSet, err := DetectRecentChanges(plainDir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// ProjectPath should be preserved even when no changes are found.
	if !strings.HasSuffix(changeSet.ProjectPath, filepath.Base(plainDir)) &&
		changeSet.ProjectPath != plainDir {
		t.Errorf("expected ProjectPath to be %q, got %q", plainDir, changeSet.ProjectPath)
	}
}
