//go:build integration

// Integration tests for worktree provisioning (specs/011, T007/T030). These drive
// the REAL git binary through resolveSddWorkspace against a throwaway repo, proving
// a concurrent session gets an on-disk worktree while the main checkout is untouched
// and never shows the worktree in its status (FR-002/FR-008/FR-016).
// Run with: go test -tags integration ./cmd/forge/...
package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func newWorktreeTestRepo(t *testing.T) string {
	t.Helper()
	repoDir := t.TempDir()
	run := func(args ...string) {
		cmd := exec.Command("git", args...)
		cmd.Dir = repoDir
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
	}
	run("init")
	run("config", "user.email", "t@example.com")
	run("config", "user.name", "T")
	// .forge/ is gitignored in real repos; mirror that so FR-016 can be asserted.
	if err := os.WriteFile(filepath.Join(repoDir, ".gitignore"), []byte(".forge/\n"), 0o644); err != nil {
		t.Fatalf("gitignore: %v", err)
	}
	if err := os.WriteFile(filepath.Join(repoDir, "app.txt"), []byte("v1\n"), 0o644); err != nil {
		t.Fatalf("seed: %v", err)
	}
	run("add", "-A")
	run("commit", "-m", "seed")
	return repoDir
}

// withTempBindingStoreDir redirects the durable recovery store to a throwaway dir so an
// integration test never reads or writes the real ~/.forge/sdd (specs/013).
func withTempBindingStoreDir(t *testing.T) {
	t.Helper()
	prev := worktreeBindingStoreDir
	dir := t.TempDir()
	worktreeBindingStoreDir = func() string { return dir }
	t.Cleanup(func() { worktreeBindingStoreDir = prev })
}

// TestResolveWorkspace_ConcurrentBindDoesNotProvision_RealGit is the recovery-first inversion
// (specs/013 US1/C5) against real git: a concurrent bind creates ZERO worktrees on disk.
func TestResolveWorkspace_ConcurrentBindDoesNotProvision_RealGit(t *testing.T) {
	withTempBindingStoreDir(t)
	repoDir := newWorktreeTestRepo(t)

	commonDir, err := sddGitClient.GitCommonDir(repoDir)
	if err != nil {
		t.Fatalf("GitCommonDir: %v", err)
	}
	before, _ := sddGitClient.WorktreeList(repoDir)
	// A sibling pipeline already owns this repo — the OLD behavior would provision here.
	sddPipelines.Store("wt-int-owner", &sddPipeline{gitCommonDir: commonDir})
	t.Cleanup(func() { sddPipelines.Delete("wt-int-owner") })

	effectiveRepoRoot, binding := resolveSddWorkspace("wt-int-second", repoDir)

	if binding.isIsolated {
		t.Fatal("a concurrent bind must STAY on the main checkout — never auto-provision (C5)")
	}
	if effectiveRepoRoot != repoDir {
		t.Fatalf("effective repoRoot %q != main checkout %q", effectiveRepoRoot, repoDir)
	}
	after, _ := sddGitClient.WorktreeList(repoDir)
	if len(after) != len(before) {
		t.Fatalf("a bind created a worktree (before=%d after=%d) — directories must be unchanged", len(before), len(after))
	}
}

// TestProvisionWorktreeOnRequest_RealGit proves the explicit-consent path (specs/013 US3/C7)
// against real git: exactly ONE un-nested worktree is created and a recovery record persisted.
func TestProvisionWorktreeOnRequest_RealGit(t *testing.T) {
	withTempBindingStoreDir(t)
	repoDir := newWorktreeTestRepo(t)
	before, _ := sddGitClient.WorktreeList(repoDir)

	binding, ok := provisionWorktreeOnRequest("wt-int-explicit", repoDir)
	if !ok || !binding.isIsolated {
		t.Fatalf("explicit request must isolate: ok=%v isolated=%v", ok, binding.isIsolated)
	}
	if _, statErr := os.Stat(binding.worktreePath); statErr != nil {
		t.Fatalf("worktree dir missing on disk: %v", statErr)
	}
	after, _ := sddGitClient.WorktreeList(repoDir)
	if len(after) != len(before)+1 {
		t.Fatalf("explicit request created %d worktrees, want exactly 1 (before=%d after=%d)", len(after)-len(before), len(before), len(after))
	}
	if isForgeWorktreePath(binding.mainRepoRoot) {
		t.Fatalf("worktree anchored under another worktree: %q (nesting)", binding.mainRepoRoot)
	}
	if _, recorded := lookupWorktreeBinding("wt-int-explicit"); !recorded {
		t.Error("explicit provisioning must persist a durable recovery record")
	}
	// FR-008: the main checkout stays clean — provisioning never dirties the tracked tree.
	if clean, err := sddGitClient.IsClean(repoDir); err != nil || !clean {
		out, _ := statusPorcelain(repoDir)
		t.Fatalf("main checkout not clean after provisioning (clean=%v err=%v):\n%s", clean, err, out)
	}

	t.Cleanup(func() { _ = sddGitClient.WorktreeRemove(repoDir, binding.worktreePath) })
}

func TestSafeCleanup_RealGit_RemovesMergedCleanRetainsDirty(t *testing.T) {
	repoDir := newWorktreeTestRepo(t)
	base, _ := sddGitClient.CurrentBranch(repoDir)

	// A fresh worktree (no new commits) is merged + clean → must be removed (FR-011).
	cleanPath := filepath.Join(repoDir, ".forge", "worktrees", "clean")
	if err := sddGitClient.WorktreeAdd(repoDir, cleanPath, "feature/clean", base); err != nil {
		t.Fatalf("add clean: %v", err)
	}
	cleanPipe := &sddPipeline{isIsolated: true, worktreePath: cleanPath, mainRepoRoot: repoDir, branch: "feature/clean", baseBranch: base}
	if removed, warning := safeCleanupWorktree(cleanPipe); !removed {
		t.Fatalf("merged+clean worktree not removed (warning=%q)", warning)
	}
	if _, err := os.Stat(cleanPath); !os.IsNotExist(err) {
		t.Fatalf("clean worktree dir still on disk after cleanup")
	}

	// A worktree with uncommitted work must be retained (FR-012).
	dirtyPath := filepath.Join(repoDir, ".forge", "worktrees", "dirty")
	if err := sddGitClient.WorktreeAdd(repoDir, dirtyPath, "feature/dirty", base); err != nil {
		t.Fatalf("add dirty: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dirtyPath, "wip.txt"), []byte("wip\n"), 0o644); err != nil {
		t.Fatalf("write wip: %v", err)
	}
	dirtyPipe := &sddPipeline{isIsolated: true, worktreePath: dirtyPath, mainRepoRoot: repoDir, branch: "feature/dirty", baseBranch: base}
	if removed, warning := safeCleanupWorktree(dirtyPipe); removed || warning == "" {
		t.Fatalf("dirty worktree removed=%v warning=%q; want retained+warn", removed, warning)
	}
	if _, err := os.Stat(dirtyPath); err != nil {
		t.Fatalf("dirty worktree must be retained: %v", err)
	}

	t.Cleanup(func() { _ = sddGitClient.WorktreeRemove(repoDir, dirtyPath) })
}

func TestRestartDiscovery_RealGit(t *testing.T) {
	repoDir := newWorktreeTestRepo(t)
	base, _ := sddGitClient.CurrentBranch(repoDir)
	wtPath := filepath.Join(repoDir, ".forge", "worktrees", "survivor")
	if err := sddGitClient.WorktreeAdd(repoDir, wtPath, "feature/survivor", base); err != nil {
		t.Fatalf("add: %v", err)
	}

	// Simulate a restart: no in-memory binding exists, yet git's own registry still knows
	// the worktree, so it is re-discoverable (FR-013).
	worktrees, err := sddGitClient.WorktreeList(repoDir)
	if err != nil {
		t.Fatalf("WorktreeList: %v", err)
	}
	found := false
	for _, worktree := range worktrees {
		if isForgeWorktreePath(worktree.Path) && worktree.Branch == "feature/survivor" {
			found = true
		}
	}
	if !found {
		t.Fatalf("survivor worktree not re-discovered from git registry: %+v", worktrees)
	}

	t.Cleanup(func() { _ = sddGitClient.WorktreeRemove(repoDir, wtPath) })
}

// TestNoNesting_RealGit proves the specs/012 US1 fix against the real git binary:
// (1) MainCheckout is stable regardless of which worktree it is queried from and
// never points inside .forge/worktrees/; (2) re-binding a session that is already
// inside a worktree re-attaches to it and provisions NOTHING, so the recursive
// .forge/worktrees/X/.forge/worktrees/Y nesting from the captured bug cannot occur.
func TestNoNesting_RealGit(t *testing.T) {
	repoDir := newWorktreeTestRepo(t)
	base, _ := sddGitClient.CurrentBranch(repoDir)

	wtPath := filepath.Join(repoDir, ".forge", "worktrees", "wt1")
	if err := sddGitClient.WorktreeAdd(repoDir, wtPath, "feature/wt1", base); err != nil {
		t.Fatalf("WorktreeAdd: %v", err)
	}
	t.Cleanup(func() { _ = sddGitClient.WorktreeRemove(repoDir, wtPath) })

	// (1) MainCheckout is identical whether queried from the main repo or from inside
	// the linked worktree, and never resolves to a path under .forge/worktrees/ — unlike
	// --show-toplevel, which would return wtPath itself when queried from wtPath.
	mainFromRepo, err := sddGitClient.MainCheckout(repoDir)
	if err != nil || mainFromRepo == "" {
		t.Fatalf("MainCheckout(repo) = %q, %v; want the main checkout", mainFromRepo, err)
	}
	mainFromWorktree, err := sddGitClient.MainCheckout(wtPath)
	if err != nil || mainFromWorktree != mainFromRepo {
		t.Fatalf("MainCheckout(worktree) = %q, %v; want it stable at %q regardless of query dir", mainFromWorktree, err, mainFromRepo)
	}
	if isForgeWorktreePath(mainFromWorktree) {
		t.Fatalf("MainCheckout returned a path inside .forge/worktrees/: %q (would re-nest)", mainFromWorktree)
	}

	// (2) Re-binding a session whose directory IS the worktree re-attaches; no new
	// worktree is provisioned and no nested .forge/worktrees/ appears inside it.
	before, _ := sddGitClient.WorktreeList(repoDir)
	effRoot, binding := resolveSddWorkspace("wt-reattach", wtPath)
	if !binding.isIsolated || effRoot != wtPath {
		t.Fatalf("re-attach: isolated=%v effRoot=%q; want isolated=true, effRoot=%q", binding.isIsolated, effRoot, wtPath)
	}
	after, _ := sddGitClient.WorktreeList(repoDir)
	if len(after) != len(before) {
		t.Fatalf("re-attach provisioned a new worktree (before=%d after=%d) — nesting bug not prevented", len(before), len(after))
	}
	if _, statErr := os.Stat(filepath.Join(wtPath, ".forge", "worktrees")); !os.IsNotExist(statErr) {
		t.Fatalf("a nested .forge/worktrees/ was created inside the worktree at %q", wtPath)
	}
}

func statusPorcelain(dir string) (string, error) {
	cmd := exec.Command("git", "status", "--porcelain")
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	return string(out), err
}

// TestReportScoping_TwoWorktreesNoCrossAttribution proves each pipeline's report
// (built on captureWorkTree/diffWorkTrees over pipeline.repoRoot) lists ONLY its own
// worktree's files — the US2/FR-006 guarantee — using two real worktrees.
func TestReportScoping_TwoWorktreesNoCrossAttribution(t *testing.T) {
	repoDir := newWorktreeTestRepo(t)
	base, err := sddGitClient.CurrentBranch(repoDir)
	if err != nil {
		t.Fatalf("CurrentBranch: %v", err)
	}

	pathA := filepath.Join(repoDir, ".forge", "worktrees", "wtA")
	pathB := filepath.Join(repoDir, ".forge", "worktrees", "wtB")
	if err := sddGitClient.WorktreeAdd(repoDir, pathA, "feature/a", base); err != nil {
		t.Fatalf("WorktreeAdd A: %v", err)
	}
	if err := sddGitClient.WorktreeAdd(repoDir, pathB, "feature/b", base); err != nil {
		t.Fatalf("WorktreeAdd B: %v", err)
	}

	baselineA := captureWorkTree(pathA)
	baselineB := captureWorkTree(pathB)

	if err := os.WriteFile(filepath.Join(pathA, "only_a.txt"), []byte("a\n"), 0o644); err != nil {
		t.Fatalf("write A: %v", err)
	}
	if err := os.WriteFile(filepath.Join(pathB, "only_b.txt"), []byte("b\n"), 0o644); err != nil {
		t.Fatalf("write B: %v", err)
	}

	filesA := diffWorkTrees(pathA, baselineA, captureWorkTree(pathA))
	filesB := diffWorkTrees(pathB, baselineB, captureWorkTree(pathB))

	assertExactlyOneFile(t, "A", filesA, "only_a.txt")
	assertExactlyOneFile(t, "B", filesB, "only_b.txt")

	t.Cleanup(func() {
		_ = sddGitClient.WorktreeRemove(repoDir, pathA)
		_ = sddGitClient.WorktreeRemove(repoDir, pathB)
	})
}

func assertExactlyOneFile(t *testing.T, label string, files []sddFileChange, want string) {
	t.Helper()
	if len(files) != 1 {
		t.Fatalf("pipeline %s report listed %d files, want exactly 1 (%+v)", label, len(files), files)
	}
	if filepath.Base(files[0].Path) != want {
		t.Fatalf("pipeline %s report listed %q, want only %q (no cross-attribution)", label, files[0].Path, want)
	}
}
