package main

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
)

// PersistentInstructionConfig stores the persistent instruction settings
type PersistentInstructionConfig struct {
	Enabled  bool   `json:"enabled"`
	Template string `json:"template"`
}

// getPersistentInstructionPath returns the path to the persistent instruction config file
func getPersistentInstructionPath() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	forgeDir := filepath.Join(homeDir, ".forge")
	// Ensure .forge directory exists
	if err := os.MkdirAll(forgeDir, 0755); err != nil {
		return "", err
	}
	return filepath.Join(forgeDir, "persistent-instruction.json"), nil
}

// loadPersistentInstructionConfig loads the persistent instruction config from disk
// Returns default config if file doesn't exist (error-resilient)
func loadPersistentInstructionConfig() PersistentInstructionConfig {
	configPath, err := getPersistentInstructionPath()
	if err != nil {
		// Return defaults if we can't get the path
		return PersistentInstructionConfig{
			Enabled:  false,
			Template: "This is a test prompt to verify the persistent instruction system is working correctly.",
		}
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		// Return defaults if file doesn't exist
		return PersistentInstructionConfig{
			Enabled:  false,
			Template: "This is a test prompt to verify the persistent instruction system is working correctly.",
		}
	}

	var config PersistentInstructionConfig
	if err := json.Unmarshal(data, &config); err != nil {
		// Return defaults if JSON is invalid
		return PersistentInstructionConfig{
			Enabled:  false,
			Template: "This is a test prompt to verify the persistent instruction system is working correctly.",
		}
	}

	return config
}

// savePersistentInstructionConfig saves the persistent instruction config to disk
func savePersistentInstructionConfig(config PersistentInstructionConfig) error {
	configPath, err := getPersistentInstructionPath()
	if err != nil {
		return err
	}

	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(configPath, data, 0644)
}

// handleGetPersistentInstruction handles GET /api/persistent-instruction
func handleGetPersistentInstruction(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	config := loadPersistentInstructionConfig()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(config)
}

// handleSavePersistentInstruction handles POST /api/persistent-instruction
func handleSavePersistentInstruction(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var config PersistentInstructionConfig
	if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Validate template is not empty if enabled
	if config.Enabled && config.Template == "" {
		http.Error(w, "Template cannot be empty when enabled", http.StatusBadRequest)
		return
	}

	if err := savePersistentInstructionConfig(config); err != nil {
		http.Error(w, "Failed to save config", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": "success",
	})
}
