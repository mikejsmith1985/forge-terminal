//go:build integration

// Integration tests for the git wrapper (specs/011, T005). These drive the REAL
// git binary against a throwaway repo (Constitution Article V: integration uses
// real infrastructure). Run with: go test -tags integration ./internal/git/...
package git

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// newTempRepo (T002) initialises a real git repo with one commit and returns its
// path plus the name of the branch HEAD points at, so tests have a stable base.
func newTempRepo(t *testing.T) (repoDir, baseBranch string) {
	t.Helper()
	repoDir = t.TempDir()
	run := func(args ...string) {
		cmd := exec.Command("git", args...)
		cmd.Dir = repoDir
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
	}
	run("init")
	run("config", "user.email", "test@example.com")
	run("config", "user.name", "Test")
	if err := os.WriteFile(filepath.Join(repoDir, "seed.txt"), []byte("seed\n"), 0o644); err != nil {
		t.Fatalf("seed write: %v", err)
	}
	run("add", "-A")
	run("commit", "-m", "seed")

	client := New()
	branch, err := client.CurrentBranch(repoDir)
	if err != nil {
		t.Fatalf("CurrentBranch: %v", err)
	}
	return repoDir, branch
}

func TestWorktreeAddListRemove_RealGit(t *testing.T) {
	repoDir, base := newTempRepo(t)
	client := New()

	wtPath := filepath.Join(repoDir, ".forge", "worktrees", "wt1")
	if err := client.WorktreeAdd(repoDir, wtPath, "forge/wt-int", base); err != nil {
		t.Fatalf("WorktreeAdd: %v", err)
	}
	if _, err := os.Stat(wtPath); err != nil {
		t.Fatalf("worktree dir missing: %v", err)
	}

	worktrees, err := client.WorktreeList(repoDir)
	if err != nil {
		t.Fatalf("WorktreeList: %v", err)
	}
	found := false
	for _, wt := range worktrees {
		if wt.Branch == "forge/wt-int" {
			found = true
		}
	}
	if !found {
		t.Fatalf("forge/wt-int not in worktree list: %+v", worktrees)
	}

	if err := client.WorktreeRemove(repoDir, wtPath); err != nil {
		t.Fatalf("WorktreeRemove: %v", err)
	}
	if _, err := os.Stat(wtPath); !os.IsNotExist(err) {
		t.Fatalf("worktree dir still present after remove")
	}
}

func TestBranchMergedAndIsClean_RealGit(t *testing.T) {
	repoDir, base := newTempRepo(t)
	client := New()

	wtPath := filepath.Join(repoDir, ".forge", "worktrees", "wt2")
	if err := client.WorktreeAdd(repoDir, wtPath, "feature/wt2", base); err != nil {
		t.Fatalf("WorktreeAdd: %v", err)
	}

	// Fresh worktree is clean and not yet merged-divergent (no new commits == merged).
	if clean, err := client.IsClean(wtPath); err != nil || !clean {
		t.Fatalf("IsClean(fresh) = %v, %v; want true", clean, err)
	}

	// Add an uncommitted file → dirty.
	if err := os.WriteFile(filepath.Join(wtPath, "work.txt"), []byte("wip\n"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	if clean, err := client.IsClean(wtPath); err != nil || clean {
		t.Fatalf("IsClean(dirty) = %v, %v; want false", clean, err)
	}

	// Commit it on the feature branch → not merged into base yet.
	commit := func(dir string, args ...string) {
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
	}
	commit(wtPath, "add", "-A")
	commit(wtPath, "commit", "-m", "wip")

	if merged, err := client.BranchMerged(repoDir, "feature/wt2", base); err != nil || merged {
		t.Fatalf("BranchMerged(before) = %v, %v; want false", merged, err)
	}

	// Merge the feature branch into base → now merged.
	commit(repoDir, "merge", "--no-ff", "feature/wt2", "-m", "merge wt2")
	if merged, err := client.BranchMerged(repoDir, "feature/wt2", base); err != nil || !merged {
		t.Fatalf("BranchMerged(after) = %v, %v; want true", merged, err)
	}
}
