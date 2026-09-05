// Package workflow — branch.go: which branch a project is checked out on, read without spawning git.
//
// The ledger needs the branch for one reason: a ticket must only vouch for
// commits on the branch it was opened on. Without that tie, a ticket completed
// last week satisfies a commit made today on unrelated work, and the gate has
// quietly become decoration.
//
// It is read from the .git directory directly rather than by running git. That
// keeps the check usable from a unit test in well under a millisecond, keeps it
// working where git is not on PATH (the pre-commit hook runs in a minimal
// shell), and avoids spawning a console window on Windows, which every other
// process launch in this codebase has had to suppress individually.
package workflow

import (
	"os"
	"path/filepath"
	"strings"
)

// gitDirectoryName is the entry git keeps its state under.
const gitDirectoryName = ".git"

// headFileName holds the current ref inside a git directory.
const headFileName = "HEAD"

// headRefPrefix is what HEAD contains when it points at a branch rather than
// a bare commit.
const headRefPrefix = "ref: refs/heads/"

// worktreePointerPrefix is what a linked worktree's .git *file* starts with.
const worktreePointerPrefix = "gitdir:"

// CurrentBranch reports the branch the project is checked out on.
//
// Returns empty when there is no repository, when HEAD is detached, or when
// the git state cannot be read. Empty means "unknown", and callers treat
// unknown as "cannot judge" rather than as a failure — a preflight run
// somewhere with no repository has no commit to gate.
//
// @param projectRoot The project directory, which may be a linked worktree.
func CurrentBranch(projectRoot string) string {
	gitDirectory := resolveGitDirectory(projectRoot)
	if gitDirectory == "" {
		return ""
	}

	headContent, err := os.ReadFile(filepath.Join(gitDirectory, headFileName))
	if err != nil {
		return ""
	}

	headLine := strings.TrimSpace(string(headContent))
	if !strings.HasPrefix(headLine, headRefPrefix) {
		return "" // detached HEAD: a commit, not a branch
	}
	return strings.TrimPrefix(headLine, headRefPrefix)
}

// resolveGitDirectory finds the directory holding HEAD for a project.
//
// An ordinary checkout has a .git directory. A linked worktree — which Forge
// provisions for concurrent pipelines — has a .git file naming the directory
// that holds its state, and that is where its HEAD lives.
func resolveGitDirectory(projectRoot string) string {
	gitPath := filepath.Join(projectRoot, gitDirectoryName)

	info, err := os.Stat(gitPath)
	if err != nil {
		return ""
	}
	if info.IsDir() {
		return gitPath
	}

	pointerContent, err := os.ReadFile(gitPath)
	if err != nil {
		return ""
	}
	pointerLine := strings.TrimSpace(string(pointerContent))
	if !strings.HasPrefix(pointerLine, worktreePointerPrefix) {
		return ""
	}

	target := strings.TrimSpace(strings.TrimPrefix(pointerLine, worktreePointerPrefix))
	if !filepath.IsAbs(target) {
		target = filepath.Join(projectRoot, target)
	}
	return target
}
