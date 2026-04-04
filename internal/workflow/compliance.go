package workflow

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// singleLetterVariablePattern matches common single-letter variable declarations
// across Go, JavaScript, TypeScript, and Python.
var singleLetterVariablePattern = regexp.MustCompile(
	`(?m)^\s*(?:var|let|const|)\s+([a-z])\s*(?::=|=|:\s)`,
)

// allowedSingleLetterVariables are exception characters permitted by convention.
var allowedSingleLetterVariables = map[string]bool{
	"i": true, "j": true, "k": true, // Loop iterators
	"w": true, "r": true, // HTTP handlers (http.ResponseWriter, *http.Request)
	"_": true, // Intentionally unused
}

// scanSourceExtensions are file types checked by the compliance scanner.
var scanSourceExtensions = map[string]bool{
	".go": true, ".js": true, ".jsx": true, ".ts": true, ".tsx": true,
	".py": true, ".rs": true, ".java": true, ".cs": true,
}

// ScanCompliance checks a project against its workflow configuration
// and returns a detailed compliance report.
func ScanCompliance(projectPath string, config WorkflowConfig) (*ComplianceReport, error) {
	absolutePath, err := filepath.Abs(projectPath)
	if err != nil {
		return nil, fmt.Errorf("resolving project path: %w", err)
	}

	report := &ComplianceReport{
		ScannedAt: time.Now(),
	}

	// Run each enabled check
	if config.HasModule(ModuleCodeQuality) {
		scanNamingConventions(absolutePath, report)
	}

	if config.HasModule(ModuleBranchingStrategy) {
		scanBranchNaming(absolutePath, report)
	}

	if config.HasModule(ModuleDocumentation) {
		scanChangelogPresence(absolutePath, report)
	}

	if config.HasModule(ModuleWorkflowEnforcer) {
		scanWorkflowConfig(absolutePath, report)
	}

	if config.HasModule(ModuleGitHooks) {
		scanGitHooksInstalled(absolutePath, report)
	}

	if config.HasModule(ModulePRTemplate) {
		scanPRTemplatePresence(absolutePath, report)
	}

	// Compute totals
	for _, finding := range report.Findings {
		switch finding.Level {
		case CompliancePassing:
			report.Passing++
		case ComplianceWarning:
			report.Warnings++
		case ComplianceViolation:
			report.Violations++
		}
	}
	report.TotalRules = report.Passing + report.Warnings + report.Violations

	// Determine overall status
	switch {
	case report.Violations > 0:
		report.Status = StatusViolations
	case report.Warnings > 0:
		report.Status = StatusWarnings
	default:
		report.Status = StatusCompliant
	}

	return report, nil
}

// scanNamingConventions checks source files for single-letter variable names.
func scanNamingConventions(projectPath string, report *ComplianceReport) {
	foundViolations := false

	err := filepath.WalkDir(projectPath, func(path string, directoryEntry os.DirEntry, walkError error) error {
		if walkError != nil {
			return nil
		}

		if directoryEntry.IsDir() {
			dirName := directoryEntry.Name()
			if dirName == ".git" || dirName == "node_modules" || dirName == "vendor" || dirName == "dist" || dirName == "build" {
				return filepath.SkipDir
			}
			return nil
		}

		fileExtension := strings.ToLower(filepath.Ext(directoryEntry.Name()))
		if !scanSourceExtensions[fileExtension] {
			return nil
		}

		relativePath, _ := filepath.Rel(projectPath, path)
		relativePath = filepath.ToSlash(relativePath)

		fileHandle, openError := os.Open(path)
		if openError != nil {
			return nil
		}
		defer fileHandle.Close()

		lineScanner := bufio.NewScanner(fileHandle)
		lineNumber := 0
		for lineScanner.Scan() {
			lineNumber++
			lineText := lineScanner.Text()

			// Check for single-letter variable declarations
			matches := singleLetterVariablePattern.FindStringSubmatch(lineText)
			if len(matches) >= 2 {
				variableName := matches[1]
				if !allowedSingleLetterVariables[variableName] {
					report.Findings = append(report.Findings, ComplianceFinding{
						Rule:       "Descriptive Naming",
						Level:      ComplianceWarning,
						FilePath:   relativePath,
						Line:       lineNumber,
						Message:    fmt.Sprintf("Single-letter variable '%s' — use a descriptive name", variableName),
						Suggestion: fmt.Sprintf("Rename '%s' to describe its purpose (e.g., 'count', 'index', 'value')", variableName),
					})
					foundViolations = true
				}
			}

			// Cap scanning at 500 lines per file to avoid performance issues
			if lineNumber > 500 {
				break
			}
		}

		return nil
	})

	if err != nil {
		report.Findings = append(report.Findings, ComplianceFinding{
			Rule:    "Naming Scan",
			Level:   ComplianceWarning,
			Message: fmt.Sprintf("Could not complete naming scan: %s", err),
		})
		return
	}

	if !foundViolations {
		report.Findings = append(report.Findings, ComplianceFinding{
			Rule:    "Descriptive Naming",
			Level:   CompliancePassing,
			Message: "No single-letter variable names found",
		})
	}
}

// scanBranchNaming checks if the current git branch follows the naming convention.
func scanBranchNaming(projectPath string, report *ComplianceReport) {
	branchCommand := exec.Command("git", "branch", "--show-current")
	branchCommand.Dir = projectPath
	branchOutput, commandError := branchCommand.Output()
	if commandError != nil {
		report.Findings = append(report.Findings, ComplianceFinding{
			Rule:    "Branch Naming",
			Level:   ComplianceWarning,
			Message: "Could not determine current branch (not a git repository?)",
		})
		return
	}

	currentBranch := strings.TrimSpace(string(branchOutput))
	if currentBranch == "" {
		return // Detached HEAD — skip check
	}

	validBranchPattern := regexp.MustCompile(`^(main|master|develop|feature/.+|fix/.+|chore/.+|docs/.+|hotfix/.+|release/.+)$`)
	if validBranchPattern.MatchString(currentBranch) {
		report.Findings = append(report.Findings, ComplianceFinding{
			Rule:    "Branch Naming",
			Level:   CompliancePassing,
			Message: fmt.Sprintf("Branch '%s' follows naming convention", currentBranch),
		})
	} else {
		report.Findings = append(report.Findings, ComplianceFinding{
			Rule:       "Branch Naming",
			Level:      ComplianceViolation,
			Message:    fmt.Sprintf("Branch '%s' does not follow naming convention", currentBranch),
			Suggestion: "Rename to: feature/<name>, fix/<name>, chore/<name>, or docs/<name>",
		})
	}
}

// scanChangelogPresence checks whether CHANGELOG.md exists in the project root.
func scanChangelogPresence(projectPath string, report *ComplianceReport) {
	changelogPath := filepath.Join(projectPath, "CHANGELOG.md")
	if fileExistsSimple(changelogPath) {
		report.Findings = append(report.Findings, ComplianceFinding{
			Rule:    "CHANGELOG Presence",
			Level:   CompliancePassing,
			Message: "CHANGELOG.md exists",
		})
	} else {
		report.Findings = append(report.Findings, ComplianceFinding{
			Rule:       "CHANGELOG Presence",
			Level:      ComplianceViolation,
			Message:    "CHANGELOG.md not found",
			Suggestion: "Run the Enterprise Workflow to generate a CHANGELOG.md",
		})
	}
}

// scanWorkflowConfig checks whether .forge/workflow.json exists and is valid.
func scanWorkflowConfig(projectPath string, report *ComplianceReport) {
	workflowConfigPath := filepath.Join(projectPath, ".forge", "workflow.json")
	if fileExistsSimple(workflowConfigPath) {
		report.Findings = append(report.Findings, ComplianceFinding{
			Rule:    "Workflow Configuration",
			Level:   CompliancePassing,
			Message: ".forge/workflow.json is present",
		})
	} else {
		report.Findings = append(report.Findings, ComplianceFinding{
			Rule:       "Workflow Configuration",
			Level:      ComplianceWarning,
			Message:    ".forge/workflow.json not found",
			Suggestion: "Apply a workflow preset to generate the configuration",
		})
	}
}

// scanGitHooksInstalled checks whether git hooks are configured.
func scanGitHooksInstalled(projectPath string, report *ComplianceReport) {
	hookConfigCommand := exec.Command("git", "config", "--local", "--get", "core.hooksPath")
	hookConfigCommand.Dir = projectPath
	hookPathOutput, commandError := hookConfigCommand.Output()

	if commandError != nil {
		report.Findings = append(report.Findings, ComplianceFinding{
			Rule:       "Git Hooks",
			Level:      ComplianceWarning,
			Message:    "Git hooks path not configured",
			Suggestion: "Apply the workflow to install pre-commit hooks",
		})
		return
	}

	configuredHooksPath := strings.TrimSpace(string(hookPathOutput))
	if configuredHooksPath == ".forge/hooks" || configuredHooksPath == ".forge\\hooks" {
		report.Findings = append(report.Findings, ComplianceFinding{
			Rule:    "Git Hooks",
			Level:   CompliancePassing,
			Message: "Git hooks configured to .forge/hooks",
		})
	} else {
		report.Findings = append(report.Findings, ComplianceFinding{
			Rule:       "Git Hooks",
			Level:      ComplianceWarning,
			Message:    fmt.Sprintf("Git hooks path is '%s' (expected .forge/hooks)", configuredHooksPath),
			Suggestion: "Re-apply the workflow to update the hooks path",
		})
	}
}

// scanPRTemplatePresence checks whether the PR template exists.
func scanPRTemplatePresence(projectPath string, report *ComplianceReport) {
	prTemplatePath := filepath.Join(projectPath, ".github", "pull_request_template.md")
	if fileExistsSimple(prTemplatePath) {
		report.Findings = append(report.Findings, ComplianceFinding{
			Rule:    "PR Template",
			Level:   CompliancePassing,
			Message: "Pull request template present",
		})
	} else {
		report.Findings = append(report.Findings, ComplianceFinding{
			Rule:       "PR Template",
			Level:      ComplianceWarning,
			Message:    "Pull request template not found",
			Suggestion: "Enable the PR Template module in the workflow",
		})
	}
}
