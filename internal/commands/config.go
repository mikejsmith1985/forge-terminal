package commands

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
)

// Config represents user configuration
type Config struct {
	// Shell settings
	ShellType   string `json:"shellType"`   // "powershell", "cmd", or "wsl"
	WSLDistro   string `json:"wslDistro"`   // e.g., "Ubuntu-24.04"
	WSLHomePath string `json:"wslHomePath"` // e.g., "/home/mikej" (auto-detected if empty)
	CmdHomePath string `json:"cmdHomePath"` // CMD default working directory
	PsHomePath  string `json:"psHomePath"`  // PowerShell default working directory
}

// DefaultConfig returns default configuration
var DefaultConfig = Config{
	ShellType:   "cmd",
	WSLDistro:   "",
	WSLHomePath: "",
}

// GetConfigPath returns the path to the config JSON file
func GetConfigPath() (string, error) {
	configDir, err := GetConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(configDir, "config.json"), nil
}

// LoadConfig loads config from the JSON file, creating defaults if needed
func LoadConfig() (*Config, error) {
	path, err := GetConfigPath()
	if err != nil {
		return nil, err
	}

	// Return default if doesn't exist
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return &DefaultConfig, nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var config Config
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, err
	}

	return &config, nil
}

// SaveConfig saves config to the JSON file
func SaveConfig(config *Config) error {
	configDir, err := GetConfigDir()
	if err != nil {
		return err
	}

	// Ensure directory exists
	if err := os.MkdirAll(configDir, 0700); err != nil {
		return err
	}

	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return err
	}

	path, err := GetConfigPath()
	if err != nil {
		return err
	}

	return os.WriteFile(path, data, 0600)
}

// GetWelcomeShownPath returns the path to the welcome_shown file
func GetWelcomeShownPath() (string, error) {
	configDir, err := GetConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(configDir, "welcome_shown"), nil
}

// IsWelcomeShown checks if the welcome screen has been shown for the current version
func IsWelcomeShown(currentVersion string) bool {
	path, err := GetWelcomeShownPath()
	if err != nil {
		return false
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return false
	}

	// File contains the version for which welcome was shown
	shownVersion := strings.TrimSpace(string(data))
	return shownVersion == currentVersion
}

// SetWelcomeShown marks the welcome screen as shown for the given version
func SetWelcomeShown(version string) error {
	configDir, err := GetConfigDir()
	if err != nil {
		return err
	}

	// Ensure directory exists
	if err := os.MkdirAll(configDir, 0700); err != nil {
		return err
	}

	path, err := GetWelcomeShownPath()
	if err != nil {
		return err
	}

	return os.WriteFile(path, []byte(version), 0600)
}
