// Global workflow install endpoint — hoists the Forge constitution machine-wide
// so every CLI tool (Claude, Copilot, Gemini), in every project, inherits the
// project's binding rules without per-project reconstruction.
package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"

	"github.com/mikejsmith1985/forge-terminal/internal/workflow"
)

// globalInstallProjectName labels the machine-wide constitution. It is generic
// because this copy is the base every project inherits, not any single project's.
const globalInstallProjectName = "Forge (global default)"

// handleWorkflowGlobalInstall installs the Forge constitution into every
// supported CLI tool's machine-wide instructions file. POST /api/workflow/global-install.
func handleWorkflowGlobalInstall(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	homeDir, err := os.UserHomeDir()
	if err != nil {
		http.Error(w, "cannot resolve home directory: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Render the base constitution from the same template scaffolded projects use,
	// so the global default and per-project copies share one source of truth.
	config := workflow.DefaultConfig()
	config.ProjectName = globalInstallProjectName
	config.ProjectType = workflow.ProjectTypeGeneric
	constitution, err := workflow.RenderConstitution(config)
	if err != nil {
		http.Error(w, "rendering constitution: "+err.Error(), http.StatusInternalServerError)
		return
	}

	result, err := workflow.InstallGlobalConstitution(homeDir, constitution)
	if err != nil {
		http.Error(w, "global install failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	log.Printf("[Workflow] Global constitution installed to %d CLI tool(s)", len(result.TargetsWritten))
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}
