package main

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
)

// QuickInstructionConfig stores the quick instruction settings
type QuickInstructionConfig struct {
	Enabled  bool   `json:"enabled"`
	Template string `json:"template"`
}

// getQuickInstructionPath returns the path to the quick instruction config file
func getQuickInstructionPath() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	forgeDir := filepath.Join(homeDir, ".forge")
	// Ensure .forge directory exists
	if err := os.MkdirAll(forgeDir, 0755); err != nil {
		return "", err
	}
	return filepath.Join(forgeDir, "quick-instruction.json"), nil
}

// loadQuickInstructionConfig loads the quick instruction config from disk
// Returns default config if file doesn't exist (error-resilient)
func loadQuickInstructionConfig() QuickInstructionConfig {
	configPath, err := getQuickInstructionPath()
	if err != nil {
		// Return defaults if we can't get the path
		return QuickInstructionConfig{
			Enabled:  false,
			Template: "This is a test prompt to verify the quick instruction system is working correctly.",
		}
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		// Return defaults if file doesn't exist
		return QuickInstructionConfig{
			Enabled:  false,
			Template: "This is a test prompt to verify the quick instruction system is working correctly.",
		}
	}

	var config QuickInstructionConfig
	if err := json.Unmarshal(data, &config); err != nil {
		// Return defaults if JSON is invalid
		return QuickInstructionConfig{
			Enabled:  false,
			Template: "This is a test prompt to verify the quick instruction system is working correctly.",
		}
	}

	return config
}

// saveQuickInstructionConfig saves the quick instruction config to disk
func saveQuickInstructionConfig(config QuickInstructionConfig) error {
	configPath, err := getQuickInstructionPath()
	if err != nil {
		return err
	}

	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(configPath, data, 0644)
}

// handleGetQuickInstruction handles GET /api/quick-instruction
func handleGetQuickInstruction(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	config := loadQuickInstructionConfig()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(config)
}

// handleSaveQuickInstruction handles POST /api/quick-instruction
func handleSaveQuickInstruction(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var config QuickInstructionConfig
	if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Validate template is not empty if enabled
	if config.Enabled && config.Template == "" {
		http.Error(w, "Template cannot be empty when enabled", http.StatusBadRequest)
		return
	}

	if err := saveQuickInstructionConfig(config); err != nil {
		http.Error(w, "Failed to save config", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": "success",
	})
}
