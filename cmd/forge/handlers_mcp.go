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
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

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

// defaultMCPConfig returns safe startup defaults: MCP enabled, all tools exposed.
func defaultMCPConfig() mcpTOMLConfig {
	trueVal := true
	return mcpTOMLConfig{Enabled: &trueVal, AllowedTools: nil}
}

// loadMCPConfigFromPath reads the [mcp] section from the TOML file at configPath.
// Unlike loadMCPConfig, it returns an error so callers can distinguish a real
// parse failure from a missing section. The caller is responsible for fallback logic.
func loadMCPConfigFromPath(configPath string) (mcpTOMLConfig, error) {
	if _, err := os.Stat(configPath); err != nil {
		return mcpTOMLConfig{}, fmt.Errorf("forge.toml not found at %s: %w", configPath, err)
	}

	var partial forgeTOMLPartial
	if _, err := toml.DecodeFile(configPath, &partial); err != nil {
		return mcpTOMLConfig{}, fmt.Errorf("parsing forge.toml: %w", err)
	}

	cfg := partial.MCP
	if cfg.Enabled == nil {
		trueVal := true
		cfg.Enabled = &trueVal
	}
	return cfg, nil
}

// loadMCPConfig reads forge.toml from the current directory, returning safe defaults
// on any error. This is the startup path; errors are logged but not fatal.
func loadMCPConfig() mcpTOMLConfig {
	cfg, err := loadMCPConfigFromPath("forge.toml")
	if err != nil {
		log.Printf("[MCP] Could not parse forge.toml [mcp] section: %v — using defaults", err)
		return defaultMCPConfig()
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

// mcpConfigAbsPath is the absolute path to forge.toml, resolved once at startup.
// Both the config watcher and the /api/mcp/reload handler use this path so they
// always read the same file regardless of any later cwd changes.
var mcpConfigAbsPath string

// initMCPServer creates the MCP server and loads (or auto-generates) the bearer token.
// It is called once from main() before the HTTP listener starts.
func initMCPServer() {
	cfg := loadMCPConfig()
	if !mcpEnabled(cfg) {
		log.Printf("[MCP] Disabled via forge.toml — MCP endpoint will not be active")
		return
	}

	// Resolve the absolute config path once so both the watcher and the reload
	// endpoint always read the same file, even if the process cwd changes later.
	absPath, err := filepath.Abs("forge.toml")
	if err != nil {
		absPath = "forge.toml"
	}
	mcpConfigAbsPath = absPath

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

	// Start watching forge.toml for changes. Tool list updates take effect
	// automatically without restarting Forge.
	go startForgeConfigWatcher(mcpConfigAbsPath)
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

	if mcpServer == nil {
		http.Error(w, `{"error":"MCP server not initialised"}`, http.StatusServiceUnavailable)
		return
	}

	// Require the same bearer token as /api/mcp — task results are sensitive.
	if !mcpServer.ValidateHTTPRequest(r) {
		http.Error(w, `{"error":"invalid or missing bearer token"}`, http.StatusUnauthorized)
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

// handleMCPUIStatus handles GET /api/mcp/ui-status — returns a lightweight,
// UI-friendly snapshot of the MCP server state for display in the Adaptive
// Build Environments command card. Unlike /api/mcp itself, this endpoint is
// protected by the standard Forge auth middleware (NOT the MCP bearer token)
// so the Forge frontend can read it without ever seeing or forwarding the secret.
func handleMCPUIStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	homeDir, homeErr := os.UserHomeDir()
	tokenPath := ".forge/mcp-token"
	if homeErr == nil {
		tokenPath = filepath.Join(homeDir, ".forge", "mcp-token")
	}

	// MCP is disabled or failed to start — report gracefully so the card
	// can show an "Inactive" state instead of a broken error.
	if mcpServer == nil {
		enc := json.NewEncoder(w)
		_ = enc.Encode(map[string]any{
			"is_enabled":   false,
			"active_tools": []string{},
			"tool_count":   0,
			"token_path":   tokenPath,
		})
		return
	}

	uiStatus := mcpServer.GetUIStatus()
	enc := json.NewEncoder(w)
	_ = enc.Encode(map[string]any{
		"is_enabled":   uiStatus.IsEnabled,
		"active_tools": uiStatus.ActiveTools,
		"tool_count":   uiStatus.ToolCount,
		"token_path":   tokenPath,
	})
}

// handleMCPReload handles POST /api/mcp/reload — re-reads the [mcp] section of
// forge.toml and applies a fresh allowed_tools filter without restarting Forge.
// This endpoint requires the same bearer token as /api/mcp.
func handleMCPReload(w http.ResponseWriter, r *http.Request) {
	applyCORSHeaders(w, r)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "only POST is supported", http.StatusMethodNotAllowed)
		return
	}

	if mcpServer == nil {
		http.Error(w, `{"error":"MCP server not initialised"}`, http.StatusServiceUnavailable)
		return
	}

	if !mcpServer.ValidateHTTPRequest(r) {
		http.Error(w, `{"error":"invalid or missing bearer token"}`, http.StatusUnauthorized)
		return
	}

	cfg, err := loadMCPConfigFromPath(mcpConfigAbsPath)
	if err != nil {
		// Return the error so the caller knows the file is unreadable, but do
		// NOT apply defaults — that could silently widen tool permissions.
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		enc := json.NewEncoder(w)
		_ = enc.Encode(map[string]string{"error": "could not parse forge.toml: " + err.Error()})
		return
	}

	mcpServer.ReloadAllowedTools(cfg.AllowedTools)
	log.Printf("[MCP] Tool list reloaded via /api/mcp/reload")

	w.Header().Set("Content-Type", "application/json")
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(map[string]any{
		"status":        "reloaded",
		"allowed_tools": cfg.AllowedTools,
	})
}

// ── Config Watcher ────────────────────────────────────────────────────────────

// configWatchIntervalSeconds is the polling interval for forge.toml change detection.
// Five seconds balances responsiveness against unnecessary stat() syscalls.
const configWatchIntervalSeconds = 5

// startForgeConfigWatcher polls configPath every configWatchIntervalSeconds.
// When forge.toml's modification time changes, it reloads allowed_tools without
// restarting Forge. Parse failures are logged but never applied — the previous
// tool list is preserved to avoid accidentally widening permissions on a bad save.
func startForgeConfigWatcher(configPath string) {
	ticker := time.NewTicker(configWatchIntervalSeconds * time.Second)
	defer ticker.Stop()

	// Seed the last-known modification time so the first tick is a no-op.
	lastModTime := resolveFileModTime(configPath)

	for range ticker.C {
		if mcpServer == nil {
			continue
		}

		currentModTime := resolveFileModTime(configPath)
		if !currentModTime.After(lastModTime) {
			continue // nothing changed
		}
		lastModTime = currentModTime

		cfg, err := loadMCPConfigFromPath(configPath)
		if err != nil {
			// Keep the previous allowed_tools — a broken save should not open or
			// close tool access until the file is valid again.
			log.Printf("[MCP] Config watcher: could not parse %s — keeping previous allowed_tools: %v", configPath, err)
			continue
		}

		mcpServer.ReloadAllowedTools(cfg.AllowedTools)
		log.Printf("[MCP] Config watcher: reloaded allowed_tools from %s", configPath)
	}
}

// resolveFileModTime returns the modification time of a file, or the zero time
// if the file cannot be stat'd (e.g. during an editor's atomic write cycle).
func resolveFileModTime(filePath string) time.Time {
	info, err := os.Stat(filePath)
	if err != nil {
		return time.Time{}
	}
	return info.ModTime()
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
