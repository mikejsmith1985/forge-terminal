// Unit tests for the git worktree/branch wrapper (specs/011, T003). These run
// against a fake Runner — no real git, no disk — so they stay well under the
// 10 ms unit budget (Constitution Article V).
package git

import (
	"errors"
	"path/filepath"
	"strings"
	"testing"
)

// fakeRunner records every git invocation and returns canned stdout/err keyed
// by the space-joined args, so a test can both assert the command issued and
// drive the parser with controlled output.
type fakeRunner struct {
	calls   [][]string
	outputs map[string]string
	errs    map[string]error
}

func newFakeRunner() *fakeRunner {
	return &fakeRunner{outputs: map[string]string{}, errs: map[string]error{}}
}

func (f *fakeRunner) Run(_ string, args ...string) (string, error) {
	f.calls = append(f.calls, args)
	key := strings.Join(args, " ")
	if err, ok := f.errs[key]; ok {
		return "", err
	}
	return f.outputs[key], nil
}

func (f *fakeRunner) lastCall() string {
	if len(f.calls) == 0 {
		return ""
	}
	return strings.Join(f.calls[len(f.calls)-1], " ")
}

func (f *fakeRunner) called(joined string) bool {
	for _, call := range f.calls {
		if strings.Join(call, " ") == joined {
			return true
		}
	}
	return false
}

func TestGitCommonDirAndToplevel(t *testing.T) {
	// Absolute output (linked-worktree case): git already returns an absolute path;
	// GitCommonDir must pass it through unchanged (after filepath.Clean).
	fakeAbs := newFakeRunner()
	fakeAbs.outputs["rev-parse --git-common-dir"] = "C:/repo/.git"
	fakeAbs.outputs["rev-parse --show-toplevel"] = "C:/repo"
	clientAbs := NewWithRunner(fakeAbs)

	wantAbs := filepath.Clean("C:/repo/.git")
	if got, err := clientAbs.GitCommonDir("C:/repo"); err != nil || got != wantAbs {
		t.Fatalf("GitCommonDir(abs) = %q, %v; want %q, nil", got, err, wantAbs)
	}
	if got, err := clientAbs.Toplevel("C:/repo"); err != nil || got != "C:/repo" {
		t.Fatalf("Toplevel = %q, %v; want C:/repo, nil", got, err)
	}

	// Relative output (main-checkout case): git returns ".git" — GitCommonDir must
	// join with dir so two sessions in different repos are never treated as the same.
	fakeRel := newFakeRunner()
	fakeRel.outputs["rev-parse --git-common-dir"] = ".git"
	clientRel := NewWithRunner(fakeRel)

	wantRel := filepath.Clean("C:/repo/.git")
	if got, err := clientRel.GitCommonDir("C:/repo"); err != nil || got != wantRel {
		t.Fatalf("GitCommonDir(rel) = %q, %v; want %q, nil", got, err, wantRel)
	}
}

func TestCurrentBranch(t *testing.T) {
	fake := newFakeRunner()
	fake.outputs["rev-parse --abbrev-ref HEAD"] = "main"
	client := NewWithRunner(fake)

	if got, err := client.CurrentBranch("C:/repo"); err != nil || got != "main" {
		t.Fatalf("CurrentBranch = %q, %v; want main, nil", got, err)
	}
}

func TestIsGitRepo(t *testing.T) {
	fake := newFakeRunner()
	fake.outputs["rev-parse --is-inside-work-tree"] = "true"
	client := NewWithRunner(fake)
	if !client.IsGitRepo("C:/repo") {
		t.Fatal("IsGitRepo = false; want true")
	}

	fake2 := newFakeRunner()
	fake2.errs["rev-parse --is-inside-work-tree"] = errors.New("not a repo")
	if NewWithRunner(fake2).IsGitRepo("C:/not-repo") {
		t.Fatal("IsGitRepo = true for non-repo; want false")
	}
}

func TestWorktreeAddIssuesCorrectCommand(t *testing.T) {
	fake := newFakeRunner()
	client := NewWithRunner(fake)

	if err := client.WorktreeAdd("C:/repo", "C:/repo/.forge/worktrees/wt1", "forge/wt-abc", "main"); err != nil {
		t.Fatalf("WorktreeAdd error: %v", err)
	}
	want := "worktree add C:/repo/.forge/worktrees/wt1 -b forge/wt-abc main"
	if !fake.called(want) {
		t.Fatalf("WorktreeAdd issued %q; want %q", fake.lastCall(), want)
	}
}

func TestWorktreeListParsesPorcelain(t *testing.T) {
	fake := newFakeRunner()
	fake.outputs["worktree list --porcelain"] = strings.Join([]string{
		"worktree C:/repo",
		"HEAD 1111111111111111111111111111111111111111",
		"branch refs/heads/main",
		"",
		"worktree C:/repo/.forge/worktrees/wt1",
		"HEAD 2222222222222222222222222222222222222222",
		"branch refs/heads/feature/011-x",
		"",
	}, "\n")
	client := NewWithRunner(fake)

	worktrees, err := client.WorktreeList("C:/repo")
	if err != nil {
		t.Fatalf("WorktreeList error: %v", err)
	}
	if len(worktrees) != 2 {
		t.Fatalf("got %d worktrees; want 2", len(worktrees))
	}
	if worktrees[1].Path != "C:/repo/.forge/worktrees/wt1" || worktrees[1].Branch != "feature/011-x" {
		t.Fatalf("second worktree = %+v; want path .../wt1 branch feature/011-x", worktrees[1])
	}
}

func TestWorktreeRemove(t *testing.T) {
	fake := newFakeRunner()
	client := NewWithRunner(fake)
	if err := client.WorktreeRemove("C:/repo", "C:/repo/.forge/worktrees/wt1"); err != nil {
		t.Fatalf("WorktreeRemove error: %v", err)
	}
	if !fake.called("worktree remove C:/repo/.forge/worktrees/wt1") {
		t.Fatalf("WorktreeRemove issued %q", fake.lastCall())
	}
}

func TestBranchMerged(t *testing.T) {
	fake := newFakeRunner()
	// `git branch --merged main` markers: "* " = current, "+ " = checked out in a
	// linked worktree (the feature branch's case). Both must be stripped.
	fake.outputs["branch --merged main"] = "* main\n  feature/done\n+ feature/in-worktree\n"
	client := NewWithRunner(fake)

	if merged, err := client.BranchMerged("C:/repo", "feature/done", "main"); err != nil || !merged {
		t.Fatalf("BranchMerged(feature/done) = %v, %v; want true, nil", merged, err)
	}
	if merged, err := client.BranchMerged("C:/repo", "feature/in-worktree", "main"); err != nil || !merged {
		t.Fatalf("BranchMerged(+worktree branch) = %v, %v; want true, nil", merged, err)
	}
	if merged, err := client.BranchMerged("C:/repo", "feature/wip", "main"); err != nil || merged {
		t.Fatalf("BranchMerged(feature/wip) = %v, %v; want false, nil", merged, err)
	}
}

func TestIsClean(t *testing.T) {
	clean := newFakeRunner()
	clean.outputs["status --porcelain"] = ""
	if ok, err := NewWithRunner(clean).IsClean("C:/wt"); err != nil || !ok {
		t.Fatalf("IsClean(empty) = %v, %v; want true, nil", ok, err)
	}

	dirty := newFakeRunner()
	dirty.outputs["status --porcelain"] = " M file.go"
	if ok, err := NewWithRunner(dirty).IsClean("C:/wt"); err != nil || ok {
		t.Fatalf("IsClean(dirty) = %v, %v; want false, nil", ok, err)
	}
}

func TestBranchRenameAndDelete(t *testing.T) {
	fake := newFakeRunner()
	client := NewWithRunner(fake)

	if err := client.BranchRename("C:/repo", "forge/wt-abc", "feature/011-x"); err != nil {
		t.Fatalf("BranchRename error: %v", err)
	}
	if !fake.called("branch -m forge/wt-abc feature/011-x") {
		t.Fatalf("BranchRename issued %q", fake.lastCall())
	}

	if err := client.BranchDelete("C:/repo", "feature/011-x"); err != nil {
		t.Fatalf("BranchDelete error: %v", err)
	}
	if !fake.called("branch -d feature/011-x") {
		t.Fatalf("BranchDelete issued %q", fake.lastCall())
	}
}

// TestMainCheckout proves the fix for the recursive-nesting bug (specs/012, US1):
// the main checkout MUST be resolved from `git worktree list --porcelain` (whose
// first entry is always the main worktree), NOT from `rev-parse --show-toplevel`
// (which returns a linked worktree's OWN root when run from inside one, anchoring
// new worktrees under it and producing .forge/worktrees/X/.forge/worktrees/Y).
func TestMainCheckout(t *testing.T) {
	porcelain := strings.Join([]string{
		"worktree C:/repo",
		"HEAD 1111111111111111111111111111111111111111",
		"branch refs/heads/main",
		"",
		"worktree C:/repo/.forge/worktrees/wt1",
		"HEAD 2222222222222222222222222222222222222222",
		"branch refs/heads/feature/x",
		"",
	}, "\n")

	// Queried from INSIDE the linked worktree, MainCheckout must still return the
	// main checkout (the first porcelain entry), never the worktree's own path.
	fromWorktree := newFakeRunner()
	fromWorktree.outputs["worktree list --porcelain"] = porcelain
	if got, err := NewWithRunner(fromWorktree).MainCheckout("C:/repo/.forge/worktrees/wt1"); err != nil || got != "C:/repo" {
		t.Fatalf("MainCheckout(from worktree) = %q, %v; want C:/repo, nil", got, err)
	}

	// An empty/unknown list yields an empty result (caller falls back), not a crash.
	empty := newFakeRunner()
	empty.outputs["worktree list --porcelain"] = ""
	if got, err := NewWithRunner(empty).MainCheckout("C:/repo"); err != nil || got != "" {
		t.Fatalf("MainCheckout(empty) = %q, %v; want \"\", nil", got, err)
	}
}
