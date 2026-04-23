package main

// handlers_tunnel_options.go — the capability-ranked tunnel options
// endpoints.
//
// GET  /api/tunnel/options — returns every detectable tunnel mode with
//                             its current HealthState + the user's
//                             active preference, sorted best-first.
// POST /api/tunnel/select  — persists a mode preference (or clears it
//                             back to auto-pick) under
//                             ~/.forge/tunnel/preference.json.
//
// The ranker lives at package scope so the supervisor (when v7.6.30
// lands full health probing) and the detector can share state without
// the frontend needing to know which path updated what.

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/tunnel"
)

// tunnelRanker is the package-wide capability ranker. Detection runs
// on-demand on each GET /options request; live supervisors (Named)
// write into this same ranker so their Healthy/Degraded transitions
// are visible without the detector overwriting them.
var tunnelRanker = tunnel.NewRanker()

// handleTunnelOptions returns the full ranked list plus the user's
// current preference so the UI can render the active state correctly.
func handleTunnelOptions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	tunnel.DetectAll(ctx, tunnelRanker, activePort)
	all := tunnelRanker.All()
	pref := tunnel.LoadPreference()

	// Active mode = preference if set AND still healthy/configured;
	// otherwise the ranker's top pick.
	var active tunnel.ModeID
	if pref.Mode != "" {
		for _, s := range all {
			if string(s.Mode) == pref.Mode &&
				(s.Stage == tunnel.StageHealthy || s.Stage == tunnel.StageConfigured) {
				active = s.Mode
				break
			}
		}
	}
	if active == "" && len(all) > 0 {
		active = all[0].Mode
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"active":     string(active),
		"preference": pref,
		"options":    all,
	})
}

// tunnelSelectRequest is the JSON body of POST /api/tunnel/select.
// Empty string for Mode means "clear preference, resume auto-pick".
type tunnelSelectRequest struct {
	Mode string `json:"mode"`
}

// handleTunnelSelect persists the user's mode preference.
func handleTunnelSelect(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req tunnelSelectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
		return
	}
	if err := tunnel.SavePreference(req.Mode); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, tunnel.LoadPreference())
}

// handleTunnelService handles GET/POST/DELETE /api/tunnel/setup/service.
//   - GET    reports the current ServiceStatus (Windows only).
//   - POST   runs `cloudflared service install` with the wizard config.
//   - DELETE runs `cloudflared service uninstall`.
func handleTunnelService(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	switch r.Method {
	case http.MethodGet:
		st, err := tunnel.QueryService(ctx)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, st)
	case http.MethodPost:
		if err := tunnel.InstallService(ctx); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		st, _ := tunnel.QueryService(ctx)
		writeJSON(w, http.StatusOK, st)
	case http.MethodDelete:
		if err := tunnel.UninstallService(ctx); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		st, _ := tunnel.QueryService(ctx)
		writeJSON(w, http.StatusOK, st)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleTunnelMigrateLegacy surfaces any legacy token-based named tunnel
// config stored in notify_config.json so the UI can offer a one-time
// upgrade prompt. It never deletes the old config — migration is
// informational; the user re-runs the setup wizard to adopt the
// cert.pem-based flow.
func handleTunnelMigrateLegacy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	cfg, err := loadNotifyConfig()
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"legacyDetected": false,
			"reason":         "notify config unreadable: " + err.Error(),
		})
		return
	}

	// Legacy named tunnel = token+hostname pair in notify_config.json
	// AND no cert.pem-based wizard state yet.
	legacy := cfg.TunnelProvider == "cloudflare-named" &&
		cfg.CloudflareTunnelToken != "" &&
		cfg.CloudflareTunnelHostname != ""

	st := tunnel.LoadWizardState()
	writeJSON(w, http.StatusOK, map[string]any{
		"legacyDetected":   legacy && !st.Created,
		"legacyHostname":   cfg.CloudflareTunnelHostname,
		"legacyProvider":   cfg.TunnelProvider,
		"wizardCreated":    st.Created,
		"migrationAdvice":  "Run the setup wizard to create a cert.pem-based Named Tunnel; your old token-based tunnel will keep working until you delete it in Cloudflare Zero Trust.",
	})
}
