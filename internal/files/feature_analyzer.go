package files

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// FeatureDefinition represents a discovered feature in the codebase
type FeatureDefinition struct {
	Name         string   `json:"name"`         // e.g., "AM Health Monitoring"
	Description  string   `json:"description"`  // Extracted from comments
	Files        []string `json:"files"`        // Files implementing this feature
	Capabilities []string `json:"capabilities"` // What it can do
	APIEndpoints []string `json:"apiEndpoints"` // HTTP endpoints if any
	Exports      []string `json:"exports"`      // Functions/types/components exported
	Category     string   `json:"category"`     // Auto-categorized
}

// FeatureMap is the complete analysis result
type FeatureMap struct {
	RootPath string               `json:"rootPath"`
	Features []FeatureDefinition  `json:"features"`
	Files    map[string]FileInfo  `json:"files"` // File path -> its features
}

// FileInfo describes what a single file contributes
type FileInfo struct {
	Path         string   `json:"path"`
	Features     []string `json:"features"`     // Feature names this file belongs to
	Exports      []string `json:"exports"`      // What it exports
	Imports      []string `json:"imports"`      // What it depends on
	APIEndpoints []string `json:"apiEndpoints"` // Routes it defines
	Description  string   `json:"description"`  // From file-level comments
}

// AnalyzeCodebase scans a directory and builds a feature map
func AnalyzeCodebase(rootPath string) (*FeatureMap, error) {
	fm := &FeatureMap{
		RootPath: rootPath,
		Features: []FeatureDefinition{},
		Files:    make(map[string]FileInfo),
	}

	// Walk directory tree
	err := filepath.Walk(rootPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		// Skip non-code files and hidden dirs
		if info.IsDir() {
			if strings.HasPrefix(info.Name(), ".") || info.Name() == "node_modules" {
				return filepath.SkipDir
			}
			return nil
		}

		// Only analyze code files
		ext := filepath.Ext(path)
		if !isCodeFile(ext) {
			return nil
		}

		// Analyze file
		fileInfo, err := analyzeFile(path, rootPath)
		if err != nil {
			// Non-fatal, just skip
			return nil
		}

		fm.Files[path] = fileInfo
		return nil
	})

	if err != nil {
		return nil, err
	}

	// Group files into features
	fm.Features = groupIntoFeatures(fm.Files)

	return fm, nil
}

// analyzeFile extracts information from a single file
func analyzeFile(path string, rootPath string) (FileInfo, error) {
	info := FileInfo{
		Path:         path,
		Features:     []string{},
		Exports:      []string{},
		Imports:      []string{},
		APIEndpoints: []string{},
	}

	file, err := os.Open(path)
	if err != nil {
		return info, err
	}
	defer file.Close()

	ext := filepath.Ext(path)
	scanner := bufio.NewScanner(file)

	// Patterns for different languages
	var (
		exportPattern   *regexp.Regexp
		routePattern    *regexp.Regexp
		commentPattern  *regexp.Regexp
		importPattern   *regexp.Regexp
	)

	switch ext {
	case ".go":
		exportPattern = regexp.MustCompile(`^func\s+([A-Z][a-zA-Z0-9_]*)\s*\(`)
		routePattern = regexp.MustCompile(`HandleFunc\("([^"]+)"`)
		commentPattern = regexp.MustCompile(`^//\s*(.+)`)
		importPattern = regexp.MustCompile(`import\s+"([^"]+)"`)

	case ".js", ".jsx", ".ts", ".tsx":
		exportPattern = regexp.MustCompile(`export\s+(function|const|class)\s+([a-zA-Z0-9_]+)`)
		routePattern = regexp.MustCompile(`(app\.|router\.|route)\w+\(['"]([^'"]+)['"]`)
		commentPattern = regexp.MustCompile(`^\s*[/*]+\s*(.+)`)
		importPattern = regexp.MustCompile(`from\s+['"]([^'"]+)['"]`)

	default:
		return info, fmt.Errorf("unsupported file type: %s", ext)
	}

	commentBuffer := []string{}
	lineNum := 0

	for scanner.Scan() {
		line := scanner.Text()
		lineNum++

		// Extract comments
		if match := commentPattern.FindStringSubmatch(line); match != nil {
			comment := strings.TrimSpace(match[1])
			if !strings.HasPrefix(comment, "+build") && len(comment) > 10 {
				commentBuffer = append(commentBuffer, comment)
			}
			continue
		}

		// Extract exports
		if match := exportPattern.FindStringSubmatch(line); match != nil {
			exportName := match[len(match)-1]
			info.Exports = append(info.Exports, exportName)

			// Use preceding comments as description
			if len(commentBuffer) > 0 && info.Description == "" {
				info.Description = strings.Join(commentBuffer, " ")
			}
		}

		// Extract API routes
		if match := routePattern.FindStringSubmatch(line); match != nil {
			route := match[len(match)-1]
			info.APIEndpoints = append(info.APIEndpoints, route)
		}

		// Extract imports
		if match := importPattern.FindStringSubmatch(line); match != nil {
			importPath := match[1]
			info.Imports = append(info.Imports, importPath)
		}

		// Clear comment buffer if we hit code
		if !strings.HasPrefix(strings.TrimSpace(line), "//") && !strings.HasPrefix(strings.TrimSpace(line), "/*") {
			commentBuffer = []string{}
		}
	}

	return info, nil
}

// groupIntoFeatures takes analyzed files and groups them into logical features
func groupIntoFeatures(files map[string]FileInfo) []FeatureDefinition {
	features := make(map[string]*FeatureDefinition)

	// Heuristics for grouping files
	for path, info := range files {
		// Determine feature name from path/exports
		featureName := inferFeatureName(path, info)

		if _, exists := features[featureName]; !exists {
			features[featureName] = &FeatureDefinition{
				Name:         featureName,
				Files:        []string{},
				Capabilities: []string{},
				APIEndpoints: []string{},
				Exports:      []string{},
				Category:     categorizeFeature(path),
			}
		}

		feature := features[featureName]
		feature.Files = append(feature.Files, path)
		feature.Exports = append(feature.Exports, info.Exports...)
		feature.APIEndpoints = append(feature.APIEndpoints, info.APIEndpoints...)

		// Use first file's description
		if feature.Description == "" && info.Description != "" {
			feature.Description = info.Description
		}

		// Infer capabilities from exports
		for _, export := range info.Exports {
			capability := inferCapability(export, info.APIEndpoints)
			if capability != "" {
				feature.Capabilities = append(feature.Capabilities, capability)
			}
		}
	}

	// Convert to slice
	result := []FeatureDefinition{}
	for _, f := range features {
		result = append(result, *f)
	}

	return result
}

// inferFeatureName guesses feature name from file path and exports
func inferFeatureName(path string, info FileInfo) string {
	// Try to get from directory name
	parts := strings.Split(filepath.ToSlash(path), "/")
	
	for i := len(parts) - 1; i >= 0; i-- {
		dir := parts[i]
		if dir == "internal" || dir == "cmd" || dir == "src" || dir == "components" {
			continue
		}
		if strings.Contains(dir, "_") {
			// snake_case to Title Case
			words := strings.Split(dir, "_")
			for j, w := range words {
				words[j] = strings.Title(w)
			}
			return strings.Join(words, " ")
		}
		return strings.Title(dir)
	}

	// Fallback: use base filename
	base := filepath.Base(path)
	name := strings.TrimSuffix(base, filepath.Ext(base))
	return strings.Title(strings.ReplaceAll(name, "_", " "))
}

// inferCapability derives capability description from export name
func inferCapability(exportName string, endpoints []string) string {
	lower := strings.ToLower(exportName)

	// Common patterns
	if strings.Contains(lower, "create") {
		return "Create " + simplify(exportName)
	}
	if strings.Contains(lower, "delete") || strings.Contains(lower, "remove") {
		return "Delete " + simplify(exportName)
	}
	if strings.Contains(lower, "update") || strings.Contains(lower, "modify") {
		return "Update " + simplify(exportName)
	}
	if strings.Contains(lower, "get") || strings.Contains(lower, "fetch") || strings.Contains(lower, "load") {
		return "Retrieve " + simplify(exportName)
	}
	if strings.Contains(lower, "handle") {
		return "Handle " + simplify(exportName)
	}
	if strings.Contains(lower, "detect") {
		return "Detect " + simplify(exportName)
	}
	if strings.Contains(lower, "analyze") {
		return "Analyze " + simplify(exportName)
	}

	return ""
}

// simplify removes common prefixes/suffixes
func simplify(name string) string {
	name = strings.TrimPrefix(name, "handle")
	name = strings.TrimPrefix(name, "Handle")
	name = strings.TrimSuffix(name, "Handler")
	name = strings.TrimSuffix(name, "handler")
	return strings.TrimSpace(name)
}

// categorizeFeature assigns a category based on path
func categorizeFeature(path string) string {
	lower := strings.ToLower(path)

	if strings.Contains(lower, "terminal") || strings.Contains(lower, "pty") {
		return "Terminal"
	}
	if strings.Contains(lower, "/am/") {
		return "Artificial Memory"
	}
	if strings.Contains(lower, "autoresponse") || strings.Contains(lower, "auto_respond") {
		return "Auto Response"
	}
	if strings.Contains(lower, "slm") || strings.Contains(lower, "routing") {
		return "Smart Routing"
	}
	if strings.Contains(lower, "command") {
		return "Command Cards"
	}
	if strings.Contains(lower, "files") || strings.Contains(lower, "lens") {
		return "File System"
	}
	if strings.Contains(lower, "session") {
		return "Session Management"
	}
	if strings.Contains(lower, "theme") {
		return "Themes"
	}
	if strings.Contains(lower, "config") || strings.Contains(lower, "settings") {
		return "Configuration"
	}
	if strings.Contains(lower, "test") {
		return "Testing"
	}

	return "Utilities"
}

// isCodeFile checks if file extension indicates code
func isCodeFile(ext string) bool {
	codeExts := map[string]bool{
		".go":   true,
		".js":   true,
		".jsx":  true,
		".ts":   true,
		".tsx":  true,
		".py":   true,
		".java": true,
		".c":    true,
		".cpp":  true,
		".h":    true,
		".rs":   true,
	}
	return codeExts[ext]
}

// HandleAnalyzeCodebase is the HTTP handler for feature analysis
func HandleAnalyzeCodebase(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	rootPath := r.URL.Query().Get("path")
	if rootPath == "" {
		rootPath = "."
	}

	// Validate path
	absPath, err := filepath.Abs(rootPath)
	if err != nil {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	// Check if path exists
	if _, err := os.Stat(absPath); os.IsNotExist(err) {
		http.Error(w, "Path does not exist", http.StatusNotFound)
		return
	}

	// Analyze codebase
	featureMap, err := AnalyzeCodebase(absPath)
	if err != nil {
		http.Error(w, fmt.Sprintf("Analysis failed: %v", err), http.StatusInternalServerError)
		return
	}

	// Return JSON
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(featureMap)
}
