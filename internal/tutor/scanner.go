package tutor

import (
	"bufio"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// lockFiles are dependency lock files that should be excluded.
var lockFiles = map[string]bool{
	"package-lock.json": true,
	"go.sum":            true,
	"yarn.lock":         true,
	"pnpm-lock.yaml":    true,
	"Pipfile.lock":      true,
	"poetry.lock":       true,
	"Cargo.lock":        true,
}

// ScanProject analyzes a project directory and returns an ordered LearningPath.
func ScanProject(projectPath string) (*LearningPath, error) {
	absPath, err := filepath.Abs(projectPath)
	if err != nil {
		return nil, fmt.Errorf("resolving project path: %w", err)
	}

	info, err := os.Stat(absPath)
	if err != nil {
		return nil, fmt.Errorf("accessing project path: %w", err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("project path is not a directory: %s", absPath)
	}

	log.Printf("[Tutor Scanner] Scanning project: %s", absPath)

	projectType := detectProjectType(absPath)
	log.Printf("[Tutor Scanner] Detected project type: %s", projectType)

	var files []FileEntry
	err = filepath.WalkDir(absPath, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			log.Printf("[Tutor Scanner] Error accessing %s: %v", path, err)
			return nil // continue walking despite errors
		}

		if d.IsDir() {
			if ignoredDirs[d.Name()] {
				return filepath.SkipDir
			}
			return nil
		}

		relPath, err := filepath.Rel(absPath, path)
		if err != nil {
			return nil
		}
		// Normalize to forward slashes for consistent cross-platform paths.
		relPath = filepath.ToSlash(relPath)

		if !shouldIncludeFile(relPath, path) {
			return nil
		}

		lineCount, err := countLines(path)
		if err != nil {
			log.Printf("[Tutor Scanner] Error counting lines for %s: %v", relPath, err)
			return nil
		}

		category := classifyFile(relPath, projectType)
		entry := FileEntry{
			Path:       relPath,
			Category:   category,
			Complexity: calculateComplexity(lineCount, category),
			DependsOn:  []string{},
			Summary:    generateSummary(relPath, category),
			LineCount:  lineCount,
		}
		files = append(files, entry)
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("walking project directory: %w", err)
	}

	orderMap := categoryOrder()
	sort.SliceStable(files, func(i, j int) bool {
		oi := orderMap[files[i].Category]
		oj := orderMap[files[j].Category]
		if oi != oj {
			return oi < oj
		}
		// Within the same category, sort by complexity ascending then path.
		if files[i].Complexity != files[j].Complexity {
			return files[i].Complexity < files[j].Complexity
		}
		return files[i].Path < files[j].Path
	})

	projectName := filepath.Base(absPath)

	lp := &LearningPath{
		ProjectPath: absPath,
		ProjectType: projectType,
		ProjectName: projectName,
		Files:       files,
		GeneratedAt: time.Now(),
	}

	log.Printf("[Tutor Scanner] Scan complete: %d files in learning path", len(files))
	return lp, nil
}

// detectProjectType inspects manifest files to determine the project's primary language.
func detectProjectType(projectPath string) ProjectType {
	// Ordered by specificity — check more definitive manifests first.
	checks := []struct {
		file    string
		ptype   ProjectType
	}{
		{"go.mod", ProjectGo},
		{"Cargo.toml", ProjectRust},
		{"pom.xml", ProjectJava},
		{"build.gradle", ProjectJava},
		{"pyproject.toml", ProjectPython},
		{"setup.py", ProjectPython},
		{"requirements.txt", ProjectPython},
		{"Pipfile", ProjectPython},
		{"package.json", ProjectNode},
	}

	for _, c := range checks {
		if _, err := os.Stat(filepath.Join(projectPath, c.file)); err == nil {
			return c.ptype
		}
	}

	return ProjectGeneric
}

// classifyFile determines the FileCategory for a given relative path.
func classifyFile(relPath string, projectType ProjectType) FileCategory {
	base := strings.ToLower(filepath.Base(relPath))
	dir := strings.ToLower(filepath.Dir(relPath))
	ext := strings.ToLower(filepath.Ext(relPath))
	nameNoExt := strings.TrimSuffix(base, ext)

	// Tests — check early to avoid mis-classifying test helpers as utils.
	if isTestFile(base, ext) {
		return CategoryTests
	}

	// Docs
	if ext == ".md" {
		return CategoryDocs
	}

	// Assets (images, fonts — though these are mostly filtered out by extension)
	assetExts := map[string]bool{".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".svg": true, ".ico": true, ".woff": true, ".woff2": true, ".ttf": true, ".eot": true}
	if assetExts[ext] {
		return CategoryAssets
	}

	// UI files
	if ext == ".jsx" || ext == ".tsx" || ext == ".vue" || ext == ".svelte" || ext == ".css" || ext == ".scss" {
		return CategoryUI
	}

	// Config files — root-level manifests and configuration.
	if isConfigFile(base, ext, relPath) {
		return CategoryConfig
	}

	// Handlers / controllers / routes / API endpoints / middleware
	handlerKeywords := []string{"handler", "controller", "route", "api", "endpoint", "middleware"}
	for _, kw := range handlerKeywords {
		if strings.Contains(nameNoExt, kw) || strings.Contains(dir, kw) {
			return CategoryHandlers
		}
	}

	// Types / models / schemas / interfaces
	typeKeywords := []string{"type", "model", "schema", "interface", "entity", "dto"}
	for _, kw := range typeKeywords {
		if strings.Contains(nameNoExt, kw) {
			return CategoryTypes
		}
	}
	if projectType == ProjectGo && ext == ".go" {
		if strings.HasSuffix(nameNoExt, "s") {
			singular := strings.TrimSuffix(nameNoExt, "s")
			for _, kw := range typeKeywords {
				if strings.Contains(singular, kw) {
					return CategoryTypes
				}
			}
		}
	}

	// Utils / helpers / common / shared / lib
	utilKeywords := []string{"util", "helper", "common", "shared", "lib"}
	for _, kw := range utilKeywords {
		if strings.Contains(nameNoExt, kw) || strings.Contains(dir, kw) {
			return CategoryUtils
		}
	}

	// Everything else is core business logic.
	return CategoryCore
}

// isTestFile checks whether a filename represents a test file.
func isTestFile(base, ext string) bool {
	if strings.HasSuffix(base, "_test.go") {
		return true
	}
	nameNoExt := strings.TrimSuffix(base, ext)
	testSuffixes := []string{".test", ".spec", "_test", "_spec"}
	for _, suffix := range testSuffixes {
		if strings.HasSuffix(nameNoExt, suffix) {
			return true
		}
	}
	if strings.HasPrefix(base, "test_") {
		return true
	}
	return false
}

// isConfigFile determines whether a file should be classified as configuration.
func isConfigFile(base, ext, relPath string) bool {
	// Exact root-level config filenames
	rootConfigs := map[string]bool{
		"go.mod":         true,
		"go.sum":         true,
		"package.json":   true,
		"tsconfig.json":  true,
		"makefile":       true,
		"dockerfile":     true,
		"docker-compose.yml": true,
		"docker-compose.yaml": true,
		".gitignore":    true,
		".eslintrc.json": true,
		".eslintrc.js":  true,
		".prettierrc":   true,
		"jest.config.js": true,
		"jest.config.ts": true,
		"vite.config.js": true,
		"vite.config.ts": true,
		"webpack.config.js": true,
		"next.config.js":    true,
		"next.config.mjs":   true,
		"tailwind.config.js": true,
		"postcss.config.js":  true,
		"cargo.toml":    true,
		"setup.py":      true,
		"setup.cfg":     true,
		"pyproject.toml": true,
		"pom.xml":       true,
		"build.gradle":  true,
	}
	if rootConfigs[base] {
		return true
	}

	// .toml files are typically config
	if ext == ".toml" {
		return true
	}

	// .yaml/.yml files at root level are typically config
	if (ext == ".yaml" || ext == ".yml") && !strings.Contains(relPath, "/") {
		return true
	}

	// Dotfiles that start with a period (like .env, .babelrc)
	if strings.HasPrefix(base, ".") && ext != ".go" && ext != ".js" && ext != ".ts" && ext != ".py" {
		return true
	}

	return false
}

// categoryOrder returns a map of FileCategory to its teaching order position.
func categoryOrder() map[FileCategory]int {
	return map[FileCategory]int{
		CategoryConfig:   0,
		CategoryTypes:    1,
		CategoryUtils:    2,
		CategoryCore:     3,
		CategoryHandlers: 4,
		CategoryUI:       5,
		CategoryTests:    6,
		CategoryDocs:     7,
		CategoryAssets:   8,
	}
}

// generateSummary produces a brief human-readable description of a file based on its path and category.
func generateSummary(relPath string, category FileCategory) string {
	base := filepath.Base(relPath)
	ext := strings.ToLower(filepath.Ext(relPath))
	nameNoExt := strings.TrimSuffix(base, ext)
	dir := filepath.Dir(relPath)

	lang := languageFromExt(ext)

	switch category {
	case CategoryConfig:
		return configSummary(base, ext)
	case CategoryTypes:
		return fmt.Sprintf("%s type/model definitions", lang)
	case CategoryUtils:
		return fmt.Sprintf("%s utility functions", lang)
	case CategoryHandlers:
		return handlerSummary(nameNoExt, lang)
	case CategoryUI:
		return uiSummary(base, ext, dir)
	case CategoryTests:
		return fmt.Sprintf("%s tests", lang)
	case CategoryDocs:
		return docSummary(base)
	case CategoryAssets:
		return "Project asset"
	case CategoryCore:
		return coreSummary(nameNoExt, lang, dir)
	}

	return fmt.Sprintf("%s source file", lang)
}

func configSummary(base, ext string) string {
	lower := strings.ToLower(base)
	switch {
	case lower == "go.mod":
		return "Go module configuration"
	case lower == "package.json":
		return "Node.js package configuration"
	case lower == "tsconfig.json":
		return "TypeScript compiler configuration"
	case lower == "cargo.toml":
		return "Rust crate configuration"
	case lower == "pyproject.toml":
		return "Python project configuration"
	case lower == "makefile":
		return "Build automation rules"
	case strings.HasPrefix(lower, "dockerfile"):
		return "Docker container definition"
	case strings.HasPrefix(lower, "docker-compose"):
		return "Docker Compose service definitions"
	case ext == ".toml":
		return "TOML configuration"
	case ext == ".yaml" || ext == ".yml":
		return "YAML configuration"
	case lower == ".gitignore":
		return "Git ignore rules"
	case strings.Contains(lower, "eslint"):
		return "ESLint linting configuration"
	case strings.Contains(lower, "prettier"):
		return "Prettier formatting configuration"
	case strings.Contains(lower, "jest"):
		return "Jest test configuration"
	case strings.Contains(lower, "vite"):
		return "Vite build configuration"
	case strings.Contains(lower, "webpack"):
		return "Webpack bundler configuration"
	case strings.Contains(lower, "tailwind"):
		return "Tailwind CSS configuration"
	}
	return "Project configuration"
}

func handlerSummary(nameNoExt, lang string) string {
	lower := strings.ToLower(nameNoExt)
	switch {
	case strings.Contains(lower, "middleware"):
		return fmt.Sprintf("%s middleware", lang)
	case strings.Contains(lower, "route"):
		return fmt.Sprintf("%s route definitions", lang)
	case strings.Contains(lower, "controller"):
		return fmt.Sprintf("%s controller logic", lang)
	case strings.Contains(lower, "api"):
		return fmt.Sprintf("%s API endpoint handlers", lang)
	case strings.Contains(lower, "endpoint"):
		return fmt.Sprintf("%s endpoint handlers", lang)
	}
	return fmt.Sprintf("%s request handlers", lang)
}

func uiSummary(base, ext, dir string) string {
	nameNoExt := strings.TrimSuffix(base, ext)

	switch ext {
	case ".css", ".scss":
		if strings.Contains(strings.ToLower(nameNoExt), "global") || strings.ToLower(nameNoExt) == "index" || strings.ToLower(nameNoExt) == "app" {
			return "Global stylesheet"
		}
		return fmt.Sprintf("%s component styles", humanize(nameNoExt))
	case ".vue":
		return fmt.Sprintf("Vue %s component", humanize(nameNoExt))
	case ".svelte":
		return fmt.Sprintf("Svelte %s component", humanize(nameNoExt))
	}

	// .jsx / .tsx — React components
	framework := "React"
	if strings.Contains(strings.ToLower(dir), "page") {
		return fmt.Sprintf("%s %s page", framework, humanize(nameNoExt))
	}
	return fmt.Sprintf("%s %s component", framework, humanize(nameNoExt))
}

func docSummary(base string) string {
	lower := strings.ToLower(base)
	switch {
	case lower == "readme.md":
		return "Project documentation"
	case lower == "changelog.md":
		return "Change log"
	case lower == "contributing.md":
		return "Contribution guidelines"
	case lower == "license.md":
		return "License information"
	}
	name := strings.TrimSuffix(base, filepath.Ext(base))
	return fmt.Sprintf("%s documentation", humanize(name))
}

func coreSummary(nameNoExt, lang, dir string) string {
	lower := strings.ToLower(nameNoExt)
	switch {
	case lower == "main":
		return fmt.Sprintf("%s application entry point", lang)
	case lower == "app" || lower == "application":
		return fmt.Sprintf("%s application setup", lang)
	case lower == "server":
		return fmt.Sprintf("%s server initialization", lang)
	case lower == "index":
		if dir != "." {
			return fmt.Sprintf("%s %s module index", lang, humanize(filepath.Base(dir)))
		}
		return fmt.Sprintf("%s module index", lang)
	case lower == "init" || lower == "setup":
		return fmt.Sprintf("%s initialization logic", lang)
	case lower == "config":
		return fmt.Sprintf("%s configuration loader", lang)
	case lower == "db" || lower == "database":
		return fmt.Sprintf("%s database layer", lang)
	}
	return fmt.Sprintf("%s %s logic", lang, humanize(nameNoExt))
}

// languageFromExt returns a human-readable language name for a file extension.
func languageFromExt(ext string) string {
	switch ext {
	case ".go":
		return "Go"
	case ".js":
		return "JavaScript"
	case ".jsx":
		return "React JSX"
	case ".ts":
		return "TypeScript"
	case ".tsx":
		return "React TSX"
	case ".py":
		return "Python"
	case ".rs":
		return "Rust"
	case ".java":
		return "Java"
	case ".html":
		return "HTML"
	case ".css":
		return "CSS"
	case ".scss":
		return "SCSS"
	case ".json":
		return "JSON"
	case ".yaml", ".yml":
		return "YAML"
	case ".toml":
		return "TOML"
	case ".md":
		return "Markdown"
	}
	return "Source"
}

// humanize converts snake_case, kebab-case, and camelCase names to a readable form.
func humanize(name string) string {
	if name == "" {
		return ""
	}
	// Replace underscores and hyphens with spaces.
	s := strings.NewReplacer("_", " ", "-", " ").Replace(name)
	// Simple camelCase split: insert a space before each uppercase letter
	// that follows a lowercase letter.
	var result strings.Builder
	for i, r := range s {
		if i > 0 && r >= 'A' && r <= 'Z' {
			prev := rune(s[i-1])
			if prev >= 'a' && prev <= 'z' {
				result.WriteRune(' ')
			}
		}
		result.WriteRune(r)
	}
	return strings.ToLower(result.String())
}

// shouldIncludeFile determines whether a file should be part of the learning path.
func shouldIncludeFile(relPath, absPath string) bool {
	base := filepath.Base(relPath)
	ext := strings.ToLower(filepath.Ext(base))

	// Exclude lock files.
	if lockFiles[base] {
		return false
	}

	// Must have an allowed source extension.
	if !sourceExtensions[ext] {
		return false
	}

	// Exclude files exceeding size limit.
	info, err := os.Stat(absPath)
	if err != nil {
		return false
	}
	if info.Size() > maxFileSize {
		return false
	}

	// Skip common generated file patterns.
	lower := strings.ToLower(relPath)
	generatedPatterns := []string{
		".min.js", ".min.css", "bundle.js",
		".d.ts", ".pb.go", ".pb.", "_generated.",
		"swagger.json", "openapi.json",
	}
	for _, pat := range generatedPatterns {
		if strings.Contains(lower, pat) {
			return false
		}
	}

	return true
}

// countLines returns the number of lines in a file.
func countLines(path string) (int, error) {
	f, err := os.Open(path)
	if err != nil {
		return 0, err
	}
	defer f.Close()

	count := 0
	scanner := bufio.NewScanner(f)
	// Increase buffer size for files with very long lines.
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	for scanner.Scan() {
		count++
	}
	if err := scanner.Err(); err != nil {
		return count, err
	}
	return count, nil
}

// calculateComplexity assigns a 1-5 difficulty rating based on line count and category.
func calculateComplexity(lineCount int, category FileCategory) int {
	// Config and docs tend to be simpler regardless of length.
	if category == CategoryConfig || category == CategoryDocs || category == CategoryAssets {
		switch {
		case lineCount < 100:
			return 1
		case lineCount < 300:
			return 2
		default:
			return 3
		}
	}

	switch {
	case lineCount < 50:
		return 1
	case lineCount < 150:
		return 2
	case lineCount < 400:
		return 3
	case lineCount < 800:
		return 4
	default:
		return 5
	}
}
