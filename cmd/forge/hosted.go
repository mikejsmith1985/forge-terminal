package main

import "os"

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

// applyHostedConfig sets up global state for hosted mode (auth token, tunnel).
func applyHostedConfig(cfg *HostedConfig) {
	if !cfg.Enabled {
		return
	}
	cfg.TunnelAutoStart = true

	token := os.Getenv("FORGE_TOKEN")
	if token == "" {
		token = GenerateToken()
	}
	SetAuthToken(token)
}
