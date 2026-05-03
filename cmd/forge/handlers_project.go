package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
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

// handleProjectScaffoldRelease creates scripts/local-release.ps1 in the given project
// directory from the embedded generic template. This lets any project adopt the local
// release pipeline in one click from the Release Manager card in the Forge Terminal UI.
func handleProjectScaffoldRelease(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req releaseScriptRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Path == "" {
		http.Error(w, "missing or invalid path", http.StatusBadRequest)
		return
	}

	// Validate the project path exists before writing anything into it.
	if _, err := os.Stat(req.Path); os.IsNotExist(err) {
		http.Error(w, fmt.Sprintf("project path does not exist: %s", req.Path), http.StatusBadRequest)
		return
	}

	scriptsDir := filepath.Join(req.Path, "scripts")
	scriptPath := filepath.Join(scriptsDir, "local-release.ps1")

	// Return success without overwriting an existing script — let the UI inform the user.
	if _, err := os.Stat(scriptPath); err == nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"created": false,
			"exists":  true,
			"message": "scripts/local-release.ps1 already exists — no changes made",
		})
		return
	}

	if err := os.MkdirAll(scriptsDir, 0o755); err != nil {
		http.Error(w, "failed to create scripts directory: "+err.Error(), http.StatusInternalServerError)
		return
	}

	if err := os.WriteFile(scriptPath, []byte(strings.ReplaceAll(releaseScriptTemplate, "\r\n", "\n")), 0o644); err != nil {
		http.Error(w, "failed to write release script: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"created": true,
		"exists":  true,
		"path":    scriptPath,
		"message": "scripts/local-release.ps1 created — commit it to save the pipeline",
	})
}
