// Package workflow — branch_test.go: reading which branch a project is on without spawning git.
//
// The ledger's branch check only works if the branch can be read cheaply and
// reliably from inside a unit test. These tests pin the three shapes that
// matter: an ordinary checkout, a worktree whose .git is a pointer file, and
// the cases where there is honestly no branch to report.
package workflow

import (
	"os"
	"path/filepath"
	"testing"
)

func writeFileForTest(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("creating %s: %v", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("writing %s: %v", path, err)
	}
}

func TestCurrentBranchReadsAnOrdinaryCheckout(t *testing.T) {
	projectRoot := t.TempDir()
	writeFileForTest(t, filepath.Join(projectRoot, ".git", "HEAD"), "ref: refs/heads/fix/session-scoped-gates\n")

	if got := CurrentBranch(projectRoot); got != "fix/session-scoped-gates" {
		t.Errorf("expected the branch named in HEAD, got %q", got)
	}
}

func TestCurrentBranchFollowsAWorktreePointerFile(t *testing.T) {
	// A linked worktree has a .git *file* naming the directory that holds its
	// HEAD. Forge provisions worktrees for concurrent pipelines, so this is an
	// ordinary case here, not an edge.
	mainRepository := t.TempDir()
	worktreeState := filepath.Join(mainRepository, ".git", "worktrees", "tab-9")
	writeFileForTest(t, filepath.Join(worktreeState, "HEAD"), "ref: refs/heads/feature/from-a-worktree\n")

	worktreeRoot := t.TempDir()
	writeFileForTest(t, filepath.Join(worktreeRoot, ".git"), "gitdir: "+worktreeState+"\n")

	if got := CurrentBranch(worktreeRoot); got != "feature/from-a-worktree" {
		t.Errorf("expected the worktree's branch, got %q", got)
	}
}

func TestCurrentBranchIsEmptyWhenHeadIsDetached(t *testing.T) {
	projectRoot := t.TempDir()
	writeFileForTest(t, filepath.Join(projectRoot, ".git", "HEAD"), "3f2a9c1e5b7d4a8f9c0e1d2b3a4f5e6d7c8b9a0f\n")

	if got := CurrentBranch(projectRoot); got != "" {
		t.Errorf("a detached HEAD has no branch to report, got %q", got)
	}
}

func TestCurrentBranchIsEmptyOutsideARepository(t *testing.T) {
	if got := CurrentBranch(t.TempDir()); got != "" {
		t.Errorf("a directory with no .git has no branch, got %q", got)
	}
}
