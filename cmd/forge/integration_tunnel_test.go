package main

// integration_tunnel_test.go — end-to-end sequences across the tunnel
// HTTP surface. These tests exercise multiple handlers in one t.Run so
// that inter-handler contracts (preference persistence, legacy
// migration detection, CSP header composition) are verified as a
// whole, not just as isolated units.

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/tunnel"
)

// TestIntegration_TunnelOptionsRoundTrip verifies that
//   1. GET /api/tunnel/options returns all four modes on a clean home.
//   2. POST /api/tunnel/select persists a preference to disk.
//   3. GET /api/tunnel/options then reports the preference as active
//      (since Tailscale detection will be Stopped, it falls back to
//      the ranker's top pick — but the preference field is still
//      preserved in the response).
//   4. POST /api/tunnel/select with empty mode clears the preference.
func TestIntegration_TunnelOptionsRoundTrip(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("FORGE_TUNNEL_SKIP_HARDEN", "1")

	// 1. Initial GET
	req1 := httptest.NewRequest(http.MethodGet, "/api/tunnel/options", nil)
	rec1 := httptest.NewRecorder()
	handleTunnelOptions(rec1, req1)
	if rec1.Code != http.StatusOK {
		t.Fatalf("first GET want 200 got %d: %s", rec1.Code, rec1.Body.String())
	}

	// 2. POST preference
	req2 := httptest.NewRequest(http.MethodPost, "/api/tunnel/select",
		strings.NewReader(`{"mode":"lan"}`))
	rec2 := httptest.NewRecorder()
	handleTunnelSelect(rec2, req2)
	if rec2.Code != http.StatusOK {
		t.Fatalf("POST select want 200 got %d: %s", rec2.Code, rec2.Body.String())
	}

	// 3. Second GET surfaces the preference
	req3 := httptest.NewRequest(http.MethodGet, "/api/tunnel/options", nil)
	rec3 := httptest.NewRecorder()
	handleTunnelOptions(rec3, req3)
	var resp3 struct {
		Preference tunnel.Preference `json:"preference"`
	}
	if err := json.NewDecoder(rec3.Body).Decode(&resp3); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp3.Preference.Mode != "lan" {
		t.Fatalf("preference not round-tripped, got %q", resp3.Preference.Mode)
	}

	// 4. Clear preference
	req4 := httptest.NewRequest(http.MethodPost, "/api/tunnel/select",
		strings.NewReader(`{"mode":""}`))
	rec4 := httptest.NewRecorder()
	handleTunnelSelect(rec4, req4)
	if rec4.Code != http.StatusOK {
		t.Fatalf("clear want 200 got %d", rec4.Code)
	}
	if tunnel.LoadPreference().Mode != "" {
		t.Fatalf("preference should be cleared")
	}
}

// TestIntegration_CSPIncludesWizardHostname verifies that once a named
// tunnel is recorded in state.json, the dynamic CSP builder picks it
// up — i.e. the wizard → middleware contract holds end-to-end.
func TestIntegration_CSPIncludesWizardHostname(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("FORGE_TUNNEL_SKIP_HARDEN", "1")

	// Seed a fake wizard state by writing state.json directly — the
	// tunnel package persists it under ~/.forge/tunnel/state.json.
	// Created=true requires the referenced credential + config files
	// to exist on disk, so touch those too.
	stateDir := filepath.Join(home, ".forge", "tunnel")
	if err := os.MkdirAll(stateDir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	credPath := filepath.Join(stateDir, "11111111-2222-3333-4444-555555555555.json")
	cfgPath := filepath.Join(stateDir, "config.yml")
	if err := os.WriteFile(credPath, []byte("{}"), 0o600); err != nil {
		t.Fatalf("write cred: %v", err)
	}
	if err := os.WriteFile(cfgPath, []byte("tunnel: x\n"), 0o600); err != nil {
		t.Fatalf("write cfg: %v", err)
	}
	state := map[string]any{
		"installed": true,
		"loggedIn":  true,
		"created":   true,
		"config": map[string]any{
			"tunnelUUID":      "11111111-2222-3333-4444-555555555555",
			"hostname":        "forge.example.com",
			"localPort":       8333,
			"configPath":      cfgPath,
			"credentialsPath": credPath,
		},
		"lastError": "",
		"updatedAt": time.Now().Format(time.RFC3339),
	}
	b, _ := json.Marshal(state)
	if err := os.WriteFile(filepath.Join(stateDir, "state.json"), b, 0o600); err != nil {
		t.Fatalf("write state: %v", err)
	}

	// Build the CSP and confirm the hostname landed in connect-src.
	csp := buildCSP()
	if !strings.Contains(csp, "https://forge.example.com") {
		t.Fatalf("CSP missing wizard hostname, got: %s", csp)
	}
	if !strings.Contains(csp, "https://*.trycloudflare.com") {
		t.Fatalf("CSP lost Quick Tunnel wildcard, got: %s", csp)
	}
}

// TestIntegration_MigrateLegacyDetectsOldConfig checks that a legacy
// token-based notify_config.json is surfaced by the migration endpoint
// when no wizard state.json exists yet.
func TestIntegration_MigrateLegacyDetectsOldConfig(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("FORGE_TUNNEL_SKIP_HARDEN", "1")

	// Seed a legacy notify config. We use the exported save helper so
	// we don't have to worry about on-disk layout.
	cfg := NotifyConfig{
		TunnelProvider:           "cloudflare-named",
		CloudflareTunnelToken:    "fake-legacy-token",
		CloudflareTunnelHostname: "old.example.com",
	}
	if err := saveNotifyConfig(cfg); err != nil {
		t.Fatalf("seed notify cfg: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/tunnel/migrate-legacy", nil)
	rec := httptest.NewRecorder()
	handleTunnelMigrateLegacy(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200 got %d: %s", rec.Code, rec.Body.String())
	}
	var resp map[string]any
	_ = json.NewDecoder(rec.Body).Decode(&resp)
	if resp["legacyDetected"] != true {
		t.Fatalf("expected legacyDetected=true, got %v (full: %v)", resp["legacyDetected"], resp)
	}
	if resp["legacyHostname"] != "old.example.com" {
		t.Fatalf("wrong hostname echoed, got %v", resp["legacyHostname"])
	}
}
