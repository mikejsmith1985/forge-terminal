package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// ─── Request / Response types ─────────────────────────────────────────────────

type atlassianSetupRequest struct {
	JiraURL  string `json:"jiraUrl"`
	Email    string `json:"email"`
	APIToken string `json:"apiToken"`
}

type atlassianSetupStep struct {
	Name   string `json:"name"`
	Status string `json:"status"` // "ok" | "error" | "skip"
	Detail string `json:"detail"`
}

type atlassianSetupResponse struct {
	Success bool                 `json:"success"`
	Steps   []atlassianSetupStep `json:"steps"`
}

type atlassianStatusResponse struct {
	Configured bool   `json:"configured"`
	UVXPresent bool   `json:"uvxPresent"`
	JiraURL    string `json:"jiraUrl,omitempty"`
	Email      string `json:"email,omitempty"`
}

// ─── MCP config file types ────────────────────────────────────────────────────

type mcpServerDef struct {
	Type    string            `json:"type"`
	Command string            `json:"command"`
	Args    []string          `json:"args"`
	Env     map[string]string `json:"env"`
	Tools   []string          `json:"tools"`
}

type mcpConfigFile struct {
	MCPServers map[string]mcpServerDef `json:"mcpServers"`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func mcpConfigPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".copilot", "mcp-config.json"), nil
}

func loadMCPConfig() mcpConfigFile {
	cfg := mcpConfigFile{MCPServers: make(map[string]mcpServerDef)}
	path, err := mcpConfigPath()
	if err != nil {
		return cfg
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return cfg
	}
	json.Unmarshal(data, &cfg) //nolint:errcheck
	if cfg.MCPServers == nil {
		cfg.MCPServers = make(map[string]mcpServerDef)
	}
	return cfg
}

func saveMCPConfig(cfg mcpConfigFile) error {
	path, err := mcpConfigPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}

func uvxAvailable() bool {
	_, err := exec.LookPath("uvx")
	return err == nil
}

// ─── GET /api/atlassian/status ────────────────────────────────────────────────

func handleAtlassianStatus(w http.ResponseWriter, r *http.Request) {
	cfg := loadMCPConfig()
	resp := atlassianStatusResponse{
		UVXPresent: uvxAvailable(),
	}
	if srv, ok := cfg.MCPServers["atlassian"]; ok {
		resp.Configured = true
		resp.JiraURL = srv.Env["JIRA_URL"]
		resp.Email = srv.Env["JIRA_USERNAME"]
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp) //nolint:errcheck
}

// ─── POST /api/atlassian/setup ────────────────────────────────────────────────

func handleAtlassianSetup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req atlassianSetupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	req.JiraURL = strings.TrimRight(strings.TrimSpace(req.JiraURL), "/")
	req.Email = strings.TrimSpace(req.Email)
	req.APIToken = strings.TrimSpace(req.APIToken)

	if req.JiraURL == "" || req.Email == "" || req.APIToken == "" {
		http.Error(w, "jiraUrl, email, and apiToken are required", http.StatusBadRequest)
		return
	}

	var steps []atlassianSetupStep
	w.Header().Set("Content-Type", "application/json")

	// Helper: append step and optionally short-circuit
	fail := func(name, detail string) {
		steps = append(steps, atlassianSetupStep{Name: name, Status: "error", Detail: detail})
		json.NewEncoder(w).Encode(atlassianSetupResponse{Success: false, Steps: steps}) //nolint:errcheck
	}
	ok := func(name, detail string) {
		steps = append(steps, atlassianSetupStep{Name: name, Status: "ok", Detail: detail})
	}

	// ── Step 1: Check / install uvx ──────────────────────────────────────────
	if uvxAvailable() {
		ok("Check uvx", "uvx is already installed ✓")
	} else {
		steps = append(steps, atlassianSetupStep{Name: "Check uvx", Status: "skip", Detail: "uvx not found — installing uv..."})

		out, err := exec.Command("pip", "install", "uv").CombinedOutput()
		if err != nil {
			fail("Install uv", fmt.Sprintf("pip install uv failed: %s", strings.TrimSpace(string(out))))
			return
		}
		ok("Install uv", "uv installed successfully")

		if !uvxAvailable() {
			fail("Verify uvx", "uvx still not found after installing uv. Python's Scripts directory may not be in PATH — restart Forge Terminal and try again.")
			return
		}
		ok("Verify uvx", "uvx is ready ✓")
	}

	// ── Step 2: Verify Jira credentials ──────────────────────────────────────
	jiraReq, err := http.NewRequest("GET", req.JiraURL+"/rest/api/2/myself", nil)
	if err != nil {
		fail("Verify Jira credentials", fmt.Sprintf("Invalid Jira URL: %v", err))
		return
	}
	jiraReq.SetBasicAuth(req.Email, req.APIToken)
	jiraReq.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(jiraReq)
	if err != nil {
		fail("Verify Jira credentials", fmt.Sprintf("Could not reach Jira — check the URL: %v", err))
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		snippet := string(body)
		if len(snippet) > 200 {
			snippet = snippet[:200] + "..."
		}
		fail("Verify Jira credentials", fmt.Sprintf("Jira returned HTTP %d — double-check your email and API token. Response: %s", resp.StatusCode, snippet))
		return
	}

	var me map[string]interface{}
	json.Unmarshal(body, &me) //nolint:errcheck
	name, _ := me["displayName"].(string)
	if name == "" {
		name = req.Email
	}
	ok("Verify Jira credentials", fmt.Sprintf("Connected as %s ✓", name))

	// ── Step 3: Write ~/.copilot/mcp-config.json ──────────────────────────────
	mcpCfg := loadMCPConfig()
	mcpCfg.MCPServers["atlassian"] = mcpServerDef{
		Type:    "local",
		Command: "uvx",
		Args:    []string{"mcp-atlassian"},
		Env: map[string]string{
			"JIRA_URL":       req.JiraURL,
			"JIRA_USERNAME":  req.Email,
			"JIRA_API_TOKEN": req.APIToken,
		},
		Tools: []string{"*"},
	}

	if err := saveMCPConfig(mcpCfg); err != nil {
		fail("Write MCP config", fmt.Sprintf("Failed to save config: %v", err))
		return
	}

	path, _ := mcpConfigPath()
	ok("Write MCP config", fmt.Sprintf("Saved to %s ✓", path))

	json.NewEncoder(w).Encode(atlassianSetupResponse{Success: true, Steps: steps}) //nolint:errcheck
}

// ─── DELETE /api/atlassian/config ─────────────────────────────────────────────

func handleAtlassianDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	cfg := loadMCPConfig()
	delete(cfg.MCPServers, "atlassian")
	if err := saveMCPConfig(cfg); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"ok": true}) //nolint:errcheck
}
