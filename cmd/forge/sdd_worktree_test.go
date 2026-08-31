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
	"os"
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

// withFakeGit swaps in a fake git client for the duration of a test and redirects the durable
// worktree-binding store to a throwaway temp dir, so unit tests never read or write the real
// ~/.forge/sdd recovery file (specs/013).
func withFakeGit(t *testing.T, fake *fakeWorktreeGitRunner) {
	t.Helper()
	prev := sddGitClient
	sddGitClient = gitwt.NewWithRunner(fake)
	prevDir := worktreeBindingStoreDir
	tempDir := t.TempDir()
	worktreeBindingStoreDir = func() string { return tempDir }
	t.Cleanup(func() {
		sddGitClient = prev
		worktreeBindingStoreDir = prevDir
	})
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

// TestSddHasActiveConcurrentPipeline proves the F1 fix: only a sibling running an ACTIVE
// pipeline (a started, not-yet-complete phase) counts — a merely-bound idle tab does not, so
// ordinary tabs are never offered the collision prompt (specs/013 FR-003).
func TestSddHasActiveConcurrentPipeline(t *testing.T) {
	idle := &sddPipeline{gitCommonDir: "C:/repo/.git", orchestrator: sdd.NewOrchestrator(sdd.Options{SessionID: "wt-idle"})}
	sddPipelines.Store("wt-idle", idle)
	t.Cleanup(func() { sddPipelines.Delete("wt-idle") })

	if sddHasActiveConcurrentPipeline("wt-self", "C:/repo/.git") {
		t.Error("a merely-bound IDLE sibling must NOT count as an active collision (F1)")
	}

	active := &sddPipeline{gitCommonDir: "C:/repo/.git", orchestrator: sdd.NewOrchestrator(sdd.Options{SessionID: "wt-active"})}
	active.orchestrator.BindSession("wt-active")
	active.orchestrator.MarkPhaseRunning(sdd.PhaseTable()[0].Name) // a phase is now running.
	sddPipelines.Store("wt-active", active)
	t.Cleanup(func() { sddPipelines.Delete("wt-active") })

	if !sddHasActiveConcurrentPipeline("wt-self", "C:/repo/.git") {
		t.Error("an ACTIVE sibling sharing the common dir must count as a collision")
	}
	if sddHasActiveConcurrentPipeline("wt-self", "C:/other/.git") {
		t.Error("a different common dir must not count as concurrent")
	}
	if sddHasActiveConcurrentPipeline("wt-active", "C:/repo/.git") {
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
	// GitCommonDir normalizes to an absolute path via filepath.Clean, so the expected
	// value must also be Clean'd — on Windows that converts "/" to "\" separators.
	if binding.gitCommonDir != filepath.Clean("C:/repo/.git") {
		t.Errorf("gitCommonDir = %q, want it recorded for later concurrency checks", binding.gitCommonDir)
	}
}

// TestResolveWorkspace_ConcurrentSessionStaysOnMainCheckout is the headline specs/013 inversion:
// a bind NEVER provisions a worktree, even when a sibling pipeline already owns the repo. This is
// the direct fix for "a second tab silently spawns a directory" (FR-001/FR-003, C1).
func TestResolveWorkspace_ConcurrentSessionStaysOnMainCheckout(t *testing.T) {
	fake := gitRepoFake()
	withFakeGit(t, fake)
	// A sibling pipeline already owns this repo's common dir — the OLD code would isolate here.
	sddPipelines.Store("wt-owner", &sddPipeline{gitCommonDir: filepath.Clean("C:/repo/.git")})
	t.Cleanup(func() { sddPipelines.Delete("wt-owner") })

	repoRoot, binding := resolveSddWorkspace("wt-second", "C:/repo")

	if binding.isIsolated {
		t.Fatal("a concurrent same-repo bind must STAY on the main checkout — never auto-provision (FR-001/FR-003)")
	}
	if repoRoot != "C:/repo" {
		t.Errorf("repoRoot = %q, want the main checkout C:/repo (no worktree)", repoRoot)
	}
	if fake.called("worktree add") {
		t.Error("a bind must NEVER issue `git worktree add` — provisioning is explicit-only (C1)")
	}
}

// TestProvisionWorktreeOnRequest_CreatesWorktree proves the explicit-consent path (US3, C7):
// the ONLY way a worktree is created. It anchors under .forge/worktrees/, persists a recovery
// record, and issues `git worktree add`.
func TestProvisionWorktreeOnRequest_CreatesWorktree(t *testing.T) {
	fake := gitRepoFake()
	withFakeGit(t, fake)

	binding, ok := provisionWorktreeOnRequest("wt-explicit", "C:/repo")

	if !ok || !binding.isIsolated {
		t.Fatalf("explicit request must isolate: ok=%v isolated=%v (FR-007)", ok, binding.isIsolated)
	}
	if !strings.Contains(filepath.ToSlash(binding.worktreePath), ".forge/worktrees/") {
		t.Errorf("worktreePath = %q, want under .forge/worktrees/ (FR-008)", binding.worktreePath)
	}
	if binding.branch != "forge/wt-wt-explicit" || binding.baseBranch != "main" {
		t.Errorf("branch=%q base=%q, want provisional forge/wt-<token> off main", binding.branch, binding.baseBranch)
	}
	if !fake.called("worktree add") {
		t.Error("explicit provisioning must issue `git worktree add`")
	}
	if _, recorded := lookupWorktreeBinding("wt-explicit"); !recorded {
		t.Error("explicit provisioning must persist a durable recovery record (US2/FR-012)")
	}
}

// TestProvisionWorktreeOnRequest_DegradesSafelyOnFailure proves FR-011/C8: a git failure leaves
// the tab on the main checkout with NO binding record — never a half-made or nested directory.
func TestProvisionWorktreeOnRequest_DegradesSafelyOnFailure(t *testing.T) {
	fake := gitRepoFake()
	fake.failPrefixes = []string{"worktree add"}
	withFakeGit(t, fake)

	binding, ok := provisionWorktreeOnRequest("wt-fail", "C:/repo")

	if ok || binding.isIsolated {
		t.Errorf("a failed `worktree add` must NOT isolate: ok=%v isolated=%v (FR-011)", ok, binding.isIsolated)
	}
	if _, recorded := lookupWorktreeBinding("wt-fail"); recorded {
		t.Error("a failed provision must NOT persist a recovery record")
	}
}

// TestResolveWorkspace_RecoversFromBindingRecord proves recovery-first (US2, C6): after a
// restart (in-memory map empty) the frontend may report the MAIN checkout, yet the durable
// record re-attaches the session to its worktree — provisioning nothing.
func TestResolveWorkspace_RecoversFromBindingRecord(t *testing.T) {
	fake := gitRepoFake()
	withFakeGit(t, fake)
	wtPath := filepath.Join(t.TempDir(), ".forge", "worktrees", "wt1")
	if err := os.MkdirAll(wtPath, 0o755); err != nil {
		t.Fatalf("mk worktree dir: %v", err)
	}
	saveWorktreeBinding("wt-resume", worktreeBindingRecord{
		WorktreePath: wtPath, Branch: "feature/x", BaseBranch: "main", MainRepoRoot: "C:/repo",
	})

	repoRoot, binding := resolveSddWorkspace("wt-resume", "C:/repo")

	if !binding.isIsolated || repoRoot != wtPath {
		t.Fatalf("recovery: isolated=%v repoRoot=%q; want isolated, repoRoot=%q", binding.isIsolated, repoRoot, wtPath)
	}
	if fake.called("worktree add") {
		t.Error("recovery must re-attach, never provision a new worktree")
	}
}

// TestResolveWorkspace_MissingWorktreeFallsBackWithNotice proves FR-005/C3: when the recorded
// worktree is gone, the session falls back to the main checkout with exactly one notice and the
// stale record is evicted — never recreating or nesting a directory.
func TestResolveWorkspace_MissingWorktreeFallsBackWithNotice(t *testing.T) {
	fake := gitRepoFake()
	fake.outputs["worktree list --porcelain"] = "worktree C:/repo\nbranch refs/heads/main\n\n"
	withFakeGit(t, fake)
	saveWorktreeBinding("wt-gone", worktreeBindingRecord{
		WorktreePath: "C:/repo/.forge/worktrees/gone", Branch: "feature/gone", BaseBranch: "main", MainRepoRoot: "C:/repo",
	})

	repoRoot, binding := resolveSddWorkspace("wt-gone", "C:/repo")

	if binding.isIsolated {
		t.Error("a gone worktree must fall back to the main checkout, not stay isolated (FR-005)")
	}
	if binding.notice == "" {
		t.Error("fallback must carry exactly one notice explaining the worktree is gone (FR-005)")
	}
	if repoRoot != "C:/repo" {
		t.Errorf("fallback repoRoot = %q, want the main checkout", repoRoot)
	}
	if _, stillThere := lookupWorktreeBinding("wt-gone"); stillThere {
		t.Error("a stale record must be evicted on fallback")
	}
}

// TestResolveWorkspace_RecordlessWorktree documents the exact boundary of FR-012 recovery for
// worktrees created BEFORE this feature (which therefore have no durable binding record):
//   (a) entered directly (frontend reports the worktree path) → re-attach via the specs/012 branch;
//   (b) frontend reports the MAIN checkout → stay on the main checkout (NOT recovered, by design),
//       because there is no record to consult and the main checkout is not a worktree path.
// This makes the documented limitation a tested invariant rather than an accident.
func TestResolveWorkspace_RecordlessWorktree(t *testing.T) {
	// (a) recordless worktree, entered directly → re-attaches, provisions nothing.
	fakeA := gitRepoFake()
	fakeA.outputs["worktree list --porcelain"] = strings.Join([]string{
		"worktree C:/repo", "branch refs/heads/main", "",
		"worktree C:/repo/.forge/worktrees/pre", "branch refs/heads/feature/pre", "",
	}, "\n")
	withFakeGit(t, fakeA)
	worktreePath := "C:/repo/.forge/worktrees/pre"
	repoRoot, binding := resolveSddWorkspace("wt-recordless-direct", worktreePath)
	if !binding.isIsolated || repoRoot != worktreePath {
		t.Fatalf("(a) recordless worktree entered directly: isolated=%v root=%q; want re-attach to %q", binding.isIsolated, repoRoot, worktreePath)
	}
	if fakeA.called("worktree add") {
		t.Error("(a) re-attach must not provision")
	}

	// (b) recordless worktree, frontend reports the MAIN checkout → stays on main (documented limit).
	withFakeGit(t, gitRepoFake())
	rootB, bindingB := resolveSddWorkspace("wt-recordless-main", "C:/repo")
	if bindingB.isIsolated || rootB != "C:/repo" {
		t.Fatalf("(b) recordless + reports-main: isolated=%v root=%q; want stay-on-main (FR-012 boundary)", bindingB.isIsolated, rootB)
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

// TestHandleSddWorktree_Validation covers the explicit-provision endpoint's guard rails
// (specs/013 US3): bad method, missing sessionId, and an unbound session — none of which may
// create anything.
func TestHandleSddWorktree_Validation(t *testing.T) {
	get := httptest.NewRecorder()
	handleSddWorktree(get, httptest.NewRequest(http.MethodGet, "/api/sdd/worktree", nil))
	if get.Code != http.StatusMethodNotAllowed {
		t.Errorf("GET = %d, want 405", get.Code)
	}

	noSession := httptest.NewRecorder()
	handleSddWorktree(noSession, httptest.NewRequest(http.MethodPost, "/api/sdd/worktree", strings.NewReader(`{}`)))
	if noSession.Code != http.StatusBadRequest {
		t.Errorf("missing sessionId = %d, want 400", noSession.Code)
	}

	unbound := httptest.NewRecorder()
	handleSddWorktree(unbound, httptest.NewRequest(http.MethodPost, "/api/sdd/worktree", strings.NewReader(`{"sessionId":"nope"}`)))
	if unbound.Code != http.StatusConflict {
		t.Errorf("unbound session = %d, want 409", unbound.Code)
	}
}

// TestHandleSddWorktree_AlreadyIsolatedIsIdempotent proves C9: requesting isolation for a tab
// that is already in a worktree returns success WITHOUT creating (nesting) another worktree.
func TestHandleSddWorktree_AlreadyIsolatedIsIdempotent(t *testing.T) {
	withFakeGit(t, gitRepoFake())
	sddPipelines.Store("wt-already", &sddPipeline{
		isIsolated: true, worktreePath: "C:/repo/.forge/worktrees/already", branch: "feature/already",
	})
	t.Cleanup(func() { sddPipelines.Delete("wt-already") })

	rec := httptest.NewRecorder()
	handleSddWorktree(rec, httptest.NewRequest(http.MethodPost, "/api/sdd/worktree", strings.NewReader(`{"sessionId":"wt-already"}`)))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var resp map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	if resp["isolated"] != true || resp["worktreePath"] != "C:/repo/.forge/worktrees/already" {
		t.Errorf("already-isolated response = %v, want the existing worktree echoed back (C9)", resp)
	}
}

// TestAssertNoNesting guards the core invariant of specs/012 US1: a worktree must
// never be anchored under a path that is itself already inside .forge/worktrees/.
func TestAssertNoNesting(t *testing.T) {
	if !assertNoNesting("C:/repo") {
		t.Error("a plain main checkout must be a safe anchor")
	}
	if assertNoNesting("C:/repo/.forge/worktrees/wt1") {
		t.Error("a path already inside .forge/worktrees/ must be rejected as an anchor (FR-003)")
	}
}

// TestResolveWorkspace_ReattachesExistingWorktree proves deterministic resume
// (specs/012 US1, FR-001/004/005): when a bind directory is ALREADY an isolated
// worktree, the session re-attaches to it rather than provisioning a NEW (nested)
// one. This is the direct fix for the captured .../worktrees/X/.forge/worktrees/Y bug.
func TestResolveWorkspace_ReattachesExistingWorktree(t *testing.T) {
	fake := gitRepoFake()
	// Bind directory is itself a linked worktree; git reports the main checkout first.
	fake.outputs["worktree list --porcelain"] = strings.Join([]string{
		"worktree C:/repo",
		"branch refs/heads/main",
		"",
		"worktree C:/repo/.forge/worktrees/wt-second",
		"branch refs/heads/feature/x",
		"",
	}, "\n")
	fake.outputs["rev-parse --abbrev-ref HEAD"] = "feature/x"
	withFakeGit(t, fake)

	worktreePath := "C:/repo/.forge/worktrees/wt-second"
	repoRoot, binding := resolveSddWorkspace("wt-second", worktreePath)

	if !binding.isIsolated {
		t.Fatal("re-attaching to an existing worktree must keep the pipeline isolated")
	}
	if repoRoot != worktreePath || binding.worktreePath != worktreePath {
		t.Errorf("re-attach repoRoot=%q worktreePath=%q; want both %q", repoRoot, binding.worktreePath, worktreePath)
	}
	if binding.mainRepoRoot != "C:/repo" {
		t.Errorf("mainRepoRoot = %q; want the main checkout C:/repo (from worktree list, not show-toplevel)", binding.mainRepoRoot)
	}
	if fake.called("worktree add") {
		t.Error("re-attach must NOT provision a new worktree (no nesting) — `git worktree add` was issued")
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
