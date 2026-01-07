package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
)

// CopilotConfig represents ~/.copilot/config.json structure
type CopilotConfig struct {
	Banner                  string   `json:"banner,omitempty"`
	Model                   string   `json:"model,omitempty"`
	Theme                   string   `json:"theme,omitempty"`
	RenderMarkdown          *bool    `json:"render_markdown,omitempty"`
	ParallelToolExecution   *bool    `json:"parallel_tool_execution,omitempty"`
	Stream                  *bool    `json:"stream,omitempty"`
	ScreenReader            *bool    `json:"screen_reader,omitempty"`
	TrustedFolders          []string `json:"trusted_folders,omitempty"`
	AllowedURLs             []string `json:"allowed_urls,omitempty"`
	DeniedURLs              []string `json:"denied_urls,omitempty"`
	LogLevel                string   `json:"log_level,omitempty"`
	AutoUpdate              *bool    `json:"auto_update,omitempty"`
	Beep                    *bool    `json:"beep,omitempty"`
}

// ClaudeConfig represents ~/.claude/settings.json structure
type ClaudeConfig struct {
	Model         string `json:"model,omitempty"`
	FallbackModel string `json:"fallback_model,omitempty"`
}

// CLIConfigResponse combines both CLI configs
type CLIConfigResponse struct {
	Copilot         *CopilotConfig   `json:"copilot"`
	Claude          *ClaudeConfig    `json:"claude"`
	CopilotModels   []string         `json:"copilot_models"`
	ClaudeModels    []string         `json:"claude_models"`
	CopilotInstalled bool            `json:"copilot_installed"`
	ClaudeInstalled  bool            `json:"claude_installed"`
}

// getCopilotConfigPath returns the path to Copilot CLI config
func getCopilotConfigPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".copilot", "config.json")
}

// getClaudeConfigPath returns the path to Claude CLI config
func getClaudeConfigPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".claude", "settings.json")
}

// readCopilotConfig reads and parses the Copilot CLI config
func readCopilotConfig() (*CopilotConfig, error) {
	path := getCopilotConfigPath()
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &CopilotConfig{}, nil
		}
		return nil, err
	}

	var config CopilotConfig
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, err
	}
	return &config, nil
}

// readClaudeConfig reads and parses the Claude CLI config
func readClaudeConfig() (*ClaudeConfig, error) {
	path := getClaudeConfigPath()
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &ClaudeConfig{}, nil
		}
		return nil, err
	}

	var config ClaudeConfig
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, err
	}
	return &config, nil
}

// writeCopilotConfig writes the Copilot CLI config
func writeCopilotConfig(config *CopilotConfig) error {
	path := getCopilotConfigPath()
	
	// Read existing config to preserve fields we don't manage
	existing := make(map[string]interface{})
	if data, err := os.ReadFile(path); err == nil {
		json.Unmarshal(data, &existing)
	}
	
	// Update only the fields we manage
	if config.Model != "" {
		existing["model"] = config.Model
	}
	if config.Theme != "" {
		existing["theme"] = config.Theme
	}
	if config.Banner != "" {
		existing["banner"] = config.Banner
	}
	if config.RenderMarkdown != nil {
		existing["render_markdown"] = *config.RenderMarkdown
	}
	if config.ParallelToolExecution != nil {
		existing["parallel_tool_execution"] = *config.ParallelToolExecution
	}
	if config.Stream != nil {
		existing["stream"] = *config.Stream
	}
	if config.TrustedFolders != nil {
		existing["trusted_folders"] = config.TrustedFolders
	}
	if config.AllowedURLs != nil {
		existing["allowed_urls"] = config.AllowedURLs
	}
	
	data, err := json.MarshalIndent(existing, "", "  ")
	if err != nil {
		return err
	}
	
	// Ensure directory exists
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	
	return os.WriteFile(path, data, 0644)
}

// writeClaudeConfig writes the Claude CLI config
func writeClaudeConfig(config *ClaudeConfig) error {
	path := getClaudeConfigPath()
	
	// Read existing config to preserve fields we don't manage
	existing := make(map[string]interface{})
	if data, err := os.ReadFile(path); err == nil {
		json.Unmarshal(data, &existing)
	}
	
	// Update only the fields we manage
	if config.Model != "" {
		existing["model"] = config.Model
	}
	
	data, err := json.MarshalIndent(existing, "", "  ")
	if err != nil {
		return err
	}
	
	// Ensure directory exists
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	
	return os.WriteFile(path, data, 0644)
}

// getCopilotModels extracts available models from copilot --help
func getCopilotModels() []string {
	if _, err := exec.LookPath("copilot"); err != nil {
		return nil
	}
	
	cmd := exec.Command("copilot", "--help")
	hideWindow(cmd) // v3.12.12: Prevent visible console window on Windows
	output, err := cmd.Output()
	if err != nil {
		return nil
	}
	
	// Parse the --model choices from help output
	// Looking for: "claude-sonnet-4.5", "claude-haiku-4.5", etc.
	re := regexp.MustCompile(`"([a-zA-Z0-9.-]+)"`)
	
	var models []string
	inModelSection := false
	for _, line := range strings.Split(string(output), "\n") {
		if strings.Contains(line, "--model") {
			inModelSection = true
		}
		if inModelSection {
			for _, match := range re.FindAllStringSubmatch(line, -1) {
				if len(match) > 1 {
					model := match[1]
					// Filter to only model names (contain letters and numbers/dots)
					if strings.Contains(model, "-") || strings.Contains(model, ".") {
						models = append(models, model)
					}
				}
			}
			// Stop after finding all models in the choices section
			if len(models) > 0 && !strings.Contains(line, "\"") {
				break
			}
		}
	}
	
	// Deduplicate
	seen := make(map[string]bool)
	unique := []string{}
	for _, m := range models {
		if !seen[m] && m != "" {
			seen[m] = true
			unique = append(unique, m)
		}
	}
	
	return unique
}

// getClaudeModels returns Claude model aliases
func getClaudeModels() []string {
	if _, err := exec.LookPath("claude"); err != nil {
		return nil
	}
	// Claude CLI accepts simple aliases
	return []string{"sonnet", "opus", "haiku"}
}

// handleCLIConfig handles GET /api/cli/config
func handleCLIConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	
	copilotConfig, err := readCopilotConfig()
	if err != nil {
		log.Printf("[CLI Config] Error reading Copilot config: %v", err)
		copilotConfig = &CopilotConfig{}
	}
	
	claudeConfig, err := readClaudeConfig()
	if err != nil {
		log.Printf("[CLI Config] Error reading Claude config: %v", err)
		claudeConfig = &ClaudeConfig{}
	}
	
	// Check if CLIs are installed
	_, copilotErr := exec.LookPath("copilot")
	_, claudeErr := exec.LookPath("claude")
	
	response := CLIConfigResponse{
		Copilot:          copilotConfig,
		Claude:           claudeConfig,
		CopilotModels:    getCopilotModels(),
		ClaudeModels:     getClaudeModels(),
		CopilotInstalled: copilotErr == nil,
		ClaudeInstalled:  claudeErr == nil,
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleCLICopilotConfig handles PUT /api/cli/copilot/config
func handleCLICopilotConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut && r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	
	var config CopilotConfig
	if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	
	if err := writeCopilotConfig(&config); err != nil {
		log.Printf("[CLI Config] Error writing Copilot config: %v", err)
		http.Error(w, fmt.Sprintf("Failed to save config: %v", err), http.StatusInternalServerError)
		return
	}
	
	log.Printf("[CLI Config] Updated Copilot config: model=%s, theme=%s", config.Model, config.Theme)
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "saved"})
}

// handleCLIClaudeConfig handles PUT /api/cli/claude/config
func handleCLIClaudeConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut && r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	
	var config ClaudeConfig
	if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	
	if err := writeClaudeConfig(&config); err != nil {
		log.Printf("[CLI Config] Error writing Claude config: %v", err)
		http.Error(w, fmt.Sprintf("Failed to save config: %v", err), http.StatusInternalServerError)
		return
	}
	
	log.Printf("[CLI Config] Updated Claude config: model=%s", config.Model)
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "saved"})
}

// handleCLITrustFolder handles POST /api/cli/copilot/trust
func handleCLITrustFolder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	
	var req struct {
		Folder string `json:"folder"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	
	if req.Folder == "" {
		http.Error(w, "Folder required", http.StatusBadRequest)
		return
	}
	
	// Normalize path for Windows
	folder := req.Folder
	if runtime.GOOS == "windows" {
		folder = filepath.Clean(folder)
	}
	
	config, err := readCopilotConfig()
	if err != nil {
		config = &CopilotConfig{}
	}
	
	// Check if already trusted
	for _, f := range config.TrustedFolders {
		if strings.EqualFold(f, folder) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{
				"status": "already_trusted",
				"folders": config.TrustedFolders,
			})
			return
		}
	}
	
	// Add folder
	config.TrustedFolders = append(config.TrustedFolders, folder)
	
	if err := writeCopilotConfig(config); err != nil {
		http.Error(w, fmt.Sprintf("Failed to save config: %v", err), http.StatusInternalServerError)
		return
	}
	
	log.Printf("[CLI Config] Added trusted folder: %s", folder)
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "added",
		"folders": config.TrustedFolders,
	})
}

// registerCLIConfigHandlers registers CLI config API endpoints
func registerCLIConfigHandlers() {
	http.HandleFunc("/api/cli/config", handleCLIConfig)
	http.HandleFunc("/api/cli/copilot/config", handleCLICopilotConfig)
	http.HandleFunc("/api/cli/claude/config", handleCLIClaudeConfig)
	http.HandleFunc("/api/cli/copilot/trust", handleCLITrustFolder)
	
	log.Printf("[CLI Config] Registered API endpoints")
}
