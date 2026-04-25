// handlers_ping.go exposes a tiny unauthenticated /api/ping endpoint that the
// Named-tunnel supervisor (internal/tunnel/named.go) uses as its end-to-end
// liveness probe.
//
// Why this lives outside the auth middleware:
//
//   - The probe runs from the local supervisor goroutine and ships no token.
//   - Cloudflare itself does not inject our auth header, so requests landing
//     here from `https://<hostname>/api/ping` arrive cookieless and bare.
//   - The probe is meant to verify "end-to-end routing works" — Cloudflare
//     reaches Forge — not "the user is logged in".  Putting it behind auth
//     means the supervisor can never see Healthy and the whole gating logic
//     in the companion wizard wedges (see issue #102 follow-up).
//
// The body is intentionally tiny and JSON-typed so callers can sanity-check
// the response without parsing free-form text.
package main

import (
	"net/http"
)

// pingResponseBody is the literal JSON the probe expects.  Kept as a const
// so the probe and the handler can never drift.
const pingResponseBody = `{"ok":true,"service":"forge"}`

// registerPingHandler wires /api/ping into the default ServeMux.  Called
// from main() before the catch-all "/" handler so path-precedence routes
// the probe here rather than into the desktop UI fall-through.
func registerPingHandler() {
	http.HandleFunc("/api/ping", handlePing)
}

// handlePing replies 200 + JSON regardless of method or auth state.
func handlePing(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(pingResponseBody))
}
