package main

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
)

// ─── Project release script check ────────────────────────────────────────────

type releaseScriptRequest struct {
	Path string `json:"path"`
}

// handleProjectReleaseScript checks whether scripts/local-release.ps1 exists
// in the given project directory so the UI can use the local pipeline.
func handleProjectReleaseScript(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req releaseScriptRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Path == "" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]bool{"exists": false})
		return
	}
	scriptPath := filepath.Join(req.Path, "scripts", "local-release.ps1")
	_, err := os.Stat(scriptPath)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"exists": err == nil})
}
