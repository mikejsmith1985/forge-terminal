package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/mikejsmith1985/forge-terminal/internal/tunnel"
)

func TestHandleTunnelOptions_MethodNotAllowed(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/tunnel/options", nil)
	rec := httptest.NewRecorder()
	handleTunnelOptions(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("want 405 got %d", rec.Code)
	}
}

func TestHandleTunnelOptions_ReturnsAllModes(t *testing.T) {
	// Isolate home so on-disk state is empty.
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)

	req := httptest.NewRequest(http.MethodGet, "/api/tunnel/options", nil)
	rec := httptest.NewRecorder()
	handleTunnelOptions(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("want 200 got %d: %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		Active     string                `json:"active"`
		Preference tunnel.Preference     `json:"preference"`
		Options    []tunnel.HealthState  `json:"options"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(resp.Options) != 4 {
		t.Fatalf("want 4 options, got %d", len(resp.Options))
	}
	// Active must be one of the returned options.
	found := false
	for _, o := range resp.Options {
		if string(o.Mode) == resp.Active {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("active %q not in options list", resp.Active)
	}
}

func TestHandleTunnelSelect_PersistsPreference(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)

	body := strings.NewReader(`{"mode":"tailscale"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/tunnel/select", body)
	rec := httptest.NewRecorder()
	handleTunnelSelect(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200 got %d: %s", rec.Code, rec.Body.String())
	}

	p := tunnel.LoadPreference()
	if p.Mode != "tailscale" {
		t.Fatalf("preference not persisted, got %q", p.Mode)
	}
}

func TestHandleTunnelSelect_RejectsUnknownMode(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)

	body := strings.NewReader(`{"mode":"not-real"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/tunnel/select", body)
	rec := httptest.NewRecorder()
	handleTunnelSelect(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400 got %d", rec.Code)
	}
}

func TestHandleTunnelSelect_ClearsPreference(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	_ = tunnel.SavePreference("tailscale")

	body := strings.NewReader(`{"mode":""}`)
	req := httptest.NewRequest(http.MethodPost, "/api/tunnel/select", body)
	rec := httptest.NewRecorder()
	handleTunnelSelect(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200 got %d", rec.Code)
	}
	if tunnel.LoadPreference().Mode != "" {
		t.Fatalf("preference should be cleared")
	}
}

func TestHandleTunnelService_Methods(t *testing.T) {
	req := httptest.NewRequest(http.MethodPatch, "/api/tunnel/setup/service", nil)
	rec := httptest.NewRecorder()
	handleTunnelService(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("want 405 got %d", rec.Code)
	}
}

func TestHandleTunnelService_Get(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	req := httptest.NewRequest(http.MethodGet, "/api/tunnel/setup/service", nil)
	rec := httptest.NewRecorder()
	handleTunnelService(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200 got %d: %s", rec.Code, rec.Body.String())
	}
	// Response must JSON-decode to ServiceStatus shape.
	var st tunnel.ServiceStatus
	if err := json.NewDecoder(rec.Body).Decode(&st); err != nil {
		t.Fatalf("decode: %v", err)
	}
}

func TestHandleTunnelMigrateLegacy_NoConfig(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	req := httptest.NewRequest(http.MethodGet, "/api/tunnel/migrate-legacy", nil)
	rec := httptest.NewRecorder()
	handleTunnelMigrateLegacy(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200 got %d: %s", rec.Code, rec.Body.String())
	}
	var resp map[string]any
	_ = json.NewDecoder(rec.Body).Decode(&resp)
	if resp["legacyDetected"] != false {
		t.Fatalf("empty config should not report legacy, got %v", resp["legacyDetected"])
	}
}
