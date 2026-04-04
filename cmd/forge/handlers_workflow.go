package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/mikejsmith1985/forge-terminal/internal/workflow"
)

// ─── Workflow: Project Detection ─────────────────────────────────────────────

// handleWorkflowDetect scans a project directory and returns its type,
// existing structure, and recommended workflow modules.
func handleWorkflowDetect(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var requestBody struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil || strings.TrimSpace(requestBody.Path) == "" {
		http.Error(w, "path is required", http.StatusBadRequest)
		return
	}

	detection, err := workflow.DetectProject(requestBody.Path)
	if err != nil {
		log.Printf("[Workflow API] Detection error: %v", err)
		http.Error(w, "detection failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	log.Printf("[Workflow API] Detected project: %s (type=%s, hasGit=%v, hasGitHub=%v)",
		detection.ProjectName, detection.ProjectType, detection.HasGit, detection.HasGitHub)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(detection)
}

// ─── Workflow: Presets ───────────────────────────────────────────────────────

// handleWorkflowPresets handles CRUD operations for workflow presets.
func handleWorkflowPresets(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		handleWorkflowPresetsGet(w, r)
	case http.MethodPost:
		handleWorkflowPresetsSave(w, r)
	case http.MethodPut:
		handleWorkflowPresetsUpdate(w, r)
	case http.MethodDelete:
		handleWorkflowPresetsDelete(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleWorkflowPresetsGet(w http.ResponseWriter, r *http.Request) {
	// If an ID query param is provided, return a specific preset
	presetID := r.URL.Query().Get("id")
	if presetID != "" {
		preset, err := workflow.GetPreset(presetID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(preset)
		return
	}

	// Otherwise list all presets
	presets, err := workflow.ListPresets()
	if err != nil {
		log.Printf("[Workflow API] Error listing presets: %v", err)
		http.Error(w, "failed to list presets", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(presets)
}

func handleWorkflowPresetsSave(w http.ResponseWriter, r *http.Request) {
	var preset workflow.WorkflowPreset
	if err := json.NewDecoder(r.Body).Decode(&preset); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(preset.ID) == "" || strings.TrimSpace(preset.Name) == "" {
		http.Error(w, "id and name are required", http.StatusBadRequest)
		return
	}

	if err := workflow.SavePreset(preset); err != nil {
		log.Printf("[Workflow API] Error saving preset: %v", err)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	log.Printf("[Workflow API] Saved preset: %s", preset.Name)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"preset":  preset,
	})
}

func handleWorkflowPresetsUpdate(w http.ResponseWriter, r *http.Request) {
	// Update uses the same logic as save (SavePreset handles upsert)
	handleWorkflowPresetsSave(w, r)
}

func handleWorkflowPresetsDelete(w http.ResponseWriter, r *http.Request) {
	presetID := r.URL.Query().Get("id")
	if presetID == "" {
		http.Error(w, "query parameter 'id' is required", http.StatusBadRequest)
		return
	}

	if err := workflow.DeletePreset(presetID); err != nil {
		log.Printf("[Workflow API] Error deleting preset: %v", err)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	log.Printf("[Workflow API] Deleted preset: %s", presetID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Preset deleted",
	})
}

// ─── Workflow: Preview ───────────────────────────────────────────────────────

// handleWorkflowPreview generates a dry-run preview of what files would be
// created or modified if the workflow were applied.
func handleWorkflowPreview(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var requestBody struct {
		Path   string                  `json:"path"`
		Config workflow.WorkflowConfig `json:"config"`
	}
	if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(requestBody.Path) == "" {
		http.Error(w, "path is required", http.StatusBadRequest)
		return
	}

	preview, err := workflow.PreviewScaffold(requestBody.Path, requestBody.Config)
	if err != nil {
		log.Printf("[Workflow API] Preview error: %v", err)
		http.Error(w, "preview failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	log.Printf("[Workflow API] Preview: %d total, %d new, %d update, %d skip",
		preview.TotalFiles, preview.NewFiles, preview.UpdateFiles, preview.SkipFiles)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(preview)
}

// ─── Workflow: Apply ─────────────────────────────────────────────────────────

// handleWorkflowApply executes the scaffold operation, creating/updating files
// in the target project according to the workflow configuration.
func handleWorkflowApply(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var requestBody struct {
		Path   string                  `json:"path"`
		Config workflow.WorkflowConfig `json:"config"`
	}
	if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(requestBody.Path) == "" {
		http.Error(w, "path is required", http.StatusBadRequest)
		return
	}

	result, err := workflow.ScaffoldProject(requestBody.Path, requestBody.Config)
	if err != nil {
		log.Printf("[Workflow API] Apply error: %v", err)
		http.Error(w, "scaffold failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	log.Printf("[Workflow API] Applied workflow: %d created, %d updated, %d skipped, %d errors",
		len(result.FilesCreated), len(result.FilesUpdated), len(result.FilesSkipped), len(result.Errors))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// ─── Workflow: Status ────────────────────────────────────────────────────────

// handleWorkflowStatus returns the current workflow status for a project,
// including whether it's configured, which preset was used, and compliance state.
func handleWorkflowStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	projectPath := r.URL.Query().Get("path")
	if projectPath == "" {
		http.Error(w, "query parameter 'path' is required", http.StatusBadRequest)
		return
	}

	status := workflow.WorkflowStatus{
		Configured: false,
	}

	// Try to read .forge/workflow.json from the project
	detection, err := workflow.DetectProject(projectPath)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(status)
		return
	}

	if detection.HasWorkflow {
		status.Configured = true
		// Read the workflow.json to get details
		configData, readErr := readWorkflowConfig(projectPath)
		if readErr == nil {
			status.QualityMode = configData.QualityMode
			status.ModuleCount = len(configData.EnabledModules)
			status.PresetName = configData.ProjectName // Best we can do without tracking preset name separately
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}

// ─── Workflow: Compliance ────────────────────────────────────────────────────

// handleWorkflowCompliance runs a compliance scan against a project
// and returns a detailed report.
func handleWorkflowCompliance(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	projectPath := r.URL.Query().Get("path")
	if projectPath == "" {
		http.Error(w, "query parameter 'path' is required", http.StatusBadRequest)
		return
	}

	// Load the project's workflow config, or use defaults
	config, err := readWorkflowConfig(projectPath)
	if err != nil {
		config = workflow.DefaultConfig()
	}

	report, err := workflow.ScanCompliance(projectPath, config)
	if err != nil {
		log.Printf("[Workflow API] Compliance scan error: %v", err)
		http.Error(w, "compliance scan failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	log.Printf("[Workflow API] Compliance: %s (%d passing, %d warnings, %d violations)",
		report.Status, report.Passing, report.Warnings, report.Violations)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(report)
}

// ─── Workflow: Module Catalog ────────────────────────────────────────────────

// handleWorkflowModules returns the full module catalog with metadata.
func handleWorkflowModules(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(workflow.ModuleCatalog())
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// readWorkflowConfig reads and parses .forge/workflow.json from a project path.
func readWorkflowConfig(projectPath string) (workflow.WorkflowConfig, error) {
	configPath := filepath.Join(projectPath, ".forge", "workflow.json")

	data, err := os.ReadFile(configPath)
	if err != nil {
		return workflow.WorkflowConfig{}, err
	}

	var config workflow.WorkflowConfig
	if err := json.Unmarshal(data, &config); err != nil {
		return workflow.WorkflowConfig{}, err
	}

	return config, nil
}
