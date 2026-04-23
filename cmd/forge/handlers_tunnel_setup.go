package main

// Tunnel setup wizard endpoints — the HTTP surface for the
// Named Tunnel onboarding flow.
//
//   POST /api/tunnel/setup/install         — download cloudflared into ~/.forge/bin
//   POST /api/tunnel/setup/login           — spawn `cloudflared tunnel login`, return auth URL
//   GET  /api/tunnel/setup/login/status    — poll the currently-active login session
//   POST /api/tunnel/setup/login/cancel    — kill the current login session
//
// A single in-memory LoginSession is tracked under loginMu. While a
// login is running, repeat POSTs to /login are idempotent: they return
// the existing session's auth URL instead of spawning a second child.
// Once the session reaches a terminal state, the next POST starts a
// fresh one.

import (
	"context"
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
