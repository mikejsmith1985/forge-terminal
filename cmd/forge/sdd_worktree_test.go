// Unit tests for worktree concurrency detection + provisioning (specs/011, T006).
// These inject a fake git Runner so the decision logic is exercised with no real
// git and no disk (Constitution Article V, <10 ms). termHandler is nil, so the
// shell-retarget is a safe no-op here.
package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	gitwt "github.com/mikejsmith1985/forge-terminal/internal/git"
	"github.com/mikejsmith1985/forge-terminal/internal/sdd"
)

// errWorktreeTest is a sentinel git failure used to drive degrade-safe paths.
var errWorktreeTest = errors.New("simulated git failure")

// fakeWorktreeGitRunner returns canned stdout/err keyed by the space-joined args
// and records every call so provisioning commands can be asserted.
type fakeWorktreeGitRunner struct {
	outputs      map[string]string
	errs         map[string]error
	failPrefixes []string // any call whose joined args start with one of these returns an error
	calls        []string
}

func (f *fakeWorktreeGitRunner) Run(_ string, args ...string) (string, error) {
	key := strings.Join(args, " ")
	f.calls = append(f.calls, key)
	if err, ok := f.errs[key]; ok {
		return "", err
	}
	for _, prefix := range f.failPrefixes {
		if strings.HasPrefix(key, prefix) {
			return "", errWorktreeTest
		}
	}
	return f.outputs[key], nil
}

func (f *fakeWorktreeGitRunner) called(prefix string) bool {
	for _, call := range f.calls {
		if strings.HasPrefix(call, prefix) {
			return true
		}
	}
	return false
}

// withFakeGit swaps in a fake git client for the duration of a test.
func withFakeGit(t *testing.T, fake *fakeWorktreeGitRunner) {
	t.Helper()
	prev := sddGitClient
	sddGitClient = gitwt.NewWithRunner(fake)
	t.Cleanup(func() { sddGitClient = prev })
}

func gitRepoFake() *fakeWorktreeGitRunner {
	return &fakeWorktreeGitRunner{
		outputs: map[string]string{
			"rev-parse --is-inside-work-tree": "true",
			"rev-parse --git-common-dir":      "C:/repo/.git",
			"rev-parse --show-toplevel":       "C:/repo",
			"rev-parse --abbrev-ref HEAD":     "main",
		},
		errs: map[string]error{},
	}
}

func TestSddHasConcurrentPipeline(t *testing.T) {
	sddPipelines.Store("wt-other", &sddPipeline{gitCommonDir: "C:/repo/.git"})
	t.Cleanup(func() { sddPipelines.Delete("wt-other") })

	if !sddHasConcurrentPipeline("wt-self", "C:/repo/.git") {
		t.Error("expected concurrency with a sibling sharing the common dir")
	}
	if sddHasConcurrentPipeline("wt-self", "C:/other/.git") {
		t.Error("a different common dir must not count as concurrent")
	}
	if sddHasConcurrentPipeline("wt-other", "C:/repo/.git") {
		t.Error("a session must not detect concurrency with itself")
	}
}

func TestResolveWorkspace_FirstPipelineKeepsMainCheckout(t *testing.T) {
	withFakeGit(t, gitRepoFake())

	repoRoot, binding := resolveSddWorkspace("wt-first", "C:/repo")

	if binding.isIsolated {
		t.Error("first pipeline must NOT be isolated (FR-005)")
	}
	if repoRoot != "C:/repo" {
		t.Errorf("repoRoot = %q, want the main checkout C:/repo", repoRoot)
	}
	if binding.gitCommonDir != "C:/repo/.git" {
		t.Errorf("gitCommonDir = %q, want it recorded for later concurrency checks", binding.gitCommonDir)
	}
}

func TestResolveWorkspace_ConcurrentSessionGetsWorktree(t *testing.T) {
	fake := gitRepoFake()
	withFakeGit(t, fake)
	// An existing pipeline already owns this repo's common dir → the next bind is concurrent.
	sddPipelines.Store("wt-owner", &sddPipeline{gitCommonDir: "C:/repo/.git"})
	t.Cleanup(func() { sddPipelines.Delete("wt-owner") })

	repoRoot, binding := resolveSddWorkspace("wt-second", "C:/repo")

	if !binding.isIsolated {
		t.Fatal("a concurrent same-repo session must be isolated (FR-001/FR-002)")
	}
	if !strings.Contains(filepath.ToSlash(binding.worktreePath), ".forge/worktrees/") {
		t.Errorf("worktreePath = %q, want it under .forge/worktrees/ (FR-016)", binding.worktreePath)
	}
	if binding.branch != "forge/wt-wt-second" {
		t.Errorf("branch = %q, want provisional forge/wt-<token>", binding.branch)
	}
	if binding.baseBranch != "main" {
		t.Errorf("baseBranch = %q, want the captured base 'main'", binding.baseBranch)
	}
	if repoRoot != binding.worktreePath {
		t.Errorf("effective repoRoot = %q, want the worktree path %q", repoRoot, binding.worktreePath)
	}
	if !fake.called("worktree add") {
		t.Error("provisioning must issue `git worktree add`")
	}
}

func TestResolveWorkspace_DegradesSafelyWhenProvisioningFails(t *testing.T) {
	fake := gitRepoFake()
	fake.failPrefixes = []string{"worktree add"} // platform-independent: any worktree add fails.
	withFakeGit(t, fake)
	sddPipelines.Store("wt-owner2", &sddPipeline{gitCommonDir: "C:/repo/.git"})
	t.Cleanup(func() { sddPipelines.Delete("wt-owner2") })

	repoRoot, binding := resolveSddWorkspace("wt-second", "C:/repo")

	if binding.isIsolated {
		t.Error("a failed `worktree add` must degrade to a non-isolated pipeline (FR-014)")
	}
	if repoRoot != "C:/repo" {
		t.Errorf("on degrade, repoRoot = %q, want the original main checkout", repoRoot)
	}
}

func TestResolveWorkspace_NonGitDirIsNotIsolated(t *testing.T) {
	fake := &fakeWorktreeGitRunner{
		outputs: map[string]string{},
		errs:    map[string]error{"rev-parse --is-inside-work-tree": errWorktreeTest},
	}
	withFakeGit(t, fake)
	sddPipelines.Store("wt-owner3", &sddPipeline{gitCommonDir: "C:/repo/.git"})
	t.Cleanup(func() { sddPipelines.Delete("wt-owner3") })

	repoRoot, binding := resolveSddWorkspace("wt-second", "C:/not-a-repo")
	if binding.isIsolated {
		t.Error("a non-git directory must run a single, non-isolated pipeline")
	}
	if repoRoot != "C:/not-a-repo" {
		t.Errorf("repoRoot = %q, want the original path", repoRoot)
	}
}

func TestReconcileWorktreeBranch_PromotesProvisional(t *testing.T) {
	fake := gitRepoFake()
	withFakeGit(t, fake)
	pipeline := &sddPipeline{isIsolated: true, worktreePath: "C:/repo/.forge/worktrees/wt1", branch: "forge/wt-wt1"}

	reconcileWorktreeBranch(pipeline, "C:/repo/.forge/worktrees/wt1/specs/011-worktree-concurrency")

	if pipeline.branch != "feature/011-worktree-concurrency" {
		t.Errorf("branch = %q, want promoted to feature/<spec-dir>", pipeline.branch)
	}
	if !fake.called("branch -m forge/wt-wt1 feature/011-worktree-concurrency") {
		t.Error("reconcile must issue `git branch -m` to rename the provisional branch")
	}
}

func TestReconcileWorktreeBranch_NoOpForNonIsolated(t *testing.T) {
	fake := gitRepoFake()
	withFakeGit(t, fake)
	pipeline := &sddPipeline{isIsolated: false, branch: ""}

	reconcileWorktreeBranch(pipeline, "C:/repo/specs/011-x")

	if fake.called("branch -m") {
		t.Error("a non-isolated pipeline must never rename a branch")
	}
}

func isolatedCleanupPipeline() *sddPipeline {
	return &sddPipeline{
		isIsolated:   true,
		worktreePath: "C:/repo/.forge/worktrees/wt1",
		mainRepoRoot: "C:/repo",
		branch:       "feature/wt1",
		baseBranch:   "main",
	}
}

func TestSafeCleanup_RemovesWhenMergedAndClean(t *testing.T) {
	fake := &fakeWorktreeGitRunner{outputs: map[string]string{
		"status --porcelain":   "",                // clean tree
		"branch --merged main": "  feature/wt1\n", // merged into base
	}, errs: map[string]error{}}
	withFakeGit(t, fake)

	removed, warning := safeCleanupWorktree(isolatedCleanupPipeline())
	if !removed || warning != "" {
		t.Fatalf("merged+clean: removed=%v warning=%q; want removed,no-warning (FR-011)", removed, warning)
	}
	if !fake.called("worktree remove") {
		t.Error("a safe cleanup must issue `git worktree remove`")
	}
}

func TestSafeCleanup_RetainsWhenDirty(t *testing.T) {
	fake := &fakeWorktreeGitRunner{outputs: map[string]string{
		"status --porcelain":   " M work.go", // dirty
		"branch --merged main": "  feature/wt1\n",
	}, errs: map[string]error{}}
	withFakeGit(t, fake)

	removed, warning := safeCleanupWorktree(isolatedCleanupPipeline())
	if removed || warning == "" {
		t.Fatalf("dirty: removed=%v warning=%q; want retained+warn (FR-012)", removed, warning)
	}
	if fake.called("worktree remove") {
		t.Error("a dirty worktree must NEVER be removed")
	}
}

func TestSafeCleanup_RetainsWhenNotMerged(t *testing.T) {
	fake := &fakeWorktreeGitRunner{outputs: map[string]string{
		"status --porcelain":   "",
		"branch --merged main": "  some-other-branch\n", // wt1 not listed → not merged
	}, errs: map[string]error{}}
	withFakeGit(t, fake)

	removed, warning := safeCleanupWorktree(isolatedCleanupPipeline())
	if removed || warning == "" {
		t.Fatalf("unmerged: removed=%v warning=%q; want retained+warn (FR-012)", removed, warning)
	}
}

func TestSafeCleanup_NoOpForNonIsolated(t *testing.T) {
	withFakeGit(t, gitRepoFake())
	removed, warning := safeCleanupWorktree(&sddPipeline{isIsolated: false})
	if removed || warning != "" {
		t.Errorf("non-isolated: removed=%v warning=%q; want no-op", removed, warning)
	}
}

func TestHandleSddWorktreeClose_RemovesSafeWorktree(t *testing.T) {
	fake := &fakeWorktreeGitRunner{outputs: map[string]string{
		"status --porcelain":   "",
		"branch --merged main": "  feature/close\n",
	}, errs: map[string]error{}}
	withFakeGit(t, fake)
	sddPipelines.Store("wt-close", &sddPipeline{
		isIsolated: true, worktreePath: "C:/repo/.forge/worktrees/close",
		mainRepoRoot: "C:/repo", branch: "feature/close", baseBranch: "main",
	})
	t.Cleanup(func() { sddPipelines.Delete("wt-close") })

	req := httptest.NewRequest(http.MethodPost, "/api/sdd/worktree-close", strings.NewReader(`{"sessionId":"wt-close"}`))
	rec := httptest.NewRecorder()
	handleSddWorktreeClose(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status %d; body=%s", rec.Code, rec.Body.String())
	}
	var resp map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	if resp["removed"] != true {
		t.Errorf("removed = %v, want true for a merged+clean worktree", resp["removed"])
	}
	if _, exists := sddPipelineFor("wt-close"); exists {
		t.Error("a removed worktree's pipeline binding must be dropped")
	}
}

func TestHandleSddStatus_IncludesBinding(t *testing.T) {
	isolated := &sddPipeline{
		orchestrator: sdd.NewOrchestrator(sdd.Options{SessionID: "wt-iso"}),
		repoRoot:     "C:/repo/.forge/worktrees/wt-iso",
		isIsolated:   true,
		worktreePath: "C:/repo/.forge/worktrees/wt-iso",
		branch:       "feature/011-x",
		baseBranch:   "main",
	}
	sddPipelines.Store("wt-iso", isolated)
	main := &sddPipeline{orchestrator: sdd.NewOrchestrator(sdd.Options{SessionID: "wt-main"}), repoRoot: "C:/repo"}
	sddPipelines.Store("wt-main", main)
	t.Cleanup(func() { sddPipelines.Delete("wt-iso"); sddPipelines.Delete("wt-main") })

	bindingFor := func(sessionID string) map[string]any {
		req := httptest.NewRequest(http.MethodGet, "/api/sdd/status?sessionId="+sessionID, nil)
		rec := httptest.NewRecorder()
		handleSddStatus(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("status %d for %s", rec.Code, sessionID)
		}
		var resp map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("decode: %v", err)
		}
		binding, _ := resp["binding"].(map[string]any)
		return binding
	}

	iso := bindingFor("wt-iso")
	if iso["isolated"] != true || iso["branch"] != "feature/011-x" {
		t.Errorf("isolated binding = %v, want isolated:true branch:feature/011-x", iso)
	}
	mainBinding := bindingFor("wt-main")
	if mainBinding["isolated"] != false {
		t.Errorf("main-checkout binding = %v, want isolated:false (no worktree indicator, SC-007)", mainBinding)
	}
}

func TestSanitizeSessionToken(t *testing.T) {
	cases := map[string]string{
		"tab-3-abc123": "tab-3-abc123",
		"tab/weird:id": "tab-weird-id",
		"--edge--":     "edge",
		"":             "session",
	}
	for input, want := range cases {
		if got := sanitizeSessionToken(input); got != want {
			t.Errorf("sanitizeSessionToken(%q) = %q, want %q", input, got, want)
		}
	}
}
