// Package tunnel — on-demand detection of every available tunnel mode.
//
// Detection is intentionally cheap and stateless: each call inspects the
// filesystem and (for Tailscale) asks the daemon for its status, but it
// never probes the internet. That keeps the /api/tunnel/options endpoint
// under 200ms in the common case and lets the frontend re-fetch as
// often as it needs without adding load.
//
// Health (as distinct from detection) is tracked by the Ranker the
// Named supervisor writes into; Detect only flips Ranker entries for
// modes that the supervisor doesn't own (Quick, Tailscale, LAN).
package tunnel

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// DetectAll populates ranker with a fresh snapshot for every mode.
// Safe to call concurrently — Ranker.Set is mutex-protected.
//
// Modes the Named supervisor manages (ModeIDNamed) are left alone so
// this function cannot accidentally mask a live supervisor transition.
func DetectAll(ctx context.Context, ranker *Ranker, localPort int) {
	ranker.Set(detectNamed(ranker.Get(ModeIDNamed)))
	ranker.Set(detectTailscale(ctx))
	ranker.Set(detectQuick())
	ranker.Set(detectLAN(localPort))
}

// detectNamed returns the current Named state if a supervisor has
// already written one; otherwise derives Configured/Absent from the
// wizard files on disk. Never downgrades Healthy → Configured.
func detectNamed(current HealthState) HealthState {
	if current.Stage == StageHealthy || current.Stage == StageDegraded ||
		current.Stage == StageStarting {
		// Live supervisor owns the state — don't touch it.
		return current
	}
	st := LoadWizardState()
	if !st.Created {
		return HealthState{
			Mode:         ModeIDNamed,
			Stage:        StageAbsent,
			RecoveryHint: "Set up a Named Tunnel for a stable URL",
		}
	}
	url := ""
	if st.Config != nil && st.Config.Hostname != "" {
		url = "https://" + st.Config.Hostname
	}
	return HealthState{
		Mode:         ModeIDNamed,
		Stage:        StageConfigured,
		URL:          url,
		RecoveryHint: "Start Forge with the Named tunnel enabled",
	}
}

// detectTailscale asks the local daemon (if installed) for its
// BackendState + Funnel status. A short timeout guards against wedged
// daemons.
func detectTailscale(ctx context.Context) HealthState {
	bin := ResolveTailscalePath()
	if bin == "" {
		return HealthState{
			Mode:         ModeIDTailscale,
			Stage:        StageAbsent,
			RecoveryHint: "Install Tailscale from tailscale.com",
		}
	}
	statusCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	out, err := exec.CommandContext(statusCtx, bin, "status", "--json").Output()
	if err != nil {
		return HealthState{
			Mode:         ModeIDTailscale,
			Stage:        StageAbsent,
			LastError:    "tailscale status failed: " + err.Error(),
			RecoveryHint: "Open the Tailscale app and sign in",
		}
	}
	var s struct {
		BackendState string `json:"BackendState"`
		Self         struct {
			DNSName string `json:"DNSName"`
		} `json:"Self"`
	}
	if err := json.Unmarshal(out, &s); err != nil {
		return HealthState{Mode: ModeIDTailscale, Stage: StageAbsent,
			LastError: "tailscale status JSON malformed"}
	}
	if s.BackendState != "Running" || s.Self.DNSName == "" {
		return HealthState{
			Mode:         ModeIDTailscale,
			Stage:        StageConfigured,
			LastError:    "tailscale not connected (" + s.BackendState + ")",
			RecoveryHint: "Open the Tailscale app and sign in",
		}
	}
	return HealthState{
		Mode:  ModeIDTailscale,
		Stage: StageConfigured,
		URL:   "https://" + strings.TrimSuffix(s.Self.DNSName, "."),
	}
}

// detectQuick reports Absent unless cloudflared is on disk; a Quick
// Tunnel can always be started on demand if the binary is present.
// The actual URL is only known after the supervisor hands it to the
// ranker, so this stays at Configured.
func detectQuick() HealthState {
	if ResolvePath() == "" {
		return HealthState{
			Mode:         ModeIDQuick,
			Stage:        StageAbsent,
			RecoveryHint: "Install cloudflared via the setup wizard",
		}
	}
	return HealthState{
		Mode:         ModeIDQuick,
		Stage:        StageConfigured,
		RecoveryHint: "Starts automatically — URL rotates on each Forge restart",
	}
}

// detectLAN picks the first non-loopback IPv4 address on any up
// interface. Returns Absent when the host has no routable interface
// (unusual but possible on an air-gapped laptop).
func detectLAN(localPort int) HealthState {
	ip := firstRoutableIPv4()
	if ip == "" || localPort <= 0 {
		return HealthState{
			Mode:  ModeIDLAN,
			Stage: StageAbsent,
		}
	}
	return HealthState{
		Mode:  ModeIDLAN,
		Stage: StageConfigured,
		URL:   fmt.Sprintf("http://%s:%d", ip, localPort),
	}
}

// firstRoutableIPv4 walks local interfaces and returns the first
// up+non-loopback IPv4 address.
func firstRoutableIPv4() string {
	ifaces, err := net.Interfaces()
	if err != nil {
		return ""
	}
	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, _ := iface.Addrs()
		for _, a := range addrs {
			var ip net.IP
			switch v := a.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}
			if ip == nil || ip.IsLoopback() || ip.To4() == nil {
				continue
			}
			return ip.String()
		}
	}
	return ""
}

// ------------------------------------------------------------------
// Preference override — which mode the user (or auto-pick) forced
// ------------------------------------------------------------------

// PreferenceFile is the JSON file in ~/.forge/tunnel that records the
// user's most recent tunnel-mode choice. A missing file or empty
// "mode" field means "auto-pick from the ranker".
const preferenceFilename = "preference.json"

// Preference is what /api/tunnel/select persists and /api/tunnel/options
// reports back so the frontend can render the "Use this instead" active
// state correctly.
type Preference struct {
	// Mode is one of ModeID* or "" (auto).
	Mode string `json:"mode"`
	// UpdatedAt is a debug aid — when the preference was last changed.
	UpdatedAt time.Time `json:"updatedAt"`
}

// preferencePath returns ~/.forge/tunnel/preference.json.
func preferencePath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".forge", "tunnel", preferenceFilename), nil
}

// LoadPreference reads the stored tunnel-mode preference. Returns an
// empty Preference when the file is missing — not an error.
func LoadPreference() Preference {
	path, err := preferencePath()
	if err != nil {
		return Preference{}
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return Preference{}
	}
	var p Preference
	_ = json.Unmarshal(data, &p)
	return p
}

// SavePreference persists a mode choice. Passing "" clears the
// preference (back to auto-pick). Validates against known mode IDs
// to avoid storing garbage that the ranker would silently ignore.
func SavePreference(mode string) error {
	switch mode {
	case "", string(ModeIDNamed), string(ModeIDTailscale),
		string(ModeIDQuick), string(ModeIDLAN):
		// ok
	default:
		return fmt.Errorf("unknown tunnel mode %q", mode)
	}
	path, err := preferencePath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	body, err := json.MarshalIndent(Preference{Mode: mode, UpdatedAt: time.Now()}, "", "  ")
	if err != nil {
		return err
	}
	return atomicWriteFile(path, body, 0o600)
}
