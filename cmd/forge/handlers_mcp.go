// handlers_mcp.go wires the Forge Terminal MCP server into the HTTP router.
//
// The MCP server is initialised once at startup (initMCPServer) and stored in
// the package-level mcpServer variable. All requests to /api/mcp and
// /api/mcp/tasks/* are routed here without the standard auth middleware —
// the MCP server handles its own bearer-token authentication so that external
// AI tools (VS Code Copilot, Cursor, EZTest) can connect without needing the
// Forge UI session cookie.
package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/BurntSushi/toml"
	"github.com/mikejsmith1985/forge-terminal/internal/mcp"
	"github.com/mikejsmith1985/forge-terminal/internal/workflow"
)

// ── Config ────────────────────────────────────────────────────────────────────

// mcpTOMLConfig mirrors the [mcp] section of forge.toml.
// Enabled is a pointer so we can distinguish "absent in TOML" (nil → default true)
// from "explicitly disabled" (*bool = false).
type mcpTOMLConfig struct {
	Enabled      *bool    `toml:"enabled"`
	AllowedTools []string `toml:"allowed_tools"`
}

// forgeTOMLPartial is a minimal parse of forge.toml that captures only the [mcp]
// section. All other sections are intentionally ignored.
type forgeTOMLPartial struct {
	MCP mcpTOMLConfig `toml:"mcp"`
}

// loadMCPConfig reads forge.toml from the project root and returns the [mcp]
// section. If the file is absent or the section is missing, safe defaults are
// returned (enabled=true, all tools allowed).
func loadMCPConfig() mcpTOMLConfig {
	trueVal := true
	defaults := mcpTOMLConfig{Enabled: &trueVal, AllowedTools: nil}

	// Prefer forge.toml in the current working directory (project root).
	configPath := "forge.toml"
	if _, err := os.Stat(configPath); err != nil {
		return defaults
	}

	var partial forgeTOMLPartial
	if _, err := toml.DecodeFile(configPath, &partial); err != nil {
		log.Printf("[MCP] Could not parse forge.toml [mcp] section: %v — using defaults", err)
		return defaults
	}

	cfg := partial.MCP
	// If the [mcp] section was absent, Enabled is nil — default to enabled.
	if cfg.Enabled == nil {
		cfg.Enabled = &trueVal
	}
	return cfg
}

// mcpEnabled returns true when the config has MCP enabled (nil or *true).
func mcpEnabled(cfg mcpTOMLConfig) bool {
	return cfg.Enabled == nil || *cfg.Enabled
}

// ── Init ──────────────────────────────────────────────────────────────────────

// mcpServer is the single, shared MCP server instance for this Forge process.
// Initialised by initMCPServer() at startup and accessed from the route handlers.
var mcpServer *mcp.Server

// initMCPServer creates the MCP server and loads (or auto-generates) the bearer token.
// It is called once from main() before the HTTP listener starts.
func initMCPServer() {
	cfg := loadMCPConfig()
	if !mcpEnabled(cfg) {
		log.Printf("[MCP] Disabled via forge.toml — MCP endpoint will not be active")
		return
	}

	authToken, err := mcp.LoadOrCreateToken()
	if err != nil {
		log.Printf("[MCP] WARNING: could not load/create auth token: %v — MCP will reject all requests", err)
		// Don't fatal — Forge still starts normally; MCP is optional.
		authToken = ""
	}

	projectPath := resolveProjectPath()
	workflowCfg := loadWorkflowConfigForMCP(projectPath)

	deps := mcp.Dependencies{
		TermHandler:    termHandler,
		WorkflowConfig: workflowCfg,
		ProjectPath:    projectPath,
		AllowedTools:   cfg.AllowedTools,
	}

	mcpServer = mcp.NewServer(authToken, deps)
	log.Printf("[MCP] Server ready — endpoint: /api/mcp | token: ~/.forge/mcp-token")
}

// handleMCP is the unified HTTP handler for POST /api/mcp and GET /api/mcp.
// Auth is enforced by the MCP server itself, not by the standard middleware chain.
func handleMCP(w http.ResponseWriter, r *http.Request) {
	applyCORSHeaders(w, r)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if mcpServer == nil {
		http.Error(w, `{"error":"MCP server not initialised"}`, http.StatusServiceUnavailable)
		return
	}
	mcpServer.HandleHTTP(w, r)
}

// handleMCPTaskStatus handles GET /api/mcp/tasks/{id} — returns the current status
// of a task previously submitted via the task_submit MCP tool.
func handleMCPTaskStatus(w http.ResponseWriter, r *http.Request) {
	applyCORSHeaders(w, r)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if r.Method != http.MethodGet {
		http.Error(w, "only GET is supported", http.StatusMethodNotAllowed)
		return
	}

	// Auth check — same token, same standard.
	if mcpServer == nil {
		http.Error(w, `{"error":"MCP server not initialised"}`, http.StatusServiceUnavailable)
		return
	}

	taskID := extractTaskID(r.URL.Path)
	if taskID == "" {
		http.Error(w, `{"error":"task ID is required"}`, http.StatusBadRequest)
		return
	}

	task := mcpServer.Broker().Get(taskID)
	if task == nil {
		http.Error(w, `{"error":"task not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(task)
}

// ── MCP Dashboard Endpoints ──────────────────────────────────────────────────

// mcpStatusResponse is the JSON shape returned by GET /api/mcp/status.
// It provides all the information the frontend MCP dashboard panel needs.
type mcpStatusResponse struct {
	Enabled   bool     `json:"enabled"`
	TokenHint string   `json:"tokenHint"`
	Endpoint  string   `json:"endpoint"`
	Protocol  string   `json:"protocol"`
	Tools     []string `json:"tools"`
	TaskCount int      `json:"taskCount"`
}

// handleMCPStatus returns the MCP server status for the frontend dashboard.
// This uses the standard auth middleware (session cookie), not the MCP bearer token,
// because it is called by the Forge UI itself.
func handleMCPStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "only GET is supported", http.StatusMethodNotAllowed)
		return
	}

	isEnabled := mcpServer != nil
	response := mcpStatusResponse{
		Enabled:  isEnabled,
		Protocol: "MCP 2024-11-05 (JSON-RPC 2.0)",
		Endpoint: "/api/mcp",
	}

	if isEnabled {
		response.TokenHint = mcpServer.TokenHint()
		response.Tools = mcpServer.ToolNames()
		response.TaskCount = len(mcpServer.Broker().ListAll())
	}

	w.Header().Set("Content-Type", "application/json")
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(response)
}

// handleMCPTasks returns the full task list for the frontend dashboard.
// Uses standard auth middleware (session cookie), not MCP bearer token.
func handleMCPTasks(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "only GET is supported", http.StatusMethodNotAllowed)
		return
	}

	if mcpServer == nil {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte("[]"))
		return
	}

	allTasks := mcpServer.Broker().ListAll()

	w.Header().Set("Content-Type", "application/json")
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(allTasks)
}

// handleMCPToken returns the full MCP bearer token for clipboard copy.
// This endpoint is protected by the standard session auth middleware, so only
// authenticated Forge UI users can read the token.
func handleMCPToken(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "only GET is supported", http.StatusMethodNotAllowed)
		return
	}

	if mcpServer == nil {
		http.Error(w, `{"error":"MCP server not initialised"}`, http.StatusServiceUnavailable)
		return
	}

	token, err := mcp.LoadOrCreateToken()
	if err != nil {
		http.Error(w, `{"error":"could not read token"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(map[string]string{"token": token})
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// resolveProjectPath returns the best available project directory.
// It prefers the current working directory, falling back to the user home.
func resolveProjectPath() string {
	if cwd, err := os.Getwd(); err == nil {
		return cwd
	}
	if home, err := os.UserHomeDir(); err == nil {
		return home
	}
	return "."
}

// loadWorkflowConfigForMCP reads the .forge/workflow.json from the project path,
// returning a zero-value config (no workflow) if the file is absent or unreadable.
func loadWorkflowConfigForMCP(projectPath string) workflow.WorkflowConfig {
	configPath := filepath.Join(projectPath, ".forge", "workflow.json")
	raw, err := os.ReadFile(configPath)
	if err != nil {
		return workflow.WorkflowConfig{}
	}

	var cfg workflow.WorkflowConfig
	if jsonErr := json.Unmarshal(raw, &cfg); jsonErr != nil {
		log.Printf("[MCP] Could not parse .forge/workflow.json: %v", jsonErr)
		return workflow.WorkflowConfig{}
	}
	return cfg
}

// extractTaskID parses the task ID from paths like /api/mcp/tasks/some-uuid.
func extractTaskID(urlPath string) string {
	prefix := "/api/mcp/tasks/"
	if !strings.HasPrefix(urlPath, prefix) {
		return ""
	}
	return strings.TrimPrefix(urlPath, prefix)
}

// applyCORSHeaders adds permissive CORS headers so that browser-based MCP clients
// (and the Forge settings UI) can call /api/mcp without cross-origin errors.
func applyCORSHeaders(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if origin == "" {
		origin = "*"
	}
	w.Header().Set("Access-Control-Allow-Origin", origin)
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.Header().Set("Access-Control-Max-Age", "86400")
}
