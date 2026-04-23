// handlers_tunnel_providers.go — provider availability detection for the
// Companion Access Card. Exposes GET /api/tunnel/providers so the UI can
// show the user which tunnel backend will actually work on their machine
// before they click "Enable Remote Access".
//
// Detection rules:
//   - Tailscale: requires the tailscale binary AND a responsive daemon AND
//     the user is signed in (BackendState == "Running" and Self.DNSName set).
//   - Cloudflare: requires the cloudflared binary on PATH or ~/.forge/bin.
//
// The detection is lightweight (a single short-timeout `tailscale status`
// call; no network roundtrip). Results are returned unpacked so the frontend
// can render nuanced hints ("Tailscale installed but not signed in") instead
// of just "unavailable".
package main

import (
	"context"
	"encoding/json"
	"net/http"
	"os/exec"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/tunnel"
)

// providerAvailability describes whether a single tunnel provider is usable
// on this machine and, when it is not, explains why in a user-facing string.
type providerAvailability struct {
	Available bool   `json:"available"`
	Reason    string `json:"reason,omitempty"`
}

// providerDetection is the full response body for GET /api/tunnel/providers.
// `Selected` is the provider the backend would use right now if the user
// clicked "Enable Remote Access" — respects an explicit setting first, then
// falls back to availability. `Explicit` is true when the user has chosen a
// provider in Settings (so the UI can show a "change in Settings" hint).
type providerDetection struct {
	Tailscale  providerAvailability `json:"tailscale"`
	Cloudflare providerAvailability `json:"cloudflare"`
	Selected   string               `json:"selected"` // "tailscale" | "cloudflare" | ""
	Explicit   bool                 `json:"explicit"`
}

// detectTailscale returns whether Tailscale Funnel is ready to use. The probe
// runs `tailscale status --json` with a short timeout so a hung daemon does
// not stall the whole request.
func detectTailscale() providerAvailability {
	bin := tunnel.ResolveTailscalePath()
	if bin == "" {
		return providerAvailability{Available: false, Reason: "Tailscale is not installed"}
	}

	// 2-second timeout: status is a local call and should return instantly.
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	output, err := exec.CommandContext(ctx, bin, "status", "--json").Output()
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return providerAvailability{Available: false, Reason: "Tailscale daemon is not responding"}
		}
		return providerAvailability{Available: false, Reason: "Tailscale daemon is not running"}
	}

	var status struct {
		BackendState string `json:"BackendState"`
		Self         struct {
			DNSName string `json:"DNSName"`
		} `json:"Self"`
	}
	if err := json.Unmarshal(output, &status); err != nil {
		return providerAvailability{Available: false, Reason: "Tailscale returned an unreadable status"}
	}
	if status.BackendState != "" && status.BackendState != "Running" {
		return providerAvailability{Available: false, Reason: "Tailscale is installed but not signed in"}
	}
	if status.Self.DNSName == "" {
		return providerAvailability{Available: false, Reason: "Tailscale is installed but not signed in"}
	}
	return providerAvailability{Available: true}
}

// detectCloudflare returns whether the cloudflared binary is available.
// There is no daemon to probe — either the binary is present or it is not.
func detectCloudflare() providerAvailability {
	if tunnel.ResolvePath() == "" {
		return providerAvailability{Available: false, Reason: "cloudflared is not installed"}
	}
	return providerAvailability{Available: true}
}

// resolveSelectedProvider applies the preference order:
//  1. Explicit user choice (notifications.json → tunnelProvider) — honored even if unavailable
//  2. Tailscale if available
//  3. Cloudflare if available
//  4. Empty string → UI must prompt the user to install one
func resolveSelectedProvider(explicit string, tailscaleOK, cloudflareOK bool) (selected string, isExplicit bool) {
	switch explicit {
	case "tailscale":
		return "tailscale", true
	case "cloudflare", "cloudflare-named":
		return "cloudflare", true
	}
	if tailscaleOK {
		return "tailscale", false
	}
	if cloudflareOK {
		return "cloudflare", false
	}
	return "", false
}

// handleTunnelProviders serves GET /api/tunnel/providers. The companion card
// calls this once when expanded so it can show the right provider label and
// any install hints before the user hits the Launch button.
func handleTunnelProviders(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}

	cfg, _ := loadNotifyConfig()
	tailscale := detectTailscale()
	cloudflare := detectCloudflare()
	selected, isExplicit := resolveSelectedProvider(cfg.TunnelProvider, tailscale.Available, cloudflare.Available)

	writeJSON(w, http.StatusOK, providerDetection{
		Tailscale:  tailscale,
		Cloudflare: cloudflare,
		Selected:   selected,
		Explicit:   isExplicit,
	})
}
