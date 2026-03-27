package main

import (
	"os"
	"testing"
)

func TestParseHostedConfig(t *testing.T) {
	tests := []struct {
		name          string
		args          []string
		wantHosted    bool
		wantHost      string
		wantNoBrowser bool
	}{
		{
			name:       "no flags",
			args:       []string{"forge"},
			wantHosted: false,
		},
		{
			name:          "--hosted flag present",
			args:          []string{"forge", "--hosted"},
			wantHosted:    true,
			wantHost:      "0.0.0.0",
			wantNoBrowser: true,
		},
		{
			name:          "-hosted flag present",
			args:          []string{"forge", "-hosted"},
			wantHosted:    true,
			wantHost:      "0.0.0.0",
			wantNoBrowser: true,
		},
		{
			name:          "hosted with custom port",
			args:          []string{"forge", "--hosted", "--port", "9999"},
			wantHosted:    true,
			wantHost:      "0.0.0.0",
			wantNoBrowser: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := parseHostedConfig(tt.args)
			if cfg.Enabled != tt.wantHosted {
				t.Errorf("Enabled = %v, want %v", cfg.Enabled, tt.wantHosted)
			}
			if tt.wantHosted {
				if cfg.Host != tt.wantHost {
					t.Errorf("Host = %q, want %q", cfg.Host, tt.wantHost)
				}
				if cfg.NoBrowser != tt.wantNoBrowser {
					t.Errorf("NoBrowser = %v, want %v", cfg.NoBrowser, tt.wantNoBrowser)
				}
			}
		})
	}
}

func TestHostedModeGeneratesToken(t *testing.T) {
	origToken := globalToken
	defer func() { globalToken = origToken }()

	globalToken = ""
	cfg := &HostedConfig{Enabled: true, Host: "0.0.0.0"}
	applyHostedConfig(cfg)

	if globalToken == "" {
		t.Error("hosted mode should auto-generate auth token")
	}
	if len(globalToken) < 20 {
		t.Errorf("token too short: %d chars", len(globalToken))
	}
}

func TestHostedModeRespectsForgeToken(t *testing.T) {
	origToken := globalToken
	origEnv := os.Getenv("FORGE_TOKEN")
	defer func() {
		globalToken = origToken
		os.Setenv("FORGE_TOKEN", origEnv)
	}()

	os.Setenv("FORGE_TOKEN", "my-custom-token")
	globalToken = ""
	cfg := &HostedConfig{Enabled: true, Host: "0.0.0.0"}
	applyHostedConfig(cfg)

	if globalToken != "my-custom-token" {
		t.Errorf("should use FORGE_TOKEN env, got %q", globalToken)
	}
}

func TestHostedModeSetsTunnelAutoStart(t *testing.T) {
	origToken := globalToken
	defer func() { globalToken = origToken }()

	cfg := &HostedConfig{Enabled: true, Host: "0.0.0.0"}
	applyHostedConfig(cfg)

	if !cfg.TunnelAutoStart {
		t.Error("hosted mode should enable tunnel auto-start")
	}
}
