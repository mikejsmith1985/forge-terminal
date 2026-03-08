package main

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// DirectoryEntry represents a single subdirectory
type DirectoryEntry struct {
	Name string `json:"name"`
	Path string `json:"path"`
}

// handleDirectoryList returns immediate subdirectories of a given path.
// GET /api/directory/list?path=/some/root
func handleDirectoryList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	rawPath := r.URL.Query().Get("path")
	if rawPath == "" {
		http.Error(w, "path query parameter is required", http.StatusBadRequest)
		return
	}

	// Expand ~ to home directory
	if strings.HasPrefix(rawPath, "~") {
		home, err := os.UserHomeDir()
		if err != nil {
			http.Error(w, "failed to resolve home directory", http.StatusInternalServerError)
			return
		}
		rawPath = filepath.Join(home, rawPath[1:])
	}

	absPath, err := filepath.Abs(rawPath)
	if err != nil {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}

	info, err := os.Stat(absPath)
	if err != nil || !info.IsDir() {
		http.Error(w, "path does not exist or is not a directory", http.StatusBadRequest)
		return
	}

	entries, err := os.ReadDir(absPath)
	if err != nil {
		http.Error(w, "failed to read directory", http.StatusInternalServerError)
		return
	}

	var dirs []DirectoryEntry
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := entry.Name()
		// Skip hidden directories (dot-prefixed)
		if strings.HasPrefix(name, ".") {
			continue
		}
		dirs = append(dirs, DirectoryEntry{
			Name: name,
			Path: filepath.Join(absPath, name),
		})
	}

	// Sort alphabetically, case-insensitive
	sort.Slice(dirs, func(i, j int) bool {
		return strings.ToLower(dirs[i].Name) < strings.ToLower(dirs[j].Name)
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(dirs)
}
