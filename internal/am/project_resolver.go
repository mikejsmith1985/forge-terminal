// Package am provides project context resolution for session management.
package am

import (
	"bufio"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// =============================================================================
// Project Context Resolution
// =============================================================================

// ResolveProjectContext detects project information from a working directory
func ResolveProjectContext(workingDir string) ProjectContext {
	ctx := ProjectContext{
		Name: "adhoc",
		Path: workingDir,
	}

	if workingDir == "" {
		return ctx
	}

	// Check if path exists
	if _, err := os.Stat(workingDir); os.IsNotExist(err) {
		return ctx
	}

	// Normalize path
	absPath, err := filepath.Abs(workingDir)
	if err == nil {
		ctx.Path = absPath
	}

	// Try to find git repository
	gitRoot := findGitRootDir(workingDir)
	if gitRoot != "" {
		// Use git repo name
		ctx.Name = SanitizeProjectNameForSession(filepath.Base(gitRoot))
		ctx.GitBranch = getGitBranchFromDir(gitRoot)
		ctx.GitRemote = DetectGitRemote(gitRoot)
		return ctx
	}

	// Try to detect project from markers
	projectDir := findProjectRootByMarkers(workingDir)
	if projectDir != "" {
		ctx.Name = SanitizeProjectNameForSession(filepath.Base(projectDir))
		return ctx
	}

	// Fall back to directory basename
	base := filepath.Base(workingDir)
	sanitized := SanitizeProjectNameForSession(base)
	if sanitized != "" && sanitized != "adhoc" {
		ctx.Name = sanitized
	}

	return ctx
}

// findGitRootDir searches upward for a .git directory
func findGitRootDir(startDir string) string {
	current := startDir
	for {
		gitPath := filepath.Join(current, ".git")
		if info, err := os.Stat(gitPath); err == nil && info.IsDir() {
			return current
		}

		parent := filepath.Dir(current)
		if parent == current {
			// Reached root
			return ""
		}
		current = parent
	}
}

// getGitBranchFromDir reads the current branch from a git repo
func getGitBranchFromDir(gitRoot string) string {
	headPath := filepath.Join(gitRoot, ".git", "HEAD")
	data, err := os.ReadFile(headPath)
	if err != nil {
		return ""
	}

	content := strings.TrimSpace(string(data))

	// Format: "ref: refs/heads/branch-name"
	if strings.HasPrefix(content, "ref: refs/heads/") {
		return strings.TrimPrefix(content, "ref: refs/heads/")
	}

	// Detached HEAD - return short SHA
	if len(content) >= 7 {
		return content[:7]
	}

	return content
}

// findProjectRootByMarkers searches for common project marker files
func findProjectRootByMarkers(startDir string) string {
	markers := []string{
		"package.json",
		"go.mod",
		"Cargo.toml",
		"pom.xml",
		"pyproject.toml",
		"setup.py",
		"composer.json",
		"Gemfile",
		"build.gradle",
		"CMakeLists.txt",
		"Makefile",
	}

	current := startDir
	for {
		for _, marker := range markers {
			markerPath := filepath.Join(current, marker)
			if _, err := os.Stat(markerPath); err == nil {
				return current
			}
		}

		parent := filepath.Dir(current)
		if parent == current {
			// Reached root
			return ""
		}
		current = parent
	}
}

// =============================================================================
// Git Remote Detection
// =============================================================================

// DetectGitRemote parses the origin remote URL from git config
func DetectGitRemote(gitRoot string) string {
	configPath := filepath.Join(gitRoot, ".git", "config")
	file, err := os.Open(configPath)
	if err != nil {
		return ""
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	inOriginSection := false

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())

		// Check for [remote "origin"] section
		if strings.HasPrefix(line, "[remote \"origin\"]") {
			inOriginSection = true
			continue
		}

		// Check if we've left the section
		if inOriginSection && strings.HasPrefix(line, "[") {
			break
		}

		// Parse url line
		if inOriginSection && strings.HasPrefix(line, "url = ") {
			url := strings.TrimPrefix(line, "url = ")
			return normalizeGitRemote(url)
		}
	}

	return ""
}

// normalizeGitRemote converts various git URL formats to a consistent form
func normalizeGitRemote(url string) string {
	// Remove .git suffix
	url = strings.TrimSuffix(url, ".git")

	// Handle SSH format: git@github.com:user/repo
	if strings.HasPrefix(url, "git@") {
		// git@github.com:user/repo -> github.com/user/repo
		url = strings.TrimPrefix(url, "git@")
		url = strings.Replace(url, ":", "/", 1)
		return url
	}

	// Handle HTTPS format: https://github.com/user/repo
	if strings.HasPrefix(url, "https://") {
		return strings.TrimPrefix(url, "https://")
	}

	// Handle HTTP format: http://github.com/user/repo
	if strings.HasPrefix(url, "http://") {
		return strings.TrimPrefix(url, "http://")
	}

	return url
}

// =============================================================================
// Name Sanitization
// =============================================================================

// SanitizeProjectNameForSession creates a filesystem-safe project name
func SanitizeProjectNameForSession(name string) string {
	if name == "" {
		return "adhoc"
	}

	// Get just the basename if it's a path
	name = filepath.Base(name)

	// Trim whitespace
	name = strings.TrimSpace(name)
	if name == "" {
		return "adhoc"
	}

	// Convert to lowercase
	name = strings.ToLower(name)

	// Replace unsafe characters with dashes
	// Keep only alphanumeric, dash, underscore
	var result strings.Builder
	for _, r := range name {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			result.WriteRune(r)
		} else {
			result.WriteRune('-')
		}
	}
	name = result.String()

	// Remove consecutive dashes
	re := regexp.MustCompile(`-+`)
	name = re.ReplaceAllString(name, "-")

	// Remove leading/trailing dashes
	name = strings.Trim(name, "-")

	// Limit length
	if len(name) > 50 {
		name = name[:50]
	}

	if name == "" {
		return "adhoc"
	}

	return name
}
