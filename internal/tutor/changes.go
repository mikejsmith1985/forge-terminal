// changes.go detects recently modified files using git diff for the Change Wizard.
// The wizard shows only the files an agent just touched — not the entire project.
package tutor

import (
	"bytes"
	"fmt"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// maxDiffBytesPerFile caps the unified diff text included per file.
// Keeps LLM prompts manageable while preserving the most important context.
const maxDiffBytesPerFile = 8 * 1024 // 8 KB

// maxWizardFiles caps how many changed files the wizard shows.
// Large changesets are truncated to keep walkthroughs focused.
const maxWizardFiles = 20

// DetectRecentChanges discovers files changed in the git repository at projectPath.
//
// Detection priority:
//  1. Uncommitted changes (staged + unstaged) — most recent work in progress
//  2. Last commit's changes — useful when an agent just committed
//
// Returns an empty ChangeSet (not an error) if the directory is not a git repo
// or if git is unavailable. Callers should handle the empty case gracefully.
func DetectRecentChanges(projectPath string) (*ChangeSet, error) {
	changeSet := &ChangeSet{
		ProjectPath: projectPath,
		DetectedAt:  time.Now(),
	}

	// Check for uncommitted changes (files that differ from HEAD in any way).
	changedPaths, err := listChangedPaths(projectPath, "HEAD")
	if err != nil {
		// Not a git repo, git not installed, or initial commit with no parent.
		// Treat as "no changes" rather than propagating the error.
		changeSet.Source = "none"
		return changeSet, nil
	}

	// No uncommitted changes — look at what the last commit touched instead.
	if len(changedPaths) == 0 {
		changedPaths, err = listChangedPaths(projectPath, "HEAD~1..HEAD")
		if err != nil || len(changedPaths) == 0 {
			changeSet.Source = "none"
			return changeSet, nil
		}
		changeSet.Source = "last-commit"
	} else {
		changeSet.Source = "uncommitted"
	}

	// Cap to avoid overwhelming the wizard with massive changesets.
	if len(changedPaths) > maxWizardFiles {
		changedPaths = changedPaths[:maxWizardFiles]
	}

	// Fetch diff details for each changed file (errors are non-fatal per file).
	changes := make([]RecentChange, 0, len(changedPaths))
	for _, path := range changedPaths {
		change := buildRecentChange(projectPath, path, changeSet.Source)
		changes = append(changes, change)
	}

	changeSet.Files = changes
	return changeSet, nil
}

// listChangedPaths returns file paths that differ in the given git range.
// Uses --diff-filter=ACMR to include Added, Copied, Modified, and Renamed files
// while excluding Deleted files (nothing to show in the viewer for those).
func listChangedPaths(projectPath, gitRange string) ([]string, error) {
	output, err := runGitCommand(projectPath, "diff", "--name-only", "--diff-filter=ACMR", gitRange)
	if err != nil {
		return nil, err
	}

	var paths []string
	for _, line := range strings.Split(output, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" {
			paths = append(paths, trimmed)
		}
	}
	return paths, nil
}

// buildRecentChange fetches diff stats and content for a single changed file.
// On partial failure (e.g., binary file with no diff text), returns whatever
// information is available — the wizard degrades gracefully.
func buildRecentChange(projectPath, filePath, source string) RecentChange {
	change := RecentChange{
		Path:      filePath,
		Operation: "modified",
	}

	// Choose the git range: uncommitted changes vs last commit.
	gitRange := "HEAD"
	if source == "last-commit" {
		gitRange = "HEAD~1..HEAD"
	}

	// Get per-file addition/deletion counts from --numstat.
	if numstatOutput, err := runGitCommand(projectPath, "diff", "--numstat", gitRange, "--", filePath); err == nil {
		change.Additions, change.Deletions = parseNumstatLine(numstatOutput)
	}

	// Get unified diff text (capped to keep LLM prompts manageable).
	if diffOutput, err := runGitCommand(projectPath, "diff", "-U5", gitRange, "--", filePath); err == nil {
		if len(diffOutput) > maxDiffBytesPerFile {
			diffOutput = diffOutput[:maxDiffBytesPerFile] + "\n\n... [diff truncated — file exceeds 8KB]"
		}
		change.Diff = diffOutput
	}

	// Mark as "added" when there are only additions and the file status says A.
	if change.Deletions == 0 && change.Additions > 0 {
		if statusOutput, err := runGitCommand(projectPath, "diff", "--name-status", gitRange, "--", filePath); err == nil {
			if strings.HasPrefix(strings.TrimSpace(statusOutput), "A") {
				change.Operation = "added"
			}
		}
	}

	return change
}

// parseNumstatLine parses a single line from `git diff --numstat` output.
// Line format: "<additions>\t<deletions>\t<filepath>"
func parseNumstatLine(line string) (additions, deletions int) {
	parts := strings.Fields(strings.TrimSpace(line))
	if len(parts) < 2 {
		return 0, 0
	}
	additions, _ = strconv.Atoi(parts[0])
	deletions, _ = strconv.Atoi(parts[1])
	return additions, deletions
}

// runGitCommand executes a git command inside projectPath and returns trimmed stdout.
// Returns an error if git is not available or the command exits non-zero.
func runGitCommand(projectPath string, args ...string) (string, error) {
	absPath, err := filepath.Abs(projectPath)
	if err != nil {
		return "", fmt.Errorf("resolving project path %q: %w", projectPath, err)
	}

	cmd := exec.Command("git", args...)
	cmd.Dir = absPath

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("git %s: %w", strings.Join(args, " "), err)
	}

	return strings.TrimSpace(stdout.String()), nil
}
