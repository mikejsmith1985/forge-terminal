// sdd_worktree.go — worktree automation for concurrent same-repo pipelines
// (specs/011). When a second terminal session binds to a repository that already
// has an active pipeline, this provisions an isolated git worktree, retargets the
// session's shell into it, and reports the binding so the rest of the SDD
// machinery (which is already repoRoot-parameterized) isolates for free.
package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/mikejsmith1985/forge-terminal/internal/sdd"

	gitwt "github.com/mikejsmith1985/forge-terminal/internal/git"
)

// sddGitClient is the git wrapper used for all worktree automation. It is a package
// var so tests can inject a fake Runner via gitwt.NewWithRunner.
var sddGitClient = gitwt.New()

// sddWorktreeBinding is the resolved workspace for a binding session: where its
// pipeline runs and on which branch. The zero value (isIsolated=false) means the
// session stays on the repository's main checkout (the first/only pipeline, FR-005).
type sddWorktreeBinding struct {
	gitCommonDir string
	mainRepoRoot string
	worktreePath string
	branch       string
	baseBranch   string
	isIsolated   bool
	// notice is a one-time, developer-facing message surfaced in the bind response — used
	// when a recorded worktree is gone and the session falls back to the main checkout
	// (specs/013 FR-005). It is transient: never persisted, never stored on the pipeline.
	notice string
}

// sddWorktreesRoot returns the single, git-ignored location where isolated
// worktrees live for a repository (FR-016). `.forge/` is already gitignored.
func sddWorktreesRoot(mainRepoRoot string) string {
	return filepath.Join(mainRepoRoot, ".forge", "worktrees")
}

// sddBindingInfo is the additive per-tab binding surfaced to the frontend so it can
// show which worktree/branch a tab runs in (FR-007). isolated=false (the zero value)
// means the tab is on the main checkout and the UI shows no worktree indicator.
type sddBindingInfo struct {
	Isolated     bool   `json:"isolated"`
	WorktreePath string `json:"worktreePath,omitempty"`
	Branch       string `json:"branch,omitempty"`
	BaseBranch   string `json:"baseBranch,omitempty"`
}

// sddBindingInfoFor reads the binding from a pipeline (nil-safe).
func sddBindingInfoFor(pipeline *sddPipeline) sddBindingInfo {
	if pipeline == nil || !pipeline.isIsolated {
		return sddBindingInfo{}
	}
	return sddBindingInfo{
		Isolated:     true,
		WorktreePath: pipeline.worktreePath,
		Branch:       pipeline.branch,
		BaseBranch:   pipeline.baseBranch,
	}
}

// resolveSddWorkspace decides where a binding session's pipeline should run — RECOVERY-FIRST
// (specs/013). Priority: (1) a durable recovery record re-attaches the session to the worktree
// it left, even across a restart that emptied the in-memory map; (2) a bind directory that is
// ALREADY an isolated worktree re-attaches to it (specs/012); (3) otherwise the session stays on
// the main checkout. A bind NEVER provisions a worktree — concurrency is no longer a trigger, so
// opening a second tab can never silently spawn a directory. Isolation happens only via explicit
// consent (provisionWorktreeOnRequest). It returns the effective repoRoot plus the binding.
func resolveSddWorkspace(sessionID, repoRoot string) (string, sddWorktreeBinding) {
	if !sddGitClient.IsGitRepo(repoRoot) {
		return repoRoot, sddWorktreeBinding{} // non-git: single pipeline, no isolation.
	}
	commonDir, err := sddGitClient.GitCommonDir(repoRoot)
	if err != nil || commonDir == "" {
		return repoRoot, sddWorktreeBinding{}
	}
	// (1) Durable recovery (specs/013 US2, FR-002/004/005): re-attach from the persisted record.
	if effectiveRoot, binding, handled := recoverWorktreeBinding(sessionID, repoRoot, commonDir); handled {
		return effectiveRoot, binding
	}
	// (2) Deterministic resume (specs/012 US1, FR-001/004): the bind directory is itself an
	// isolated worktree → re-attach, never provisioning a new (nested) one.
	if isForgeWorktreePath(repoRoot) {
		return reattachExistingWorktree(repoRoot, commonDir)
	}
	// (3) Recovery-first default (specs/013 US1, FR-001/003): stay on the main checkout. The
	// removed concurrency→provision branch is exactly what made a second tab spawn a worktree.
	return repoRoot, sddWorktreeBinding{gitCommonDir: commonDir}
}

// recoverWorktreeBinding re-attaches a session to the isolated worktree recorded for it
// (specs/013 US2). When the recorded worktree no longer exists, it evicts the stale record and
// falls back to the main checkout with exactly one notice (FR-005) — never recreating or nesting.
// handled is false when there is no record, so the caller continues the normal resolution order.
func recoverWorktreeBinding(sessionID, repoRoot, commonDir string) (string, sddWorktreeBinding, bool) {
	record, ok := lookupWorktreeBinding(sessionID)
	if !ok {
		return "", sddWorktreeBinding{}, false
	}
	if !isValidWorktree(record.WorktreePath) {
		evictWorktreeBinding(sessionID)
		mainRoot := mainCheckoutOrFallback(repoRoot)
		return mainRoot, sddWorktreeBinding{
			gitCommonDir: commonDir,
			mainRepoRoot: mainRoot,
			notice:       "The isolated worktree for this tab no longer exists; re-attached to the main checkout.",
		}, true
	}
	// Retarget the shell only when the session is not already sitting in the worktree — e.g. the
	// frontend reported the main checkout after a restart (specs/013 FR-006: recovery, no manual cd).
	if !sameSddRepo(repoRoot, record.WorktreePath) {
		retargetSessionShell(sessionID, record.WorktreePath)
	}
	return record.WorktreePath, sddWorktreeBinding{
		gitCommonDir: commonDir,
		mainRepoRoot: record.MainRepoRoot,
		worktreePath: record.WorktreePath,
		branch:       record.Branch,
		baseBranch:   record.BaseBranch,
		isIsolated:   true,
	}, true
}

// isValidWorktree reports whether path is still one of our isolated worktrees present on disk.
// Used to decide recovery vs. fallback: a record whose directory is gone is treated as absent,
// so recovery fails safe to the main checkout, never to provisioning (specs/013 FR-005).
func isValidWorktree(path string) bool {
	if !isForgeWorktreePath(path) {
		return false
	}
	_, err := os.Stat(path)
	return err == nil
}

// provisionWorktreeOnRequest creates an isolated worktree for a session ON EXPLICIT REQUEST only
// (specs/013 US3, FR-007). This is the ONLY path that creates a worktree. It anchors to the main
// checkout (never nesting, FR-008/009), retargets the shell, and persists a durable recovery
// record (US2). Already-isolated callers reuse their current worktree rather than nesting (C9).
// ok is false on any failure so the caller keeps the tab on the main checkout (FR-011).
func provisionWorktreeOnRequest(sessionID, repoRoot string) (sddWorktreeBinding, bool) {
	if !sddGitClient.IsGitRepo(repoRoot) {
		return sddWorktreeBinding{}, false
	}
	commonDir, err := sddGitClient.GitCommonDir(repoRoot)
	if err != nil || commonDir == "" {
		return sddWorktreeBinding{}, false
	}
	// Invoked from inside a worktree → reuse it; never create a worktree in a worktree (C9).
	if isForgeWorktreePath(repoRoot) {
		_, binding := reattachExistingWorktree(repoRoot, commonDir)
		return binding, true
	}
	mainRepoRoot := mainCheckoutOrFallback(repoRoot)
	if !assertNoNesting(mainRepoRoot) {
		return sddWorktreeBinding{gitCommonDir: commonDir}, false // refuse to nest (FR-009).
	}
	worktreePath, branch, base, ok := provisionWorktreeForSession(sessionID, mainRepoRoot)
	if !ok {
		return sddWorktreeBinding{gitCommonDir: commonDir}, false // degrade safe (FR-011).
	}
	retargetSessionShell(sessionID, worktreePath)
	saveWorktreeBinding(sessionID, worktreeBindingRecord{
		WorktreePath: worktreePath,
		Branch:       branch,
		BaseBranch:   base,
		MainRepoRoot: mainRepoRoot,
	})
	return sddWorktreeBinding{
		gitCommonDir: commonDir,
		mainRepoRoot: mainRepoRoot,
		worktreePath: worktreePath,
		branch:       branch,
		baseBranch:   base,
		isIsolated:   true,
	}, true
}

// mainCheckoutOrFallback resolves the repository's main checkout via MainCheckout
// (the durable, worktree-list-anchored answer), falling back to dir when git cannot
// report it so a bind is never blocked (FR-014).
func mainCheckoutOrFallback(dir string) string {
	main, err := sddGitClient.MainCheckout(dir)
	if err != nil || main == "" {
		return dir
	}
	return main
}

// assertNoNesting reports whether root is a safe anchor for a new worktree — i.e. it
// is not itself inside a .forge/worktrees/ directory. Anchoring under such a path is
// exactly what produced the recursive nesting bug (specs/012 US1, FR-003).
func assertNoNesting(root string) bool {
	return !isForgeWorktreePath(root)
}

// reattachExistingWorktree binds a session to the worktree it is already sitting in,
// resolving the main checkout from the worktree list (never --show-toplevel) and
// provisioning nothing. A resumed session therefore keeps its exact directory and
// can never spawn a nested worktree (specs/012 US1, FR-001/004/005). The shell is
// NOT retargeted — the session is already in this directory.
func reattachExistingWorktree(worktreePath, commonDir string) (string, sddWorktreeBinding) {
	branch, _ := sddGitClient.CurrentBranch(worktreePath)
	return worktreePath, sddWorktreeBinding{
		gitCommonDir: commonDir,
		mainRepoRoot: mainCheckoutOrFallback(worktreePath),
		worktreePath: worktreePath,
		branch:       branch,
		isIsolated:   true,
	}
}

// sddHasActiveConcurrentPipeline reports whether another session is running an ACTIVE SDD
// pipeline in the same logical repository (same git common dir) — i.e. one that has actually
// started a phase and is not yet complete. This is the real shared-state collision signal
// (two pipelines share one .forge/workflow-ticket.json). Unlike a merely-bound idle tab, an
// active pipeline is the only case that justifies OFFERING isolation, so ordinary tabs are
// never nagged with the collision prompt (specs/013 FR-003; analysis finding F1).
func sddHasActiveConcurrentPipeline(sessionID, commonDir string) bool {
	if commonDir == "" {
		return false
	}
	found := false
	sddPipelines.Range(func(key, value any) bool {
		otherID, _ := key.(string)
		other, _ := value.(*sddPipeline)
		if otherID == sessionID || other == nil || other.gitCommonDir != commonDir || other.orchestrator == nil {
			return true
		}
		state := other.orchestrator.State()
		if state.CurrentPhase != "" && state.Status != sdd.StatusComplete {
			found = true
			return false // stop ranging
		}
		return true
	})
	return found
}

// provisionWorktreeForSession creates an isolated worktree on a provisional branch
// off the main checkout's current branch (R4/R7). Returns ok=false on any git
// failure so the caller can degrade safely.
func provisionWorktreeForSession(sessionID, mainRepoRoot string) (worktreePath, branch, base string, ok bool) {
	base, err := sddGitClient.CurrentBranch(mainRepoRoot)
	if err != nil || base == "" {
		return "", "", "", false
	}
	token := sanitizeSessionToken(sessionID)
	branch = "forge/wt-" + token
	worktreePath = filepath.Join(sddWorktreesRoot(mainRepoRoot), token)
	if err := sddGitClient.WorktreeAdd(mainRepoRoot, worktreePath, branch, base); err != nil {
		return "", "", "", false
	}
	return worktreePath, branch, base, true
}

// reconcileWorktreeBranch promotes a still-provisional worktree branch to the
// feature/<spec-dir-name> convention once the feature directory is known (R4,
// FR-010). It is a no-op if the pipeline is not isolated or already reconciled.
func reconcileWorktreeBranch(pipeline *sddPipeline, featureDir string) {
	if pipeline == nil || !pipeline.isIsolated || featureDir == "" {
		return
	}
	desired := "feature/" + filepath.Base(featureDir)
	if pipeline.branch == desired {
		return // already reconciled (FR-009 re-bind path).
	}
	if !strings.HasPrefix(pipeline.branch, "forge/wt-") {
		return // only promote provisional branches; never rename a real feature branch.
	}
	if err := sddGitClient.BranchRename(pipeline.worktreePath, pipeline.branch, desired); err != nil {
		return // keep the provisional branch on failure; non-fatal.
	}
	pipeline.branch = desired
}

// safeCleanupWorktree removes an isolated worktree ONLY when it is provably safe:
// its branch is fully merged into its base AND its working tree is clean (FR-011).
// Otherwise it retains the worktree and returns a warning, so cleanup can never
// silently destroy un-merged or uncommitted work (FR-012). removed reports whether
// the worktree was actually torn down.
func safeCleanupWorktree(pipeline *sddPipeline) (removed bool, warning string) {
	if pipeline == nil || !pipeline.isIsolated || pipeline.worktreePath == "" {
		return false, ""
	}
	if pipeline.mainRepoRoot == "" || pipeline.baseBranch == "" {
		// Unknown base/main → cannot prove safety; retain and warn (never remove on uncertainty).
		return false, "worktree " + pipeline.branch + " retained: base/main unknown, cannot verify it is merged"
	}

	clean, err := sddGitClient.IsClean(pipeline.worktreePath)
	if err != nil || !clean {
		return false, "worktree " + pipeline.branch + " retained: uncommitted changes present"
	}
	merged, err := sddGitClient.BranchMerged(pipeline.mainRepoRoot, pipeline.branch, pipeline.baseBranch)
	if err != nil || !merged {
		return false, "worktree " + pipeline.branch + " retained: branch not merged into " + pipeline.baseBranch
	}

	if err := sddGitClient.WorktreeRemove(pipeline.mainRepoRoot, pipeline.worktreePath); err != nil {
		return false, "worktree " + pipeline.branch + " could not be removed: " + err.Error()
	}
	// Best-effort branch delete; the worktree (the disk cost) is already gone.
	_ = sddGitClient.BranchDelete(pipeline.mainRepoRoot, pipeline.branch)
	return true, ""
}

// cleanupSessionWorktree evaluates and (if safe) removes the worktree bound to a
// closed session, dropping the in-memory pipeline only when the worktree is gone.
// Called from the session-close path (FR-011); a retained worktree keeps its
// binding so it stays discoverable.
func cleanupSessionWorktree(sessionID string) {
	pipeline, ok := sddPipelineFor(sessionID)
	if !ok {
		return
	}
	removed, warning := safeCleanupWorktree(pipeline)
	if warning != "" {
		log.Printf("[sdd] worktree cleanup: %s", warning)
	}
	if removed {
		sddPipelines.Delete(sessionID)
		// The worktree is gone — drop its durable recovery record so a future bind never
		// tries to re-attach to a reclaimed directory (specs/013 US2 lifecycle).
		evictWorktreeBinding(sessionID)
	}
}

// sweepWorktreesOnStartup re-discovers worktrees under .forge/worktrees from git's
// own registry (FR-013) and removes any that are now provably safe. Worktrees that
// are not merged+clean are left in place to be re-bound when a tab reconnects.
// repoRoots is the set of repositories to sweep (the app supplies known roots).
func sweepWorktreesOnStartup(repoRoots []string) {
	for _, repoRoot := range repoRoots {
		if !sddGitClient.IsGitRepo(repoRoot) {
			continue
		}
		worktrees, err := sddGitClient.WorktreeList(repoRoot)
		if err != nil {
			continue
		}
		base, _ := sddGitClient.CurrentBranch(repoRoot)
		for _, worktree := range worktrees {
			if !isForgeWorktreePath(worktree.Path) {
				continue // never touch the main checkout or foreign worktrees.
			}
			sweepOneWorktree(repoRoot, base, worktree)
		}
	}
}

// sweepOneWorktree removes a single discovered worktree if merged+clean; otherwise
// leaves it. Separated to keep sweepWorktreesOnStartup under the 40-line guideline.
func sweepOneWorktree(repoRoot, base string, worktree gitwt.Worktree) {
	if isWorktreeBound(worktree.Path) {
		return // a live tab is using this worktree — never reclaim it out from under them.
	}
	clean, err := sddGitClient.IsClean(worktree.Path)
	if err != nil || !clean {
		return
	}
	if base == "" || worktree.Branch == "" {
		return
	}
	merged, err := sddGitClient.BranchMerged(repoRoot, worktree.Branch, base)
	if err != nil || !merged {
		return
	}
	if err := sddGitClient.WorktreeRemove(repoRoot, worktree.Path); err == nil {
		_ = sddGitClient.BranchDelete(repoRoot, worktree.Branch)
		log.Printf("[sdd] startup sweep removed merged worktree %s (%s)", worktree.Path, worktree.Branch)
	}
}

// isWorktreeBound reports whether any live pipeline currently runs in the worktree
// at path, so a sweep never removes a worktree a still-open tab depends on.
func isWorktreeBound(path string) bool {
	bound := false
	sddPipelines.Range(func(_, value any) bool {
		if pipeline, _ := value.(*sddPipeline); pipeline != nil && pipeline.worktreePath != "" && sameSddRepo(pipeline.worktreePath, path) {
			bound = true
			return false
		}
		return true
	})
	return bound
}

// isForgeWorktreePath reports whether a path is one of OUR isolated worktrees
// (under a .forge/worktrees segment), so the sweep never touches the main checkout
// or a user-created worktree elsewhere.
func isForgeWorktreePath(path string) bool {
	return strings.Contains(filepath.ToSlash(path), "/.forge/worktrees/")
}

// sanitizeSessionToken reduces a session id to a git-branch- and path-safe token
// (letters, digits, hyphen) so provisional branch/dir names are always valid.
func sanitizeSessionToken(sessionID string) string {
	var builder strings.Builder
	for _, r := range sessionID {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-':
			builder.WriteRune(r)
		default:
			builder.WriteRune('-')
		}
	}
	token := strings.Trim(builder.String(), "-")
	if token == "" {
		token = "session"
	}
	return token
}

// retargetSessionShell moves an already-running session's shell into the worktree
// by injecting a `cd` once the terminal is quiet, reusing the macro-injection path
// (R3, FR-004). Best-effort: a missing session or busy PTY simply means the cd is
// skipped here and the developer can cd manually; it never blocks provisioning.
func retargetSessionShell(sessionID, worktreePath string) {
	if termHandler == nil {
		return
	}
	// `cd "<path>"` is valid in PowerShell (cd → Set-Location) and POSIX shells; forward
	// slashes are accepted by Git Bash and PowerShell on Windows.
	command := fmt.Sprintf("cd %q", filepath.ToSlash(worktreePath))
	go injectSddCommand(sessionID, command)
}

// pushWorktreeCollisionPrompt offers (never forces) isolation to a session that bound to a repo
// where another ACTIVE pipeline is already running (specs/013 US3, FR-003). It pushes a prompt
// over the existing WebSocket hub; the developer confirms (→ POST /api/sdd/worktree) or dismisses
// (→ stay on the shared main checkout). It NEVER provisions anything on its own — opt-in only.
func pushWorktreeCollisionPrompt(sessionID, repoRoot string) {
	if termHandler == nil {
		return
	}
	termHandler.BroadcastJSONToSession(sessionID, map[string]any{
		"type":      "SDD_WORKTREE_COLLISION",
		"sessionId": sessionID,
		"repoRoot":  repoRoot,
		"message":   "This repository already has an active SDD pipeline. Open this tab in an isolated worktree to avoid collisions?",
	})
}
