// worktree.go — the git worktree/branch/introspection operations the SDD
// worktree-automation feature needs (specs/011). Every method is a thin call
// through the Client's Runner, so the logic that matters (porcelain parsing,
// merged/clean predicates) is unit-tested without a real repo.
package git

import (
	"path/filepath"
	"strings"
)

// Worktree is one entry from `git worktree list --porcelain`.
type Worktree struct {
	Path   string // absolute working-tree path
	Branch string // short branch name (refs/heads/ prefix stripped); empty if detached
	Head   string // commit SHA the worktree points at
}

// GitCommonDir returns the absolute path of the shared .git directory for dir —
// the stable identity key used to decide whether two sessions are in the same repo.
// git rev-parse --git-common-dir returns a relative path (".git") when called from
// the main checkout but an absolute path from a linked worktree, so we normalize to
// absolute here so the grouping key is the same regardless of which entry-point is used.
func (c *Client) GitCommonDir(dir string) (string, error) {
	out, err := c.runner.Run(dir, "rev-parse", "--git-common-dir")
	if err != nil || out == "" {
		return out, err
	}
	if !filepath.IsAbs(out) {
		out = filepath.Join(dir, out)
	}
	return filepath.Clean(out), nil
}

// Toplevel returns the working-tree root of dir (`rev-parse --show-toplevel`).
func (c *Client) Toplevel(dir string) (string, error) {
	return c.runner.Run(dir, "rev-parse", "--show-toplevel")
}

// CurrentBranch returns the short name of the branch checked out in dir.
func (c *Client) CurrentBranch(dir string) (string, error) {
	return c.runner.Run(dir, "rev-parse", "--abbrev-ref", "HEAD")
}

// IsGitRepo reports whether dir is inside a git working tree. A non-repo is not
// an error here — it is the signal to fall back to a single, non-isolated pipeline.
func (c *Client) IsGitRepo(dir string) bool {
	out, err := c.runner.Run(dir, "rev-parse", "--is-inside-work-tree")
	return err == nil && strings.TrimSpace(out) == "true"
}

// WorktreeAdd creates a new worktree at path on a freshly created branch off base.
func (c *Client) WorktreeAdd(repoDir, path, branch, base string) error {
	_, err := c.runner.Run(repoDir, "worktree", "add", path, "-b", branch, base)
	return err
}

// WorktreeList returns every worktree git knows about for the repo at repoDir.
func (c *Client) WorktreeList(repoDir string) ([]Worktree, error) {
	out, err := c.runner.Run(repoDir, "worktree", "list", "--porcelain")
	if err != nil {
		return nil, err
	}
	return parseWorktreePorcelain(out), nil
}

// WorktreeRemove removes the worktree registered at path.
func (c *Client) WorktreeRemove(repoDir, path string) error {
	_, err := c.runner.Run(repoDir, "worktree", "remove", path)
	return err
}

// BranchMerged reports whether branch is fully contained in base — i.e. base
// can reach branch's tip, so the branch's work has already landed. Implemented
// via `branch --merged <base>` (output-driven, not exit-code-driven) so it is
// trivial to mock.
func (c *Client) BranchMerged(repoDir, branch, base string) (bool, error) {
	out, err := c.runner.Run(repoDir, "branch", "--merged", base)
	if err != nil {
		return false, err
	}
	for _, line := range strings.Split(out, "\n") {
		// Each line carries an optional marker: "* " = current branch, "+ " = checked
		// out in a linked worktree (our exact case — the feature branch lives in its
		// own worktree). Strip either marker before comparing.
		name := strings.TrimSpace(strings.TrimLeft(strings.TrimSpace(line), "*+ "))
		if name == branch {
			return true, nil
		}
	}
	return false, nil
}

// IsClean reports whether dir's working tree has no uncommitted or untracked
// changes (`status --porcelain` empty). A dirty tree must never be auto-removed.
func (c *Client) IsClean(dir string) (bool, error) {
	out, err := c.runner.Run(dir, "status", "--porcelain")
	if err != nil {
		return false, err
	}
	return strings.TrimSpace(out) == "", nil
}

// BranchRename renames a local branch (`branch -m <old> <new>`), used to promote
// a provisional worktree branch to the feature/<spec-dir-name> convention.
func (c *Client) BranchRename(repoDir, oldName, newName string) error {
	_, err := c.runner.Run(repoDir, "branch", "-m", oldName, newName)
	return err
}

// BranchDelete deletes a fully-merged local branch (`branch -d <branch>`).
func (c *Client) BranchDelete(repoDir, branch string) error {
	_, err := c.runner.Run(repoDir, "branch", "-d", branch)
	return err
}

// parseWorktreePorcelain turns `git worktree list --porcelain` output into
// Worktree records. Blocks are separated by blank lines; each starts with a
// "worktree <path>" line and may carry "HEAD <sha>" and "branch refs/heads/<n>".
func parseWorktreePorcelain(porcelain string) []Worktree {
	var worktrees []Worktree
	var current *Worktree
	flush := func() {
		if current != nil {
			worktrees = append(worktrees, *current)
			current = nil
		}
	}
	for _, line := range strings.Split(porcelain, "\n") {
		line = strings.TrimRight(line, "\r")
		switch {
		case strings.HasPrefix(line, "worktree "):
			flush()
			current = &Worktree{Path: strings.TrimPrefix(line, "worktree ")}
		case current == nil:
			continue
		case strings.HasPrefix(line, "HEAD "):
			current.Head = strings.TrimPrefix(line, "HEAD ")
		case strings.HasPrefix(line, "branch "):
			current.Branch = strings.TrimPrefix(strings.TrimPrefix(line, "branch "), "refs/heads/")
		}
	}
	flush()
	return worktrees
}
