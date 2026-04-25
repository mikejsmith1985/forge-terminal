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

	if config.HasModule(ModuleTestingStandards) {
		scanTestCoverage(absolutePath, report)
	}

	if config.HasModule(ModuleBranchingStrategy) {
		scanCommitMessageFormat(absolutePath, report)
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
	hideExecWindow(branchCommand) // Prevent CMD window flash on Windows
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
			Suggestion: "Run the Forge Workflow to generate a CHANGELOG.md",
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
	hideExecWindow(hookConfigCommand) // Prevent CMD window flash on Windows
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

// testFileExtensionMap maps source file extensions to their expected test file
// suffixes. Each source extension may have multiple valid test patterns.
var testFileExtensionMap = map[string][]string{
	".go":   {"_test.go"},
	".js":   {".test.js", ".spec.js"},
	".jsx":  {".test.jsx", ".spec.jsx"},
	".ts":   {".test.ts", ".spec.ts"},
	".tsx":  {".test.tsx", ".spec.tsx"},
	".py":   {"_test.py", "test_"},
	".rs":   {"_test.rs"},
	".java": {"Test.java"},
	".cs":   {"Tests.cs", "Test.cs"},
}

// complianceTestFileSuffixes identifies files that are themselves tests, not source
// files that need test coverage. Used to exclude test files from the coverage check.
var complianceTestFileSuffixes = []string{
	"_test.go", ".test.js", ".test.jsx", ".test.ts", ".test.tsx",
	".spec.js", ".spec.jsx", ".spec.ts", ".spec.tsx",
	"_test.py", "_test.rs",
}

// scanTestCoverage checks that source files have corresponding test files.
// Only scans files in the project tree, excluding vendor/node_modules/dist.
func scanTestCoverage(projectPath string, report *ComplianceReport) {
	sourceFilesWithoutTests := []string{}

	walkError := filepath.WalkDir(projectPath, func(path string, directoryEntry os.DirEntry, err error) error {
		if err != nil {
			return nil
		}

		if directoryEntry.IsDir() {
			dirName := directoryEntry.Name()
			// Skip directories that don't contain user-written source code
			if dirName == ".git" || dirName == "node_modules" || dirName == "vendor" ||
				dirName == "dist" || dirName == "build" || dirName == ".forge" ||
				dirName == "web" || dirName == "test-data" || dirName == "dev-data" {
				return filepath.SkipDir
			}
			return nil
		}

		fileExtension := strings.ToLower(filepath.Ext(directoryEntry.Name()))
		testSuffixes, isSourceExtension := testFileExtensionMap[fileExtension]
		if !isSourceExtension {
			return nil
		}

		// Skip files that are themselves test files
		fileName := directoryEntry.Name()
		for _, testPattern := range complianceTestFileSuffixes {
			if strings.HasSuffix(fileName, testPattern) || strings.HasPrefix(fileName, "test_") {
				return nil
			}
		}

		// Check if a corresponding test file exists
		basePath := path[:len(path)-len(fileExtension)]
		hasTestFile := false
		for _, testSuffix := range testSuffixes {
			candidateTestPath := basePath + testSuffix
			if fileExistsSimple(candidateTestPath) {
				hasTestFile = true
				break
			}
		}

		if !hasTestFile {
			relativePath, _ := filepath.Rel(projectPath, path)
			relativePath = filepath.ToSlash(relativePath)
			sourceFilesWithoutTests = append(sourceFilesWithoutTests, relativePath)
		}

		return nil
	})

	if walkError != nil {
		report.Findings = append(report.Findings, ComplianceFinding{
			Rule:    "Test Coverage",
			Level:   ComplianceWarning,
			Message: fmt.Sprintf("Could not complete test coverage scan: %s", walkError),
		})
		return
	}

	if len(sourceFilesWithoutTests) == 0 {
		report.Findings = append(report.Findings, ComplianceFinding{
			Rule:    "Test Coverage",
			Level:   CompliancePassing,
			Message: "All source files have corresponding test files",
		})
	} else {
		// Report up to 10 uncovered files to avoid noise
		maxFilesToReport := 10
		reportedFiles := sourceFilesWithoutTests
		if len(reportedFiles) > maxFilesToReport {
			reportedFiles = reportedFiles[:maxFilesToReport]
		}

		for _, uncoveredFile := range reportedFiles {
			report.Findings = append(report.Findings, ComplianceFinding{
				Rule:       "Test Coverage",
				Level:      ComplianceWarning,
				FilePath:   uncoveredFile,
				Message:    fmt.Sprintf("Source file '%s' has no corresponding test file", uncoveredFile),
				Suggestion: "Create a test file alongside the source file",
			})
		}

		if len(sourceFilesWithoutTests) > maxFilesToReport {
			report.Findings = append(report.Findings, ComplianceFinding{
				Rule:    "Test Coverage",
				Level:   ComplianceWarning,
				Message: fmt.Sprintf("... and %d more source files without tests", len(sourceFilesWithoutTests)-maxFilesToReport),
			})
		}
	}
}

// commitMessageFormatPattern matches the conventional commit format: type: description
var commitMessageFormatPattern = regexp.MustCompile(
	`^(feat|fix|chore|docs|test|refactor|perf): .+`,
)

// scanCommitMessageFormat checks the last few commits for conventional format.
// Skips merge commits and revert commits since those have their own format.
func scanCommitMessageFormat(projectPath string, report *ComplianceReport) {
	// Get the last 10 commit subjects
	logCommand := exec.Command("git", "log", "--oneline", "--no-merges", "-10", "--format=%s")
	logCommand.Dir = projectPath
	hideExecWindow(logCommand)
	logOutput, commandError := logCommand.Output()
	if commandError != nil {
		report.Findings = append(report.Findings, ComplianceFinding{
			Rule:    "Commit Message Format",
			Level:   ComplianceWarning,
			Message: "Could not read git log (not a git repository?)",
		})
		return
	}

	commitSubjects := strings.Split(strings.TrimSpace(string(logOutput)), "\n")
	if len(commitSubjects) == 0 || (len(commitSubjects) == 1 && commitSubjects[0] == "") {
		report.Findings = append(report.Findings, ComplianceFinding{
			Rule:    "Commit Message Format",
			Level:   CompliancePassing,
			Message: "No commits to check",
		})
		return
	}

	badCommitCount := 0
	for _, subject := range commitSubjects {
		subject = strings.TrimSpace(subject)
		if subject == "" {
			continue
		}
		// Skip revert commits — they have a different conventional format
		if strings.HasPrefix(subject, "Revert ") {
			continue
		}
		if !commitMessageFormatPattern.MatchString(subject) {
			badCommitCount++
		}
	}

	totalChecked := len(commitSubjects)
	if badCommitCount == 0 {
		report.Findings = append(report.Findings, ComplianceFinding{
			Rule:    "Commit Message Format",
			Level:   CompliancePassing,
			Message: fmt.Sprintf("All %d recent commits follow conventional format", totalChecked),
		})
	} else {
		report.Findings = append(report.Findings, ComplianceFinding{
			Rule:       "Commit Message Format",
			Level:      ComplianceWarning,
			Message:    fmt.Sprintf("%d of %d recent commits do not follow 'type: description' format", badCommitCount, totalChecked),
			Suggestion: "Use commit-msg hook to enforce format: feat|fix|chore|docs|test|refactor|perf: description",
		})
	}
}
