// Unit tests for the durable session→worktree recovery store (specs/013 US2). The store dir is
// redirected to a temp dir so these never touch the real ~/.forge/sdd. <10 ms, no git, no network.
package main

import (
	"os"
	"path/filepath"
	"testing"
)

// withTempBindingStore points the recovery store at a throwaway dir for one test.
func withTempBindingStore(t *testing.T) {
	t.Helper()
	prev := worktreeBindingStoreDir
	dir := t.TempDir()
	worktreeBindingStoreDir = func() string { return dir }
	t.Cleanup(func() { worktreeBindingStoreDir = prev })
}

func TestWorktreeBindingStore_SaveLookupEvict(t *testing.T) {
	withTempBindingStore(t)

	if _, ok := lookupWorktreeBinding("s1"); ok {
		t.Fatal("a fresh store must have no record for s1")
	}

	want := worktreeBindingRecord{WorktreePath: "C:/repo/.forge/worktrees/s1", Branch: "feature/a", BaseBranch: "main", MainRepoRoot: "C:/repo"}
	saveWorktreeBinding("s1", want)

	got, ok := lookupWorktreeBinding("s1")
	if !ok || got != want {
		t.Fatalf("lookup after save = %+v, %v; want %+v, true", got, ok, want)
	}

	// A second session is independent.
	saveWorktreeBinding("s2", worktreeBindingRecord{WorktreePath: "C:/repo/.forge/worktrees/s2"})
	if _, ok := lookupWorktreeBinding("s1"); !ok {
		t.Error("saving s2 must not disturb s1")
	}

	evictWorktreeBinding("s1")
	if _, ok := lookupWorktreeBinding("s1"); ok {
		t.Error("evict must remove the record")
	}
	if _, ok := lookupWorktreeBinding("s2"); !ok {
		t.Error("evicting s1 must not remove s2")
	}
}

func TestWorktreeBindingStore_MissingFileIsEmpty(t *testing.T) {
	withTempBindingStore(t)
	// No file written yet — loads empty, never errors (fail-safe to recovery).
	if records := loadWorktreeBindings(); len(records) != 0 {
		t.Errorf("missing store file = %+v, want empty map", records)
	}
}

func TestWorktreeBindingStore_CorruptFileIsEmpty(t *testing.T) {
	withTempBindingStore(t)
	if err := os.MkdirAll(worktreeBindingStoreDir(), 0o755); err != nil {
		t.Fatalf("mk store dir: %v", err)
	}
	if err := os.WriteFile(worktreeBindingPath(), []byte("{not valid json"), 0o644); err != nil {
		t.Fatalf("write corrupt: %v", err)
	}
	// Corrupt content must load as empty, never panic or error (specs/013 fail-safe).
	if records := loadWorktreeBindings(); len(records) != 0 {
		t.Errorf("corrupt store file = %+v, want empty map", records)
	}
	// And the path must be inside the redirected temp dir, proving isolation from the real store.
	if filepath.Dir(worktreeBindingPath()) != worktreeBindingStoreDir() {
		t.Errorf("store path %q not under redirected dir %q", worktreeBindingPath(), worktreeBindingStoreDir())
	}
}
