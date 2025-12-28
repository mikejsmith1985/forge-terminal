package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// handleListFiles implements GET /api/files/list
// Returns a JSON array of relative file paths from the current directory
// Ignores: .git, node_modules, dist, vendor, build, and other common directories
func handleListFiles(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Get the directory to list from query params, default to current working directory
	dirPath := r.URL.Query().Get("path")
	if dirPath == "" {
		var err error
		dirPath, err = os.Getwd()
		if err != nil {
			log.Printf("[Files API] Failed to get working directory: %v", err)
			http.Error(w, "Failed to get working directory", http.StatusInternalServerError)
			return
		}
	}

	// Resolve to absolute path
	absPath, err := filepath.Abs(dirPath)
	if err != nil {
		log.Printf("[Files API] Invalid path: %v", err)
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	// Check if path exists and is a directory
	info, err := os.Stat(absPath)
	if err != nil {
		log.Printf("[Files API] Path not found: %s", absPath)
		http.Error(w, "Path not found", http.StatusNotFound)
		return
	}

	if !info.IsDir() {
		log.Printf("[Files API] Path is not a directory: %s", absPath)
		http.Error(w, "Path is not a directory", http.StatusBadRequest)
		return
	}

	// Common ignore patterns for Active Engineer mode
	ignoreDirs := map[string]bool{
		".git":         true,
		"node_modules": true,
		"dist":         true,
		"build":        true,
		"vendor":       true,
		".next":        true,
		"__pycache__":  true,
		".venv":        true,
		"venv":         true,
		".idea":        true,
		".vscode":      true,
		"coverage":     true,
		".nyc_output":  true,
		"target":       true,
		".gradle":      true,
		".bundle":      true,
		"node":         true,
		".pytest_cache": true,
	}

	// Binary file extensions to skip
	skipExtensions := map[string]bool{
		".exe":   true,
		".dll":   true,
		".so":    true,
		".dylib": true,
		".zip":   true,
		".tar":   true,
		".gz":    true,
		".rar":   true,
		".jpg":   true,
		".jpeg":  true,
		".png":   true,
		".gif":   true,
		".ico":   true,
		".webp":  true,
		".mp3":   true,
		".mp4":   true,
		".wav":   true,
		".avi":   true,
		".mov":   true,
		".pdf":   true,
		".doc":   true,
		".docx":  true,
		".xls":   true,
		".xlsx":  true,
		".wasm":  true,
		".pyc":   true,
		".pyo":   true,
		".o":     true,
		".a":     true,
		".lib":   true,
		".class": true,
		".jar":   true,
	}

	var files []string
	maxFiles := 5000 // Limit to prevent extremely large responses

	// Walk the directory tree
	err = filepath.Walk(absPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // Skip files we can't access
		}

		// Get relative path from the root directory
		relPath, err := filepath.Rel(absPath, path)
		if err != nil {
			return nil
		}

		// Skip the root directory itself
		if relPath == "." {
			return nil
		}

		// If it's a directory, check if it should be ignored
		if info.IsDir() {
			if ignoreDirs[info.Name()] {
				log.Printf("[Files API] Skipping ignored directory: %s", relPath)
				return filepath.SkipDir
			}
			return nil // Don't include directories in the list
		}

		// Skip hidden files (starting with dot)
		if strings.HasPrefix(info.Name(), ".") {
			return nil
		}

		// Skip binary and large file types
		ext := strings.ToLower(filepath.Ext(info.Name()))
		if skipExtensions[ext] {
			return nil
		}

		// Add file to list (use forward slashes for cross-platform consistency)
		files = append(files, strings.ReplaceAll(relPath, "\\", "/"))

		// Stop if we've reached the limit
		if len(files) >= maxFiles {
			return filepath.SkipAll
		}

		return nil
	})

	if err != nil && err != filepath.SkipAll {
		log.Printf("[Files API] Error walking directory: %v", err)
	}

	// Sort files alphabetically
	sort.Strings(files)

	// Return JSON response
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(files); err != nil {
		log.Printf("[Files API] Failed to encode response: %v", err)
	}
}
