package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/BurntSushi/toml"
	"github.com/mikejsmith1985/forge-terminal/internal/llm/provider"
)

// TierConfig represents configuration for a single tier
type TierConfig struct {
	Name  string `json:"name" toml:"name"`
	Model string `json:"model" toml:"model"`
}

// RouterConfig represents the new simplified router configuration (v3.3.6)
type RouterConfig struct {
	Tiers      map[string]TierConfig `json:"tiers" toml:"tiers"`
	ActiveTier string                `json:"active_tier" toml:"active_tier"`
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

var (
	routerConfigCache *RouterConfig
	configMutex       sync.RWMutex
)

// getDefaultRouterConfig returns the default tier configuration
func getDefaultRouterConfig() *RouterConfig {
	return &RouterConfig{
		Tiers: map[string]TierConfig{
			"tier1": {Name: "Standard", Model: "gpt-4o-mini"},
			"tier2": {Name: "Advanced", Model: "gpt-4o"},
			"tier3": {Name: "Expert", Model: "claude-3-5-sonnet"},
		},
		ActiveTier: "tier1",
	}
}

// getConfigPath returns the path to forge.toml
func getConfigPath() string {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "forge.toml"
	}
	return filepath.Join(homeDir, ".forge", "forge.toml")
}

// ensureConfigExists creates forge.toml with defaults if it doesn't exist
func ensureConfigExists() error {
	configPath := getConfigPath()

	// Check if config already exists
	if _, err := os.Stat(configPath); err == nil {
		return nil // Config exists
	}

	log.Printf("[Router Config] forge.toml not found, creating with defaults at: %s", configPath)

	// Ensure directory exists
	configDir := filepath.Dir(configPath)
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return err
	}

	// Create default config
	defaultConfig := getDefaultRouterConfig()
	return saveRouterConfigToFile(defaultConfig, configPath)
}

// saveRouterConfigToFile saves config to the specified path
func saveRouterConfigToFile(config *RouterConfig, configPath string) error {
	tomlContent := `# Forge Terminal - Smart Model Routing Configuration (v3.3.6)
# Define which model to use for each complexity tier

[tiers.tier1]
# Standard: Fast, lightweight tasks (quick edits, tests, linting)
name = "` + config.Tiers["tier1"].Name + `"
model = "` + config.Tiers["tier1"].Model + `"

[tiers.tier2]
# Advanced: Balanced tasks (refactoring, debugging, code review)
name = "` + config.Tiers["tier2"].Name + `"
model = "` + config.Tiers["tier2"].Model + `"

[tiers.tier3]
# Expert: Complex tasks (architecture, design, system-level changes)
name = "` + config.Tiers["tier3"].Name + `"
model = "` + config.Tiers["tier3"].Model + `"

# Current active tier
active_tier = "` + config.ActiveTier + `"
`

	log.Printf("[Router Config] Saving to: %s", configPath)
	return os.WriteFile(configPath, []byte(tomlContent), 0644)
}

// loadRouterConfig loads configuration from forge.toml or creates default
func loadRouterConfig() (*RouterConfig, error) {
	// Ensure config exists (auto-init)
	if err := ensureConfigExists(); err != nil {
		log.Printf("[Router Config] Failed to auto-init: %v", err)
	}

	configPath := getConfigPath()

	data, err := os.ReadFile(configPath)
	if err != nil {
		log.Printf("[Router Config] Failed to read %s: %v, using defaults", configPath, err)
		return getDefaultRouterConfig(), nil
	}

	var config RouterConfig
	if err := toml.Unmarshal(data, &config); err != nil {
		log.Printf("[Router Config] Failed to parse TOML: %v, using defaults", err)
		return getDefaultRouterConfig(), nil
	}

	// Ensure tiers map is initialized
	if config.Tiers == nil {
		config.Tiers = getDefaultRouterConfig().Tiers
	}

	// Ensure active_tier has a value
	if config.ActiveTier == "" {
		config.ActiveTier = "tier1"
	}

	return &config, nil
}

// GetRouterConfig returns the current router configuration (cached)
func GetRouterConfig() *RouterConfig {
	configMutex.RLock()
	if routerConfigCache != nil {
		defer configMutex.RUnlock()
		return routerConfigCache
	}
	configMutex.RUnlock()

	// Load and cache
	configMutex.Lock()
	defer configMutex.Unlock()

	config, _ := loadRouterConfig()
	routerConfigCache = config
	return config
}

// GetActiveModel returns the model for the currently active tier
func GetActiveModel() string {
	config := GetRouterConfig()
	if tier, ok := config.Tiers[config.ActiveTier]; ok {
		return tier.Model
	}
	return "gpt-4o-mini" // Default fallback
}

// handleRouterConfig handles GET and POST for /api/llm/router-config
func handleRouterConfig(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case http.MethodGet:
		config, err := loadRouterConfig()
		if err != nil {
			log.Printf("[Router Config] Failed to load: %v", err)
			config = getDefaultRouterConfig()
		}

		// Clear cache to ensure fresh data
		configMutex.Lock()
		routerConfigCache = config
		configMutex.Unlock()

		json.NewEncoder(w).Encode(config)

	case http.MethodPost:
		var req RouterConfig
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}

		// Validate
		if req.Tiers == nil || len(req.Tiers) == 0 {
			http.Error(w, "Tiers configuration required", http.StatusBadRequest)
			return
		}

		// Save to file
		configPath := getConfigPath()
		if err := saveRouterConfigToFile(&req, configPath); err != nil {
			log.Printf("[Router Config] Failed to save: %v", err)
			http.Error(w, "Failed to save configuration", http.StatusInternalServerError)
			return
		}

		// Update cache
		configMutex.Lock()
		routerConfigCache = &req
		configMutex.Unlock()

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
	lines := strings.Split(output, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.Contains(strings.ToLower(line), "version") ||
			strings.HasPrefix(line, "v") ||
			(len(line) > 0 && line[0] >= '0' && line[0] <= '9') {

			words := strings.Fields(line)
			for _, word := range words {
				if len(word) > 0 && (word[0] == 'v' || (word[0] >= '0' && word[0] <= '9')) {
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

// =============================================================================
// Provider Verification API (v3.4.0)
// =============================================================================

// VerifyProviderRequest represents a request to verify a provider
type VerifyProviderRequest struct {
	Provider string `json:"provider"`
	APIKey   string `json:"apiKey,omitempty"`
}

// VerifyProviderResponse represents the response from provider verification
type VerifyProviderResponse struct {
	Success       bool                  `json:"success"`
	Provider      string                `json:"provider"`
	DisplayName   string                `json:"displayName"`
	Installed     bool                  `json:"installed"`
	Authenticated bool                  `json:"authenticated"`
	Models        []provider.ModelInfo  `json:"models,omitempty"`
	Error         string                `json:"error,omitempty"`
	Instructions  string                `json:"instructions,omitempty"`
	BinaryPath    string                `json:"binaryPath,omitempty"`
}

// handleVerifyProvider verifies a single provider's installation and auth status
// POST /api/llm/verify-provider
func handleVerifyProvider(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	var req VerifyProviderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		json.NewEncoder(w).Encode(VerifyProviderResponse{
			Success: false,
			Error:   "Invalid request body",
		})
		return
	}

	if req.Provider == "" {
		json.NewEncoder(w).Encode(VerifyProviderResponse{
			Success: false,
			Error:   "Provider name required",
		})
		return
	}

	log.Printf("[Provider] Verifying provider: %s", req.Provider)

	// If API key provided, try to configure it first
	if req.APIKey != "" {
		if err := provider.SetAPIKey(req.Provider, req.APIKey); err != nil {
			log.Printf("[Provider] Failed to set API key: %v", err)
			// Continue anyway, the auth check will fail if key is invalid
		}
	}

	// Get provider status with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	registry := provider.GetRegistry()
	status, err := registry.GetStatus(ctx, req.Provider)
	if err != nil {
		log.Printf("[Provider] Error getting status: %v", err)
		json.NewEncoder(w).Encode(VerifyProviderResponse{
			Success:  false,
			Provider: req.Provider,
			Error:    err.Error(),
		})
		return
	}

	response := VerifyProviderResponse{
		Success:       true,
		Provider:      status.Name,
		DisplayName:   status.DisplayName,
		Installed:     status.Installed,
		Authenticated: status.Authenticated,
		Models:        status.Models,
		Instructions:  status.Instructions,
		BinaryPath:    status.BinaryPath,
	}

	if status.AuthError != "" {
		response.Error = status.AuthError
	}

	// Set appropriate HTTP status
	if !status.Installed {
		w.WriteHeader(http.StatusNotFound)
		response.Error = "CLI tool not installed"
	} else if !status.Authenticated {
		w.WriteHeader(http.StatusUnauthorized)
		if response.Error == "" {
			response.Error = "Not authenticated. Please login or provide API key."
		}
	}

	log.Printf("[Provider] %s: installed=%v, authenticated=%v, models=%d",
		req.Provider, status.Installed, status.Authenticated, len(status.Models))

	json.NewEncoder(w).Encode(response)
}

// handleListProviders returns all available providers and their statuses
// GET /api/llm/providers
func handleListProviders(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	log.Printf("[Provider] Listing all providers")

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	registry := provider.GetRegistry()
	statuses := registry.VerifyAll(ctx)

	// Convert to response format
	providers := make([]VerifyProviderResponse, 0, len(statuses))
	for _, status := range statuses {
		resp := VerifyProviderResponse{
			Success:       true,
			Provider:      status.Name,
			DisplayName:   status.DisplayName,
			Installed:     status.Installed,
			Authenticated: status.Authenticated,
			Models:        status.Models,
			Instructions:  status.Instructions,
			BinaryPath:    status.BinaryPath,
		}
		if status.AuthError != "" {
			resp.Error = status.AuthError
		}
		providers = append(providers, resp)
	}

	log.Printf("[Provider] Found %d providers", len(providers))

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":   true,
		"providers": providers,
	})
}

// handleProviderModels returns models for a specific provider
// GET /api/llm/providers/{name}/models
func handleProviderModels(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	// Extract provider name from path
	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) < 5 {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Provider name required",
		})
		return
	}
	providerName := pathParts[4]

	log.Printf("[Provider] Getting models for: %s", providerName)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	registry := provider.GetRegistry()
	p, ok := registry.Get(providerName)
	if !ok {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Unknown provider: " + providerName,
		})
		return
	}

	models, err := p.ListModels(ctx)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
			"models":  []interface{}{},
		})
		return
	}

	log.Printf("[Provider] %s has %d models", providerName, len(models))

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"provider": providerName,
		"models":   models,
	})
}
