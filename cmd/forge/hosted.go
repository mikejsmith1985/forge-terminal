package main

import (
	"os"
	"path/filepath"
	"strings"
)

// HostedConfig holds configuration for hosted mode.
// When enabled, Forge binds on all interfaces with auth and tunnel auto-start.
type HostedConfig struct {
	Enabled         bool
	Host            string
	NoBrowser       bool
	TunnelAutoStart bool
}

// parseHostedConfig checks args for the --hosted / -hosted flag.
func parseHostedConfig(args []string) *HostedConfig {
	cfg := &HostedConfig{}
	for _, arg := range args {
		if arg == "--hosted" || arg == "-hosted" {
			cfg.Enabled = true
			cfg.Host = "0.0.0.0"
			cfg.NoBrowser = true
			cfg.TunnelAutoStart = true
			break
		}
	}
	return cfg
}

// hostedTokenPath returns the path where the hosted auth token is persisted.
// Location: <os.UserConfigDir>/forge/hosted_token
func hostedTokenPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "forge", "hosted_token"), nil
}

// loadPersistedToken tries to read a previously saved hosted auth token from disk.
// Returns an empty string if the file does not exist or cannot be read.
func loadPersistedToken() string {
	path, err := hostedTokenPath()
	if err != nil {
		return ""
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

// persistToken saves the hosted auth token to disk so it survives restarts.
func persistToken(token string) {
	path, err := hostedTokenPath()
	if err != nil {
		return
	}
	if mkErr := os.MkdirAll(filepath.Dir(path), 0700); mkErr != nil {
		return
	}
	_ = os.WriteFile(path, []byte(token), 0600)
}

// applyHostedConfig sets up global state for hosted mode (auth token, tunnel).
// Token precedence: FORGE_TOKEN env var > persisted file > newly generated.
func applyHostedConfig(cfg *HostedConfig) {
	if !cfg.Enabled {
		return
	}
	cfg.TunnelAutoStart = true

	token := os.Getenv("FORGE_TOKEN")
	if token == "" {
		token = loadPersistedToken()
	}
	if token == "" {
		token = GenerateToken()
		persistToken(token)
	}
	SetAuthToken(token)
}
