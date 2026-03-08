package jira

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
)

// AuthType distinguishes Jira Cloud from Server/Data Center.
type AuthType string

const (
	AuthTypeCloud  AuthType = "cloud"  // email + API token (Basic auth)
	AuthTypeServer AuthType = "server" // PAT Bearer token
)

// UIMode controls which Jira UI surfaces are enabled.
type UIMode struct {
	Sidebar bool `json:"sidebar"`
	Modal   bool `json:"modal"`
	HUD     bool `json:"hud"`
}

// Config holds all Jira integration settings.
type Config struct {
	BaseURL           string                 `json:"baseUrl"`
	AuthType          AuthType               `json:"authType"`
	Email             string                 `json:"email,omitempty"`    // cloud only
	APIToken          string                 `json:"apiToken,omitempty"` // cloud API token or server PAT
	DefaultProjectKey string                 `json:"defaultProjectKey,omitempty"`
	BranchTemplate    string                 `json:"branchTemplate"`
	PRTemplate        string                 `json:"prTemplate"`
	UIMode            UIMode                 `json:"uiMode"`
	CustomFields      map[string]string      `json:"customFields,omitempty"`
}

// DefaultConfig returns sensible defaults.
var DefaultConfig = Config{
	BranchTemplate: "{{type}}/{{key}}-{{slug}}",
	PRTemplate:     "{{key}}: {{summary}}",
	UIMode: UIMode{
		Sidebar: true,
		Modal:   true,
		HUD:     true,
	},
	CustomFields: map[string]string{},
}

// DetectAuthType infers whether the Jira instance is cloud or server based on the URL.
func DetectAuthType(baseURL string) AuthType {
	lower := strings.ToLower(baseURL)
	if strings.Contains(lower, "atlassian.net") {
		return AuthTypeCloud
	}
	return AuthTypeServer
}

// IsConfigured returns true if the config has the minimum required fields.
func (c *Config) IsConfigured() bool {
	return c.BaseURL != "" && c.APIToken != ""
}

// configFilePath returns the path to the jira-config.json file.
func configFilePath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".forge", "jira-config.json"), nil
}

// LoadConfig reads jira-config.json, returning defaults if absent.
func LoadConfig() (*Config, error) {
	path, err := configFilePath()
	if err != nil {
		return nil, err
	}

	if _, err := os.Stat(path); os.IsNotExist(err) {
		cfg := DefaultConfig
		return &cfg, nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	// Start from defaults so any missing fields keep their defaults.
	cfg := DefaultConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}

	// Auto-update authType whenever baseUrl changes.
	if cfg.BaseURL != "" {
		cfg.AuthType = DetectAuthType(cfg.BaseURL)
	}

	return &cfg, nil
}

// SaveConfig writes config to ~/.forge/jira-config.json.
func SaveConfig(cfg *Config) error {
	// Always re-derive auth type before saving.
	if cfg.BaseURL != "" {
		cfg.AuthType = DetectAuthType(cfg.BaseURL)
	}

	path, err := configFilePath()
	if err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(path, data, 0600)
}
