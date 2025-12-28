package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/BurntSushi/toml"
)

// RouterConfigRequest represents the request body for updating router config
type RouterConfigRequest struct {
	Routing struct {
		Tier1Name string `json:"tier1_name"`
		Tier1Cmd  string `json:"tier1_cmd"`
		Tier2Name string `json:"tier2_name"`
		Tier2Cmd  string `json:"tier2_cmd"`
		Tier3Name string `json:"tier3_name"`
		Tier3Cmd  string `json:"tier3_cmd"`
	} `json:"routing"`
	Context struct {
		IncludeCwd       bool `json:"include_cwd"`
		IncludeGitBranch bool `json:"include_git_branch"`
		IncludeVision    bool `json:"include_vision"`
	} `json:"context"`
}

// RouterConfigResponse represents the response for router config API
type RouterConfigResponse struct {
	Routing struct {
		Tier1Name string `json:"tier1_name"`
		Tier1Cmd  string `json:"tier1_cmd"`
		Tier2Name string `json:"tier2_name"`
		Tier2Cmd  string `json:"tier2_cmd"`
		Tier3Name string `json:"tier3_name"`
		Tier3Cmd  string `json:"tier3_cmd"`
	} `json:"routing"`
	Context struct {
		IncludeCwd       bool `json:"include_cwd"`
		IncludeGitBranch bool `json:"include_git_branch"`
		IncludeVision    bool `json:"include_vision"`
	} `json:"context"`
}

// TestCommandRequest represents a request to test a CLI command
type TestCommandRequest struct {
	Command string `json:"command"`
}

// TestCommandResponse represents the result of testing a CLI command
type TestCommandResponse struct {
	Success   bool   `json:"success"`
	Installed bool   `json:"installed"`
	Version   string `json:"version,omitempty"`
	Output    string `json:"output,omitempty"`
	Error     string `json:"error,omitempty"`
}

// handleRouterConfig handles GET and POST for /api/llm/router-config
func handleRouterConfig(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case http.MethodGet:
		config, err := loadRouterConfig()
		if err != nil {
			log.Printf("[Router Config] Failed to load: %v", err)
			// Return defaults on error
			config = getDefaultRouterConfig()
		}
		json.NewEncoder(w).Encode(config)

	case http.MethodPost:
		var req RouterConfigRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}

		if err := saveRouterConfig(&req); err != nil {
			log.Printf("[Router Config] Failed to save: %v", err)
			http.Error(w, "Failed to save configuration", http.StatusInternalServerError)
			return
		}

		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"message": "Configuration saved",
		})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleTestCommand tests if a CLI tool is installed and accessible
func handleTestCommand(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	var req TestCommandRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		json.NewEncoder(w).Encode(TestCommandResponse{
			Success:   false,
			Installed: false,
			Error:     "Invalid request",
		})
		return
	}

	if req.Command == "" {
		json.NewEncoder(w).Encode(TestCommandResponse{
			Success:   false,
			Installed: false,
			Error:     "Command required",
		})
		return
	}

	log.Printf("[Test Command] Testing: %s", req.Command)

	// Parse the command
	parts := strings.Fields(req.Command)
	if len(parts) == 0 {
		json.NewEncoder(w).Encode(TestCommandResponse{
			Success:   false,
			Installed: false,
			Error:     "Empty command",
		})
		return
	}

	// Execute the command with timeout
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("cmd", "/c", req.Command)
	} else {
		cmd = exec.Command("sh", "-c", req.Command)
	}

	// Hide window on Windows
	hideWindow(cmd)

	output, err := cmd.CombinedOutput()
	outputStr := strings.TrimSpace(string(output))

	if err != nil {
		// Check if it's a "not found" error
		errStr := err.Error()
		if strings.Contains(errStr, "not found") ||
			strings.Contains(errStr, "not recognized") ||
			strings.Contains(errStr, "cannot find") ||
			strings.Contains(outputStr, "not recognized") ||
			strings.Contains(outputStr, "is not recognized") {

			json.NewEncoder(w).Encode(TestCommandResponse{
				Success:   false,
				Installed: false,
				Error:     "Command not found: " + parts[0],
			})
			return
		}

		// Other error - might still be installed but errored
		log.Printf("[Test Command] Error running %s: %v", req.Command, err)
		json.NewEncoder(w).Encode(TestCommandResponse{
			Success:   false,
			Installed: false,
			Error:     errStr,
			Output:    outputStr,
		})
		return
	}

	// Extract version from output if possible
	version := extractVersion(outputStr)

	json.NewEncoder(w).Encode(TestCommandResponse{
		Success:   true,
		Installed: true,
		Version:   version,
		Output:    outputStr,
	})
}

// extractVersion tries to find a version string in command output
func extractVersion(output string) string {
	// Common patterns: v1.2.3, 1.2.3, version 1.2.3
	lines := strings.Split(output, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		// Look for version-like patterns
		if strings.Contains(strings.ToLower(line), "version") ||
			strings.HasPrefix(line, "v") ||
			(len(line) > 0 && line[0] >= '0' && line[0] <= '9') {

			// Extract just the version number if possible
			words := strings.Fields(line)
			for _, word := range words {
				if len(word) > 0 && (word[0] == 'v' || (word[0] >= '0' && word[0] <= '9')) {
					// Clean up the version string
					word = strings.TrimPrefix(word, "v")
					word = strings.TrimSuffix(word, ",")
					word = strings.TrimSuffix(word, ".")
					if len(word) > 0 && word[0] >= '0' && word[0] <= '9' {
						return word
					}
				}
			}
		}
	}
	return ""
}

// getDefaultRouterConfig returns default configuration
// Task 3: Default fallback commands as specified:
// - Tier 1 (Haiku): gh copilot suggest "{prompt}"
// - Tier 2 (Sonnet): gh copilot suggest "{prompt}"
// - Tier 3 (Opus): claude "{prompt}" --model opus
func getDefaultRouterConfig() *RouterConfigResponse {
	resp := &RouterConfigResponse{}
	resp.Routing.Tier1Name = "Copilot"
	resp.Routing.Tier1Cmd = `gh copilot suggest "{prompt}"`
	resp.Routing.Tier2Name = "Copilot"
	resp.Routing.Tier2Cmd = `gh copilot suggest "{prompt}"`
	resp.Routing.Tier3Name = "Claude"
	resp.Routing.Tier3Cmd = `claude "{prompt}" --model opus`
	resp.Context.IncludeCwd = true
	resp.Context.IncludeGitBranch = true
	resp.Context.IncludeVision = true
	return resp
}

// loadRouterConfig loads configuration from forge.toml
func loadRouterConfig() (*RouterConfigResponse, error) {
	// Try current directory first
	configPath := "forge.toml"
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		// Try home directory
		homeDir, _ := os.UserHomeDir()
		configPath = filepath.Join(homeDir, ".forge", "forge.toml")
		if _, err := os.Stat(configPath); os.IsNotExist(err) {
			return getDefaultRouterConfig(), nil
		}
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, err
	}

	var tomlConfig struct {
		Routing struct {
			Tier1Name string `toml:"tier1_name"`
			Tier1Cmd  string `toml:"tier1_cmd"`
			Tier2Name string `toml:"tier2_name"`
			Tier2Cmd  string `toml:"tier2_cmd"`
			Tier3Name string `toml:"tier3_name"`
			Tier3Cmd  string `toml:"tier3_cmd"`
		} `toml:"routing"`
		Context struct {
			IncludeCwd       bool `toml:"include_cwd"`
			IncludeGitBranch bool `toml:"include_git_branch"`
			IncludeVision    bool `toml:"include_vision"`
		} `toml:"context"`
	}

	if err := toml.Unmarshal(data, &tomlConfig); err != nil {
		return nil, err
	}

	resp := &RouterConfigResponse{}
	resp.Routing.Tier1Name = tomlConfig.Routing.Tier1Name
	resp.Routing.Tier1Cmd = tomlConfig.Routing.Tier1Cmd
	resp.Routing.Tier2Name = tomlConfig.Routing.Tier2Name
	resp.Routing.Tier2Cmd = tomlConfig.Routing.Tier2Cmd
	resp.Routing.Tier3Name = tomlConfig.Routing.Tier3Name
	resp.Routing.Tier3Cmd = tomlConfig.Routing.Tier3Cmd
	resp.Context.IncludeCwd = tomlConfig.Context.IncludeCwd
	resp.Context.IncludeGitBranch = tomlConfig.Context.IncludeGitBranch
	resp.Context.IncludeVision = tomlConfig.Context.IncludeVision

	return resp, nil
}

// saveRouterConfig saves configuration to forge.toml
func saveRouterConfig(req *RouterConfigRequest) error {
	// Determine config path - prefer home directory for persistence
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return err
	}

	forgeDir := filepath.Join(homeDir, ".forge")
	if err := os.MkdirAll(forgeDir, 0755); err != nil {
		return err
	}

	configPath := filepath.Join(forgeDir, "forge.toml")

	// Build TOML content
	tomlContent := `# Forge Terminal - Smart Model Routing Configuration
# Define which CLI tool to use for each complexity tier

[routing]
# Tier 1: Free/Unlimited - Use for quick tasks (linting, tests, simple edits)
tier1_name = "` + req.Routing.Tier1Name + `"
tier1_cmd = "` + escapeTomlString(req.Routing.Tier1Cmd) + `"

# Tier 2: Standard - Use for refactoring, debugging, code review
tier2_name = "` + req.Routing.Tier2Name + `"
tier2_cmd = "` + escapeTomlString(req.Routing.Tier2Cmd) + `"

# Tier 3: High Reasoning - Use for architecture, design, complex analysis
tier3_name = "` + req.Routing.Tier3Name + `"
tier3_cmd = "` + escapeTomlString(req.Routing.Tier3Cmd) + `"

[context]
# Automatically include terminal context in prompts
include_cwd = ` + boolToString(req.Context.IncludeCwd) + `
include_git_branch = ` + boolToString(req.Context.IncludeGitBranch) + `
include_vision = ` + boolToString(req.Context.IncludeVision) + `

# Available placeholders for commands:
# {prompt}     - The user's input after "?"
# {cwd}        - Current working directory
# {branch}     - Git branch name
# {vision}     - Recent Forge Vision summary (if available)
# {file}       - Currently focused file (if detected)
`

	log.Printf("[Router Config] Saving to: %s", configPath)
	return os.WriteFile(configPath, []byte(tomlContent), 0644)
}

func escapeTomlString(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, "\"", "\\\"")
	return s
}

func boolToString(b bool) string {
	if b {
		return "true"
	}
	return "false"
}
