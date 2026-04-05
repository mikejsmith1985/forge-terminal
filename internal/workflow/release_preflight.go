// release_preflight.go runs release-readiness checks and generates a fix
// prompt the user can paste to an AI agent when violations are found.
// This is the final enforcement gate — it catches everything that upstream
// git hooks and skills might have missed during development.
package workflow

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// ScanReleasePreflight runs all release-readiness checks against a project.
// It combines compliance-level checks (CHANGELOG, branch naming, commit format)
// with build-level checks (Go build, tests) and produces a structured report.
// When any blocking check fails, FixPrompt contains a user-pasteable prompt.
func ScanReleasePreflight(projectPath string, targetVersion string) (*PreflightReport, error) {
	absolutePath, err := filepath.Abs(projectPath)
	if err != nil {
		return nil, fmt.Errorf("resolving project path: %w", err)
	}

	report := &PreflightReport{
		CheckedAt: time.Now(),
	}

	// Run all checks — order doesn't matter since each is independent.
	checkChangelogExists(absolutePath, report)
	checkChangelogUpdated(absolutePath, targetVersion, report)
	checkBranchNaming(absolutePath, report)
	checkNotOnMain(absolutePath, report)
	checkCommitFormat(absolutePath, report)
	checkGitHooksConfigured(absolutePath, report)
	checkWorkflowConfig(absolutePath, report)
	checkGoBuilds(absolutePath, report)
	checkGoTests(absolutePath, report)
	checkFrontendTests(absolutePath, report)

	// Compute summary counts.
	for _, check := range report.Checks {
		if check.Status == PreflightPass {
			report.PassingCount++
		} else if check.Severity == PreflightBlocking {
			report.BlockingCount++
		} else {
			report.WarningCount++
		}
	}

	// Determine overall status.
	switch {
	case report.BlockingCount > 0:
		report.Status = "fail"
		report.CanRelease = false
	case report.WarningCount > 0:
		report.Status = "warning"
		report.CanRelease = true
	default:
		report.Status = "pass"
		report.CanRelease = true
	}

	// Generate the fix prompt when there are blocking issues.
	if report.BlockingCount > 0 {
		report.FixPrompt = generateFixPrompt(report)
	}

	return report, nil
}

// ─── Individual Checks ───────────────────────────────────────────────────────

// checkChangelogExists verifies CHANGELOG.md is present in the project root.
func checkChangelogExists(projectPath string, report *PreflightReport) {
	changelogPath := filepath.Join(projectPath, "CHANGELOG.md")
	if fileExistsSimple(changelogPath) {
		report.Checks = append(report.Checks, PreflightCheck{
			ID:       "changelog-exists",
			Name:     "CHANGELOG Exists",
			Severity: PreflightBlocking,
			Status:   PreflightPass,
			Message:  "CHANGELOG.md found",
			FilePath: "CHANGELOG.md",
		})
	} else {
		report.Checks = append(report.Checks, PreflightCheck{
			ID:         "changelog-exists",
			Name:       "CHANGELOG Exists",
			Severity:   PreflightBlocking,
			Status:     PreflightFail,
			Message:    "CHANGELOG.md not found — release notes require a changelog",
			Suggestion: "Create CHANGELOG.md with an entry for this release",
			FilePath:   "CHANGELOG.md",
		})
	}
}

// checkChangelogUpdated checks whether the changelog mentions the target version.
func checkChangelogUpdated(projectPath string, targetVersion string, report *PreflightReport) {
	if targetVersion == "" {
		return // Skip if no version specified
	}

	changelogPath := filepath.Join(projectPath, "CHANGELOG.md")
	content, err := os.ReadFile(changelogPath)
	if err != nil {
		return // changelog-exists check already handles missing file
	}

	// Look for the version string (with or without 'v' prefix) in the changelog.
	versionNormalized := strings.TrimPrefix(targetVersion, "v")
	containsVersion := strings.Contains(string(content), versionNormalized) ||
		strings.Contains(string(content), "v"+versionNormalized)

	if containsVersion {
		report.Checks = append(report.Checks, PreflightCheck{
			ID:       "changelog-updated",
			Name:     "CHANGELOG Updated",
			Severity: PreflightWarning,
			Status:   PreflightPass,
			Message:  fmt.Sprintf("CHANGELOG.md contains entry for version %s", targetVersion),
			FilePath: "CHANGELOG.md",
		})
	} else {
		report.Checks = append(report.Checks, PreflightCheck{
			ID:         "changelog-updated",
			Name:       "CHANGELOG Updated",
			Severity:   PreflightWarning,
			Status:     PreflightFail,
			Message:    fmt.Sprintf("CHANGELOG.md does not mention version %s", targetVersion),
			Suggestion: fmt.Sprintf("Add a '## [%s]' section to CHANGELOG.md with release notes", targetVersion),
			FilePath:   "CHANGELOG.md",
		})
	}
}

// checkBranchNaming verifies the current branch follows naming conventions.
func checkBranchNaming(projectPath string, report *PreflightReport) {
	branch := getCurrentBranch(projectPath)
	if branch == "" {
		report.Checks = append(report.Checks, PreflightCheck{
			ID:       "branch-naming",
			Name:     "Branch Naming",
			Severity: PreflightWarning,
			Status:   PreflightFail,
			Message:  "Could not determine current branch (detached HEAD?)",
		})
		return
	}

	validPattern := regexp.MustCompile(
		`^(main|master|develop|feature/.+|fix/.+|chore/.+|docs/.+|hotfix/.+|release/.+)$`,
	)
	if validPattern.MatchString(branch) {
		report.Checks = append(report.Checks, PreflightCheck{
			ID:       "branch-naming",
			Name:     "Branch Naming",
			Severity: PreflightWarning,
			Status:   PreflightPass,
			Message:  fmt.Sprintf("Branch '%s' follows naming convention", branch),
		})
	} else {
		report.Checks = append(report.Checks, PreflightCheck{
			ID:         "branch-naming",
			Name:       "Branch Naming",
			Severity:   PreflightWarning,
			Status:     PreflightFail,
			Message:    fmt.Sprintf("Branch '%s' does not follow naming convention", branch),
			Suggestion: "Rename to: feature/<name>, fix/<name>, chore/<name>, or release/<name>",
		})
	}
}

// checkNotOnMain ensures the release starts from a feature/release branch, not main.
// The release script merges TO main — starting on main means development happened there.
func checkNotOnMain(projectPath string, report *PreflightReport) {
	branch := getCurrentBranch(projectPath)
	if branch == "" {
		return // branch-naming already flagged this
	}

	if branch == "main" || branch == "master" {
		report.Checks = append(report.Checks, PreflightCheck{
			ID:         "not-on-main",
			Name:       "Not On Main Branch",
			Severity:   PreflightBlocking,
			Status:     PreflightFail,
			Message:    fmt.Sprintf("Currently on '%s' — development should happen on feature branches", branch),
			Suggestion: "Create a feature branch: git checkout -b feature/<name>",
		})
	} else {
		report.Checks = append(report.Checks, PreflightCheck{
			ID:       "not-on-main",
			Name:     "Not On Main Branch",
			Severity: PreflightBlocking,
			Status:   PreflightPass,
			Message:  fmt.Sprintf("On branch '%s' (not main)", branch),
		})
	}
}

// checkCommitFormat verifies recent commits follow conventional format.
func checkCommitFormat(projectPath string, report *PreflightReport) {
	logCmd := exec.Command("git", "log", "--oneline", "--no-merges", "-20", "--format=%s")
	logCmd.Dir = projectPath
	hideExecWindow(logCmd)
	output, err := logCmd.Output()
	if err != nil {
		report.Checks = append(report.Checks, PreflightCheck{
			ID:       "commit-format",
			Name:     "Commit Format",
			Severity: PreflightWarning,
			Status:   PreflightFail,
			Message:  "Could not read git log",
		})
		return
	}

	subjects := strings.Split(strings.TrimSpace(string(output)), "\n")
	if len(subjects) == 0 || (len(subjects) == 1 && subjects[0] == "") {
		report.Checks = append(report.Checks, PreflightCheck{
			ID:       "commit-format",
			Name:     "Commit Format",
			Severity: PreflightWarning,
			Status:   PreflightPass,
			Message:  "No commits to check",
		})
		return
	}

	conventionalPattern := regexp.MustCompile(`^(feat|fix|chore|docs|test|refactor|perf): .+`)
	badCommits := []string{}
	for _, subject := range subjects {
		subject = strings.TrimSpace(subject)
		if subject == "" || strings.HasPrefix(subject, "Revert ") || strings.HasPrefix(subject, "Merge ") {
			continue
		}
		if !conventionalPattern.MatchString(subject) {
			badCommits = append(badCommits, subject)
		}
	}

	if len(badCommits) == 0 {
		report.Checks = append(report.Checks, PreflightCheck{
			ID:       "commit-format",
			Name:     "Commit Format",
			Severity: PreflightWarning,
			Status:   PreflightPass,
			Message:  fmt.Sprintf("All %d recent commits follow conventional format", len(subjects)),
		})
	} else {
		// Show up to 3 bad examples in the message.
		exampleCount := len(badCommits)
		if exampleCount > 3 {
			exampleCount = 3
		}
		examples := strings.Join(badCommits[:exampleCount], "; ")
		report.Checks = append(report.Checks, PreflightCheck{
			ID:         "commit-format",
			Name:       "Commit Format",
			Severity:   PreflightWarning,
			Status:     PreflightFail,
			Message:    fmt.Sprintf("%d of %d recent commits are not conventional format (e.g. '%s')", len(badCommits), len(subjects), examples),
			Suggestion: "Use 'type: description' format. Valid types: feat, fix, chore, docs, test, refactor, perf",
		})
	}
}

// checkGitHooksConfigured verifies git hooks are installed.
func checkGitHooksConfigured(projectPath string, report *PreflightReport) {
	hookCmd := exec.Command("git", "config", "--local", "--get", "core.hooksPath")
	hookCmd.Dir = projectPath
	hideExecWindow(hookCmd)
	hookOutput, err := hookCmd.Output()

	if err != nil {
		report.Checks = append(report.Checks, PreflightCheck{
			ID:         "git-hooks",
			Name:       "Git Hooks Configured",
			Severity:   PreflightWarning,
			Status:     PreflightFail,
			Message:    "Git hooks path not configured",
			Suggestion: "Apply the enterprise workflow to install hooks: .forge/hooks",
		})
		return
	}

	configuredPath := strings.TrimSpace(string(hookOutput))
	if configuredPath == ".forge/hooks" || configuredPath == ".forge\\hooks" {
		report.Checks = append(report.Checks, PreflightCheck{
			ID:       "git-hooks",
			Name:     "Git Hooks Configured",
			Severity: PreflightWarning,
			Status:   PreflightPass,
			Message:  "Git hooks configured to .forge/hooks",
		})
	} else {
		report.Checks = append(report.Checks, PreflightCheck{
			ID:         "git-hooks",
			Name:       "Git Hooks Configured",
			Severity:   PreflightWarning,
			Status:     PreflightFail,
			Message:    fmt.Sprintf("Git hooks path is '%s' (expected .forge/hooks)", configuredPath),
			Suggestion: "Run: git config --local core.hooksPath .forge/hooks",
		})
	}
}

// checkWorkflowConfig checks for .forge/workflow.json presence.
func checkWorkflowConfig(projectPath string, report *PreflightReport) {
	configPath := filepath.Join(projectPath, ".forge", "workflow.json")
	if fileExistsSimple(configPath) {
		report.Checks = append(report.Checks, PreflightCheck{
			ID:       "workflow-config",
			Name:     "Workflow Configuration",
			Severity: PreflightWarning,
			Status:   PreflightPass,
			Message:  ".forge/workflow.json present",
		})
	} else {
		report.Checks = append(report.Checks, PreflightCheck{
			ID:         "workflow-config",
			Name:       "Workflow Configuration",
			Severity:   PreflightWarning,
			Status:     PreflightFail,
			Message:    ".forge/workflow.json not found",
			Suggestion: "Apply a workflow preset from the Forge Terminal UI",
		})
	}
}

// checkGoBuilds attempts 'go build ./cmd/forge/' to verify the project compiles.
func checkGoBuilds(projectPath string, report *PreflightReport) {
	// Only run for Go projects — check for go.mod.
	goModPath := filepath.Join(projectPath, "go.mod")
	if !fileExistsSimple(goModPath) {
		return
	}

	buildCmd := exec.Command("go", "build", "./cmd/forge/")
	buildCmd.Dir = projectPath
	hideExecWindow(buildCmd)
	output, err := buildCmd.CombinedOutput()
	if err != nil {
		report.Checks = append(report.Checks, PreflightCheck{
			ID:         "go-build",
			Name:       "Go Build",
			Severity:   PreflightBlocking,
			Status:     PreflightFail,
			Message:    "go build ./cmd/forge/ failed",
			Suggestion: fmt.Sprintf("Fix build errors:\n%s", truncateOutput(string(output), 500)),
		})
	} else {
		report.Checks = append(report.Checks, PreflightCheck{
			ID:       "go-build",
			Name:     "Go Build",
			Severity: PreflightBlocking,
			Status:   PreflightPass,
			Message:  "go build ./cmd/forge/ succeeded",
		})
	}
}

// checkGoTests runs 'go test ./...' and reports pass/fail.
func checkGoTests(projectPath string, report *PreflightReport) {
	goModPath := filepath.Join(projectPath, "go.mod")
	if !fileExistsSimple(goModPath) {
		return
	}

	testCmd := exec.Command("go", "test", "./...")
	testCmd.Dir = projectPath
	hideExecWindow(testCmd)
	output, err := testCmd.CombinedOutput()
	if err != nil {
		report.Checks = append(report.Checks, PreflightCheck{
			ID:         "go-tests",
			Name:       "Go Tests",
			Severity:   PreflightBlocking,
			Status:     PreflightFail,
			Message:    "go test ./... failed",
			Suggestion: fmt.Sprintf("Fix failing tests:\n%s", truncateOutput(string(output), 500)),
		})
	} else {
		report.Checks = append(report.Checks, PreflightCheck{
			ID:       "go-tests",
			Name:     "Go Tests",
			Severity: PreflightBlocking,
			Status:   PreflightPass,
			Message:  "go test ./... passed",
		})
	}
}

// checkFrontendTests runs 'npx vitest run' if a frontend directory exists.
func checkFrontendTests(projectPath string, report *PreflightReport) {
	frontendDir := filepath.Join(projectPath, "frontend")
	if !fileExistsSimple(filepath.Join(frontendDir, "package.json")) {
		return
	}

	testCmd := exec.Command("npx", "vitest", "run")
	testCmd.Dir = frontendDir
	hideExecWindow(testCmd)
	output, err := testCmd.CombinedOutput()
	if err != nil {
		report.Checks = append(report.Checks, PreflightCheck{
			ID:         "frontend-tests",
			Name:       "Frontend Tests",
			Severity:   PreflightBlocking,
			Status:     PreflightFail,
			Message:    "npx vitest run failed",
			Suggestion: fmt.Sprintf("Fix failing frontend tests:\n%s", truncateOutput(string(output), 500)),
		})
	} else {
		report.Checks = append(report.Checks, PreflightCheck{
			ID:       "frontend-tests",
			Name:     "Frontend Tests",
			Severity: PreflightBlocking,
			Status:   PreflightPass,
			Message:  "Frontend tests passed",
		})
	}
}

// ─── Fix Prompt Generation ───────────────────────────────────────────────────

// generateFixPrompt creates a ready-to-paste message that a user can send to
// an AI agent to resolve all blocking and warning issues found during preflight.
// The prompt is specific enough that the agent can fix each issue without asking
// follow-up questions.
func generateFixPrompt(report *PreflightReport) string {
	var builder strings.Builder

	builder.WriteString("Fix these release preflight violations before we can release:\n\n")

	// Group by severity for clarity.
	blockingItems := []PreflightCheck{}
	warningItems := []PreflightCheck{}
	for _, check := range report.Checks {
		if check.Status == PreflightFail {
			if check.Severity == PreflightBlocking {
				blockingItems = append(blockingItems, check)
			} else {
				warningItems = append(warningItems, check)
			}
		}
	}

	if len(blockingItems) > 0 {
		builder.WriteString("## BLOCKING (must fix):\n")
		for i, item := range blockingItems {
			builder.WriteString(fmt.Sprintf("%d. **%s**: %s\n", i+1, item.Name, item.Message))
			if item.Suggestion != "" {
				builder.WriteString(fmt.Sprintf("   Fix: %s\n", item.Suggestion))
			}
		}
		builder.WriteString("\n")
	}

	if len(warningItems) > 0 {
		builder.WriteString("## WARNINGS (should fix):\n")
		for i, item := range warningItems {
			builder.WriteString(fmt.Sprintf("%d. **%s**: %s\n", i+1, item.Name, item.Message))
			if item.Suggestion != "" {
				builder.WriteString(fmt.Sprintf("   Fix: %s\n", item.Suggestion))
			}
		}
		builder.WriteString("\n")
	}

	builder.WriteString("After fixing all blocking issues, re-run the release.\n")

	return builder.String()
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// getCurrentBranch returns the current git branch name, or empty string on error.
func getCurrentBranch(projectPath string) string {
	cmd := exec.Command("git", "branch", "--show-current")
	cmd.Dir = projectPath
	hideExecWindow(cmd)
	output, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(output))
}

// truncateOutput caps a string at maxLen characters with a "... (truncated)" suffix.
func truncateOutput(output string, maxLen int) string {
	if len(output) <= maxLen {
		return strings.TrimSpace(output)
	}
	return strings.TrimSpace(output[:maxLen]) + "\n... (truncated)"
}
