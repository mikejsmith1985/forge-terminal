// Package tunnel — health state machine and capability ranking.
//
// This file introduces a unified model for describing every way Forge can
// expose itself to a mobile device (Cloudflare Named Tunnel, Tailscale
// Funnel, Cloudflare Quick Tunnel, bare LAN). Each mode is wrapped in a
// HealthState and ranked by actual health — not merely by whether a
// config file exists on disk.
//
// The key insight from the v7.6.29 plan rubber-duck review: a broken
// Named Tunnel (cert expired, DNS unresolved, binary removed) would score
// as "best" if ranking were based on `configured` alone, leaving the user
// stuck on a dead URL with no obvious way to repair.
package tunnel

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"time"
)

// ModeID is a stable string identifier for each tunnel mode. Using
// strings (instead of the int-valued Mode enum) lets the frontend render
// them in error messages without a lookup table.
type ModeID string

const (
	ModeIDNamed     ModeID = "named"     // Cloudflare Named Tunnel (stable HTTPS, user domain)
	ModeIDTailscale ModeID = "tailscale" // Tailscale Funnel (stable, requires phone app)
	ModeIDQuick     ModeID = "quick"     // Cloudflare Quick Tunnel (rotating *.trycloudflare.com)
	ModeIDLAN       ModeID = "lan"       // Bare LAN IP (same-network only)
)

// HealthStage describes where an option is in its lifecycle.
//
// Transitions:
//
//	Absent    → (setup) → Configured → (start) → Starting → Healthy
//	Healthy   → (probe failure) → Degraded → (probe success) → Healthy
//	Healthy   → (user stop) → Stopped
//	Degraded  → (restart backoff exhausted) → Stopped
//
// Ranking treats Healthy as strictly better than Configured, which is
// strictly better than Degraded, which is better than Absent. Stopped is
// treated like Configured — the tool exists, just nothing is running.
type HealthStage string

const (
	// StageAbsent: the mode cannot be used on this host at all (no binary,
	// no Tailscale daemon, etc.). User would need to install something.
	StageAbsent HealthStage = "absent"

	// StageConfigured: prerequisites exist but no live process/connection
	// has been started yet. Safe to rank above Absent but below Healthy.
	StageConfigured HealthStage = "configured"

	// StageStarting: we just kicked off the supervisor — child process is
	// up but a health probe has not yet succeeded.
	StageStarting HealthStage = "starting"

	// StageHealthy: the last health probe returned 200 within the timeout.
	// This is the only stage we guarantee to users as "ready to connect".
	StageHealthy HealthStage = "healthy"

	// StageDegraded: probes are failing but the supervisor is still trying
	// to recover (backoff has not exhausted). Surface the error in the UI
	// so the user can repair if needed.
	StageDegraded HealthStage = "degraded"

	// StageStopped: explicitly stopped by the user or by backoff exhaustion.
	// Distinct from Absent because the underlying tool is still installed.
	StageStopped HealthStage = "stopped"
)

// HealthState is an immutable snapshot of one tunnel mode at one point in
// time. It carries enough detail for the UI to render both the "best"
// card and the "Other ways to connect" expander without a second fetch.
type HealthState struct {
	Mode ModeID `json:"mode"`

	// Stage is the current lifecycle stage; see HealthStage for the state
	// machine diagram.
	Stage HealthStage `json:"stage"`

	// URL is the public URL this mode would present if it were active.
	// Empty string when Stage is Absent.
	//
	// - Named:     https://forge.<user-domain>
	// - Tailscale: https://<device>.<tailnet>.ts.net  (when Funnel enabled)
	// - Quick:     https://<random>.trycloudflare.com
	// - LAN:       http://<local-ip>:<port>
	URL string `json:"url,omitempty"`

	// LastError is the most recent human-readable failure reason. Empty
	// when healthy. Surfaced verbatim in the Degraded banner.
	LastError string `json:"lastError,omitempty"`

	// LastCheckAt is the wall-clock time of the most recent probe. Nil
	// if no probe has run yet (e.g. StageAbsent).
	LastCheckAt *time.Time `json:"lastCheckAt,omitempty"`

	// RecoveryHint is an actionable next step the UI can show as a button.
	// Examples: "Install cloudflared", "Log in again", "Restart tunnel".
	RecoveryHint string `json:"recoveryHint,omitempty"`
}

// IsUsable returns true when this state is safe to publish as the active
// connection. The ranker uses this as its primary filter before falling
// back to Configured.
func (h HealthState) IsUsable() bool {
	return h.Stage == StageHealthy
}

// rankScore maps each stage to an ordering priority. Higher = better.
// Kept private because callers should use Rank, not raw scores.
func (h HealthState) rankScore() int {
	switch h.Stage {
	case StageHealthy:
		return 100
	case StageStarting:
		return 70 // optimistic: about to become healthy
	case StageConfigured, StageStopped:
		return 50
	case StageDegraded:
		return 30 // worse than configured — we know it's broken
	case StageAbsent:
		return 0
	default:
		return 0
	}
}

// modePreference breaks ties between modes of equal health (e.g. both
// Healthy). Named > Tailscale > Quick > LAN, because that mirrors
// "works from anywhere + least phone-side setup".
func modePreference(m ModeID) int {
	switch m {
	case ModeIDNamed:
		return 4
	case ModeIDTailscale:
		return 3
	case ModeIDQuick:
		return 2
	case ModeIDLAN:
		return 1
	default:
		return 0
	}
}

// Ranker holds the current HealthState for every mode and selects the
// single best option to publish as the active connection URL.
type Ranker struct {
	mu     sync.RWMutex
	states map[ModeID]HealthState
}

// NewRanker returns an empty ranker. All modes start as Absent until a
// detector calls Set.
func NewRanker() *Ranker {
	return &Ranker{states: map[ModeID]HealthState{}}
}

// Set replaces the stored state for a mode. Detectors call this whenever
// they observe a change (binary found, probe succeeded, probe failed).
func (r *Ranker) Set(state HealthState) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.states[state.Mode] = state
}

// Get returns the most recent state for a mode, or a zero-value Absent
// state if no detector has reported yet.
func (r *Ranker) Get(mode ModeID) HealthState {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if s, ok := r.states[mode]; ok {
		return s
	}
	return HealthState{Mode: mode, Stage: StageAbsent}
}

// All returns a sorted slice (best first) of every mode we know about.
// The UI uses this to render the "Other ways to connect" expander; the
// first element is always the current best.
func (r *Ranker) All() []HealthState {
	r.mu.RLock()
	defer r.mu.RUnlock()

	out := make([]HealthState, 0, len(r.states))
	for _, s := range r.states {
		out = append(out, s)
	}

	// Sort by rank score descending, then by mode preference descending
	// for tie-breaking. Stable is not required because we rebuild the
	// slice on every call.
	sortHealthStates(out)
	return out
}

// Best returns the top-ranked state. Falls back to a zero-value
// {Mode:LAN, Stage:Absent} if no modes have been reported, which should
// only happen during the first milliseconds of startup.
func (r *Ranker) Best() HealthState {
	all := r.All()
	if len(all) == 0 {
		return HealthState{Mode: ModeIDLAN, Stage: StageAbsent}
	}
	return all[0]
}

// sortHealthStates sorts states best-first. Extracted for testability.
func sortHealthStates(states []HealthState) {
	// Simple O(n²) sort — we have at most 4 modes; the overhead of
	// pulling in sort.Slice with a closure is disproportionate.
	for i := 0; i < len(states); i++ {
		for j := i + 1; j < len(states); j++ {
			if less(states[j], states[i]) {
				states[i], states[j] = states[j], states[i]
			}
		}
	}
}

// less reports whether a should sort before b (a is "better").
func less(a, b HealthState) bool {
	sa, sb := a.rankScore(), b.rankScore()
	if sa != sb {
		return sa > sb
	}
	return modePreference(a.Mode) > modePreference(b.Mode)
}

// ProbeHTTP is a shared health probe used by the Named and Quick
// supervisors. It issues a GET against `<url>/api/ping` and returns nil
// on 2xx/3xx responses, an error otherwise.
//
// The caller is responsible for setting a deadline on ctx — ProbeHTTP
// intentionally does not impose its own timeout so the external probe
// (8 s, to survive slow Cloudflare TLS round-trips) and the local
// fallback probe (2 s, plenty for loopback) can use different budgets
// without duplicating this function.
//
// The endpoint choice matters: /api/ping is unauthenticated, cheap, and
// proxied through the same handler tree as /api/mobile/*, so a 200 here
// is a meaningful proof that end-to-end routing works — not just that
// cloudflared opened a local socket.
func ProbeHTTP(ctx context.Context, url string) error {
	if url == "" {
		return fmt.Errorf("empty URL")
	}

	probeURL := url + "/api/ping"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, probeURL, nil)
	if err != nil {
		return fmt.Errorf("build probe request: %w", err)
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("probe %s: %w", probeURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("probe %s returned HTTP %d", probeURL, resp.StatusCode)
	}
	return nil
}
