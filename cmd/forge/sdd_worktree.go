// sdd_worktree.go — worktree automation for concurrent same-repo pipelines
// (specs/011). When a second terminal session binds to a repository that already
// has an active pipeline, this provisions an isolated git worktree, retargets the
// session's shell into it, and reports the binding so the rest of the SDD
// machinery (which is already repoRoot-parameterized) isolates for free.
package main

import (
	"fmt"
	"log"
	"path/filepath"
	"strings"

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

// resolveSddWorkspace decides where a binding session's pipeline should run.
// First pipeline for a repo → its main checkout. A concurrent second pipeline →
// a freshly provisioned worktree (shell retargeted into it). Any failure degrades
// safely to the main checkout so a bind is never blocked (FR-014).
// It returns the effective repoRoot to bind the pipeline to, plus the binding.
func resolveSddWorkspace(sessionID, repoRoot string) (string, sddWorktreeBinding) {
	if !sddGitClient.IsGitRepo(repoRoot) {
		return repoRoot, sddWorktreeBinding{} // non-git: single pipeline, no isolation.
	}
	commonDir, err := sddGitClient.GitCommonDir(repoRoot)
	if err != nil || commonDir == "" {
		return repoRoot, sddWorktreeBinding{}
	}
	if !sddHasConcurrentPipeline(sessionID, commonDir) {
		return repoRoot, sddWorktreeBinding{gitCommonDir: commonDir} // first pipeline (FR-005).
	}

	mainRepoRoot, err := sddGitClient.Toplevel(repoRoot)
	if err != nil || mainRepoRoot == "" {
		mainRepoRoot = repoRoot
	}
	worktreePath, branch, base, ok := provisionWorktreeForSession(sessionID, mainRepoRoot)
	if !ok {
		// Degrade safe: keep this session on the main checkout rather than block it (FR-014).
		return repoRoot, sddWorktreeBinding{gitCommonDir: commonDir}
	}
	retargetSessionShell(sessionID, worktreePath)
	return worktreePath, sddWorktreeBinding{
		gitCommonDir: commonDir,
		mainRepoRoot: mainRepoRoot,
		worktreePath: worktreePath,
		branch:       branch,
		baseBranch:   base,
		isIsolated:   true,
	}
}

// sddHasConcurrentPipeline reports whether another bound session already runs a
// pipeline in the same logical repository (same git common dir) — the concurrency
// signal that triggers isolation (FR-001).
func sddHasConcurrentPipeline(sessionID, commonDir string) bool {
	if commonDir == "" {
		return false
	}
	found := false
	sddPipelines.Range(func(key, value any) bool {
		otherID, _ := key.(string)
		other, _ := value.(*sddPipeline)
		if otherID != sessionID && other != nil && other.gitCommonDir == commonDir {
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
