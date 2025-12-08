package vision

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
)

// FilePathDetector detects file and directory paths in terminal output
type FilePathDetector struct {
	mu      sync.RWMutex
	enabled bool
}

func NewFilePathDetector() *FilePathDetector {
	return &FilePathDetector{
		enabled: true,
	}
}

func (f *FilePathDetector) Name() string {
	return "filepath"
}

func (f *FilePathDetector) Enabled() bool {
	f.mu.RLock()
	defer f.mu.RUnlock()
	return f.enabled
}

func (f *FilePathDetector) SetEnabled(enabled bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.enabled = enabled
}

func (f *FilePathDetector) Detect(buffer []byte) *Match {
	text := string(buffer)
	cleanText := stripAnsi(text)
	
	// Patterns to detect various file path formats
	patterns := []*regexp.Regexp{
		// Absolute paths: /home/user/file.txt, /etc/config
		regexp.MustCompile(`(?:^|\s|["'])(/[a-zA-Z0-9_./\-]+(?:\.[a-zA-Z0-9]+)?)(?:$|\s|["',;:])`),
		
		// Relative paths: ./file.txt, ../dir/file.go, docs/user/README.md
		regexp.MustCompile(`(?:^|\s|["'])((?:\.\./|\./)?[a-zA-Z0-9_\-]+(?:/[a-zA-Z0-9_.\-]+)+)(?:$|\s|["',;:])`),
		
		// Current dir files: file.txt, config.json (must have extension)
		regexp.MustCompile(`(?:^|\s|["'])([a-zA-Z0-9_\-]+\.[a-zA-Z0-9]+)(?:$|\s|["',;:])`),
	}
	
	var allPaths []string
	pathSet := make(map[string]bool)
	
	for _, pattern := range patterns {
		matches := pattern.FindAllStringSubmatch(cleanText, -1)
		for _, match := range matches {
			if len(match) > 1 {
				path := strings.TrimSpace(match[1])
				// Avoid duplicates
				if !pathSet[path] && isValidPath(path) {
					allPaths = append(allPaths, path)
					pathSet[path] = true
				}
			}
		}
	}
	
	if len(allPaths) == 0 {
		return nil
	}
	
	// Find paths that actually exist
	existingPaths := []map[string]interface{}{}
	for _, path := range allPaths {
		fullPath := resolveFullPath(path)
		info, err := os.Stat(fullPath)
		if err == nil {
			pathInfo := map[string]interface{}{
				"path":     path,
				"fullPath": fullPath,
				"exists":   true,
				"isDir":    info.IsDir(),
				"size":     info.Size(),
			}
			
			// Add type-specific info
			if info.IsDir() {
				pathInfo["type"] = "directory"
			} else {
				pathInfo["type"] = "file"
				ext := filepath.Ext(path)
				if ext != "" {
					pathInfo["extension"] = ext
				}
			}
			
			existingPaths = append(existingPaths, pathInfo)
		}
	}
	
	if len(existingPaths) == 0 {
		return nil
	}
	
	// Return the first/primary path match
	primary := existingPaths[0]
	
	return &Match{
		Type: "FILE_PATH",
		Payload: map[string]interface{}{
			"primary": primary,
			"all":     existingPaths,
			"count":   len(existingPaths),
		},
		Offset: strings.Index(text, primary["path"].(string)),
		Length: len(primary["path"].(string)),
	}
}

// isValidPath filters out false positives
func isValidPath(path string) bool {
	// Skip if too short or suspiciously simple
	if len(path) < 3 {
		return false
	}
	
	// Skip common false positives
	falsePositives := []string{
		"index.js", "main.go", "app.js", "test.js",
		"README.md", "LICENSE", "Makefile",
		"package.json", "go.mod", "go.sum",
	}
	
	baseName := filepath.Base(path)
	for _, fp := range falsePositives {
		if baseName == fp && !strings.Contains(path, "/") {
			// Only skip if it's just the filename, not a path
			return false
		}
	}
	
	// Skip if it looks like a URL or domain
	if strings.Contains(path, "http://") || strings.Contains(path, "https://") {
		return false
	}
	
	if strings.Contains(path, ".com") || strings.Contains(path, ".org") {
		return false
	}
	
	// Skip if it's just numbers or too generic
	if regexp.MustCompile(`^\d+$`).MatchString(path) {
		return false
	}
	
	return true
}

// resolveFullPath converts relative paths to absolute
func resolveFullPath(path string) string {
	// If already absolute, return as-is
	if filepath.IsAbs(path) {
		return path
	}
	
	// Get current working directory
	cwd, err := os.Getwd()
	if err != nil {
		return path
	}
	
	// Handle relative paths
	if strings.HasPrefix(path, "./") || strings.HasPrefix(path, "../") {
		absPath, err := filepath.Abs(filepath.Join(cwd, path))
		if err == nil {
			return absPath
		}
	}
	
	// Try relative to cwd
	absPath := filepath.Join(cwd, path)
	return absPath
}
