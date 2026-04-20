package workflow

import (
	"os"
	"path/filepath"
	"strings"
)

// projectTypeIndicators maps indicator files to their project types.
// The detector checks for these files in order of specificity.
var projectTypeIndicators = []struct {
	fileName    string
	projectType ProjectType
}{
	{"go.mod", ProjectTypeGo},
	{"Cargo.toml", ProjectTypeRust},
	{"pom.xml", ProjectTypeJava},
	{"build.gradle", ProjectTypeJava},
	{"requirements.txt", ProjectTypePython},
	{"pyproject.toml", ProjectTypePython},
	{"setup.py", ProjectTypePython},
	{"package.json", ProjectTypeNode},
	{"*.csproj", ProjectTypeDotNet},
	{"*.sln", ProjectTypeDotNet},
}

// testDirectoryNames are common test folder names across ecosystems.
var testDirectoryNames = map[string]bool{
	"test":       true,
	"tests":      true,
	"__tests__":  true,
	"spec":       true,
	"test_data":  true,
	"testdata":   true,
}

// testFilePatterns are filename patterns that indicate test files.
var testFilePatterns = []string{
	"_test.go",
	".test.js",
	".test.jsx",
	".test.ts",
	".test.tsx",
	".spec.js",
	".spec.ts",
	"test_*.py",
	"*_test.py",
}

// DetectProject scans a project directory and returns information about its type,
// existing structure, and recommended workflow modules.
func DetectProject(projectPath string) (*ProjectDetection, error) {
	absolutePath, err := filepath.Abs(projectPath)
	if err != nil {
		return nil, err
	}

	projectName := filepath.Base(absolutePath)

	detection := &ProjectDetection{
		ProjectPath: absolutePath,
		ProjectName: projectName,
		ProjectType: ProjectTypeGeneric,
	}

	// Detect project type by checking for indicator files
	detection.ProjectType = detectProjectType(absolutePath)

	// Check for existing workflow-relevant structure
	detection.HasGit = directoryExists(absolutePath, ".git")
	detection.HasGitHub = directoryExists(absolutePath, ".github")
	detection.HasInstructions = fileExists(absolutePath, ".github", "copilot-instructions.md")
	detection.HasSkills = directoryExists(absolutePath, ".github", "skills")
	detection.HasChangelog = fileExists(absolutePath, "CHANGELOG.md")
	detection.HasWorkflow = fileExists(absolutePath, ".forge", "workflow.json")
	detection.HasTests = detectTests(absolutePath)

	// Collect existing workflow-related files for the UI
	detection.ExistingFiles = collectExistingWorkflowFiles(absolutePath)

	// Build recommendations based on what's missing
	detection.RecommendedModules = buildRecommendations(detection)

	return detection, nil
}

// detectProjectType checks for language/framework indicator files
// and returns the most specific project type found.
func detectProjectType(projectPath string) ProjectType {
	for _, indicator := range projectTypeIndicators {
		if strings.Contains(indicator.fileName, "*") {
			// Glob pattern — check for matching files
			matches, err := filepath.Glob(filepath.Join(projectPath, indicator.fileName))
			if err == nil && len(matches) > 0 {
				return indicator.projectType
			}
		} else {
			if fileExistsSimple(filepath.Join(projectPath, indicator.fileName)) {
				return indicator.projectType
			}
		}
	}
	return ProjectTypeGeneric
}

// detectTests checks for test directories or test files in the project.
func detectTests(projectPath string) bool {
	// Check for common test directories
	entries, err := os.ReadDir(projectPath)
	if err != nil {
		return false
	}

	for _, entry := range entries {
		if entry.IsDir() && testDirectoryNames[strings.ToLower(entry.Name())] {
			return true
		}
	}

	// Quick scan for test files in the root and first-level subdirectories
	for _, pattern := range testFilePatterns {
		matches, err := filepath.Glob(filepath.Join(projectPath, pattern))
		if err == nil && len(matches) > 0 {
			return true
		}
		matches, err = filepath.Glob(filepath.Join(projectPath, "*", pattern))
		if err == nil && len(matches) > 0 {
			return true
		}
	}

	return false
}

// collectExistingWorkflowFiles returns paths of files that the workflow system
// would generate, if they already exist.
func collectExistingWorkflowFiles(projectPath string) []string {
	var found []string

	candidatePaths := []string{
		filepath.Join(".github", "copilot-instructions.md"),
		filepath.Join(".github", "pull_request_template.md"),
		filepath.Join(".github", "skills", "branching-strategy", "SKILL.md"),
		filepath.Join(".github", "skills", "code-quality", "SKILL.md"),
		filepath.Join(".github", "skills", "testing-standards", "SKILL.md"),
		filepath.Join(".github", "skills", "pr-workflow", "SKILL.md"),
		filepath.Join(".github", "skills", "documentation", "SKILL.md"),
		filepath.Join(".github", "skills", "multi-agent", "SKILL.md"),
		filepath.Join(".github", "skills", "workflow-enforcer", "SKILL.md"),
		filepath.Join(".forge", "workflow.json"),
		filepath.Join(".forge", "hooks", "pre-commit-validate.ps1"),
		filepath.Join(".forge", "hooks", "pre-commit-validate.sh"),
		"CHANGELOG.md",
	}

	for _, candidatePath := range candidatePaths {
		fullPath := filepath.Join(projectPath, candidatePath)
		if fileExistsSimple(fullPath) {
			found = append(found, candidatePath)
		}
	}

	return found
}

// buildRecommendations suggests which modules should be enabled based on
// what the project already has and what's missing.
func buildRecommendations(detection *ProjectDetection) []ModuleID {
	recommended := []ModuleID{
		ModuleCopilotInstructions, // Always recommended
		ModuleWorkflowEnforcer,    // Always recommended (primary enforcement)
	}

	if !detection.HasSkills {
		recommended = append(recommended,
			ModuleBranchingStrategy,
			ModuleCodeQuality,
			ModuleTestingStandards,
			ModulePRWorkflow,
			ModuleDocumentation,
			ModuleMultiAgent,
		)
	}

	if !detection.HasChangelog {
		// Documentation module creates CHANGELOG.md
		if !containsModule(recommended, ModuleDocumentation) {
			recommended = append(recommended, ModuleDocumentation)
		}
	}

	// Code Tutor integration is always recommended for learning

	// Enforcement layers
	if detection.HasGit {
		recommended = append(recommended, ModuleGitHooks)
	}
	if detection.HasGitHub {
		recommended = append(recommended, ModulePRTemplate)
	}

	return recommended
}

// containsModule checks if a module ID is already in the slice.
func containsModule(modules []ModuleID, target ModuleID) bool {
	for _, moduleID := range modules {
		if moduleID == target {
			return true
		}
	}
	return false
}

// directoryExists checks whether a directory exists at the given path segments
// joined under the base path.
func directoryExists(basePath string, pathSegments ...string) bool {
	fullPath := filepath.Join(append([]string{basePath}, pathSegments...)...)
	info, err := os.Stat(fullPath)
	return err == nil && info.IsDir()
}

// fileExists checks whether a file exists at the given path segments
// joined under the base path.
func fileExists(basePath string, pathSegments ...string) bool {
	return fileExistsSimple(filepath.Join(append([]string{basePath}, pathSegments...)...))
}

// fileExistsSimple checks whether a regular file exists at the given path.
func fileExistsSimple(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}
