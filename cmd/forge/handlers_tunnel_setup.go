package main

// Tunnel setup wizard endpoints — the HTTP surface for the
// Named Tunnel onboarding flow.
//
//   POST /api/tunnel/setup/install         — download cloudflared into ~/.forge/bin
//   POST /api/tunnel/setup/login           — spawn `cloudflared tunnel login`, return auth URL
//   GET  /api/tunnel/setup/login/status    — poll the currently-active login session
//   POST /api/tunnel/setup/login/cancel    — kill the current login session
//   GET  /api/tunnel/setup/zones           — list Cloudflare zones the cert grants
//   POST /api/tunnel/setup/create          — create tunnel, route DNS, write config.yml
//   GET  /api/tunnel/setup/status          — aggregate wizard state (installed/loggedIn/created)
//
// A single in-memory LoginSession is tracked under loginMu. While a
// login is running, repeat POSTs to /login are idempotent: they return
// the existing session's auth URL instead of spawning a second child.
// Once the session reaches a terminal state, the next POST starts a
// fresh one.

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/tunnel"
)

var (
	loginMu      sync.Mutex
	currentLogin *tunnel.LoginSession
)

// authURLGrace is how long POST /login blocks waiting for the auth URL
// before returning. Long enough for cloudflared's usual startup
// latency, short enough that a wedged child doesn't hold the HTTP
// connection forever.
const authURLGrace = 10 * time.Second

// handleTunnelSetupInstall downloads the cloudflared binary into
// ~/.forge/bin atomically. Safe to call when cloudflared is already
// installed — returns status=already_installed in that case.
func handleTunnelSetupInstall(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	// Use a bounded context so a stuck download doesn't pin a goroutine.
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Minute)
	defer cancel()

	res, err := tunnel.Install(ctx)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, res)
}

// handleTunnelSetupLogin starts (or reuses) a cloudflared login
// session. The response carries the auth URL as soon as it is
// available — headless users copy-paste it into another browser.
func handleTunnelSetupLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	loginMu.Lock()
	// If a prior session is finished, discard it so a new POST can
	// start fresh. A still-running session is reused.
	if currentLogin != nil && currentLogin.IsTerminal() {
		currentLogin = nil
	}
	if currentLogin == nil {
		// Use background context so the session outlives the HTTP
		// request — the user may poll /status over many requests.
		sess, err := tunnel.StartLogin(context.Background())
		if err != nil {
			loginMu.Unlock()
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		currentLogin = sess
	}
	sess := currentLogin
	loginMu.Unlock()

	sess.WaitForAuthURL(authURLGrace)
	writeJSON(w, http.StatusOK, sess.Snapshot())
}

// handleTunnelSetupLoginStatus returns the current snapshot of the
// in-flight (or last-completed) login session.
func handleTunnelSetupLoginStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	loginMu.Lock()
	sess := currentLogin
	loginMu.Unlock()

	if sess == nil {
		writeJSON(w, http.StatusOK, map[string]string{"status": "idle"})
		return
	}
	writeJSON(w, http.StatusOK, sess.Snapshot())
}

// handleTunnelSetupLoginCancel terminates the in-flight login session,
// if any. Safe to call when none is active (returns 204).
func handleTunnelSetupLoginCancel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	loginMu.Lock()
	sess := currentLogin
	loginMu.Unlock()

	if sess != nil {
		sess.Cancel()
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleTunnelSetupZones returns the best-effort list of Cloudflare
// zones accessible to the logged-in token. Empty-but-successful means
// the cert is valid but no zones are reachable; the UI should fall
// back to a manual hostname entry field.
func handleTunnelSetupZones(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()

	zones, err := tunnel.ListZones(ctx)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"zones": []any{},
			"error": err.Error(),
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"zones": zones})
}

// tunnelCreateRequest is the JSON body of POST /api/tunnel/setup/create.
type tunnelCreateRequest struct {
	Hostname  string `json:"hostname"`
	LocalPort int    `json:"localPort"`
}

// handleTunnelSetupCreate runs the full create/route/config pipeline
// under a wizard-wide mutex. Safe to retry: rerunning with the same
// hostname reuses the existing tunnel when local credentials are intact.
func handleTunnelSetupCreate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req tunnelCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body: " + err.Error()})
		return
	}
	// 2 minutes is enough for list+create+route+file-copy even on a
	// slow link; anything longer likely indicates a network hang and
	// is better surfaced as an error than as a stuck HTTP request.
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Minute)
	defer cancel()

	cfg, err := tunnel.CreateNamedTunnel(ctx, req.Hostname, req.LocalPort)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	// Start the supervisor immediately so the tunnel is live right after
	// setup — the user should not have to restart Forge manually.
	go startNamedSupervisorIfConfigured(context.Background())

	writeJSON(w, http.StatusOK, map[string]any{
		"status": "created",
		"config": cfg,
	})
}

// handleTunnelSetupRestart stops any running Named Tunnel supervisor and starts
// a fresh one using the current wizard configuration.  Intended for the
// "Repair tunnel" recovery action surfaced when the tunnel is Degraded or
// Stopped.  Returns immediately; the supervisor runs asynchronously.
func handleTunnelSetupRestart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	// Quick synchronous precondition check — no point starting a goroutine
	// when there's nothing to start.
	st := tunnel.LoadWizardState()
	if !st.Created || st.Config == nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error": "no named tunnel configured — complete the setup wizard first",
		})
		return
	}
	go startNamedSupervisorIfConfigured(context.Background())
	writeJSON(w, http.StatusOK, map[string]string{"status": "restarting"})
}

// handleTunnelSetupStatus returns the wizard's aggregate state so the UI
// can render the correct step (install / login / create / ready).  The
// response is augmented with live health from the Named-Tunnel ranker
// (stage / lastError / recoveryHint) so the wizard's "Ready" view can
// show whether the tunnel is actually serving traffic, plus the last
// line cloudflared logged so the user has a clue when it isn't.
func handleTunnelSetupStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	state := tunnel.LoadWizardState()

	// Compose: keep wizard state at the top level for backward compat,
	// add a `health` block and `lastLogLine` for the new ready-view UI.
	health := tunnelRanker.Get(tunnel.ModeIDNamed)
	resp := map[string]any{
		"installed": state.Installed,
		"loggedIn":  state.LoggedIn,
		"created":   state.Created,
		"config":    state.Config,
		"health": map[string]any{
			"stage":        string(health.Stage),
			"lastError":    health.LastError,
			"recoveryHint": health.RecoveryHint,
			"url":          health.URL,
		},
	}
	if sup := getNamedSupervisor(); sup != nil {
		resp["lastLogLine"] = sup.LastLogLine()
	}
	writeJSON(w, http.StatusOK, resp)
}
