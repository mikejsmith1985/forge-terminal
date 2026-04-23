package main

import (
	"net/http"
	"os"
	"strings"

	"github.com/mikejsmith1985/forge-terminal/internal/tunnel"
)

// rootlevellabsOrigin returns true when origin is https://rootlevellabs.tech
// or any subdomain (e.g. https://license.rootlevellabs.tech).
func rootlevellabsOrigin(origin string) bool {
	return origin == "https://rootlevellabs.tech" ||
		strings.HasSuffix(origin, ".rootlevellabs.tech") &&
			strings.HasPrefix(origin, "https://")
}

// tunnelHostnamesForCSP returns the set of hostnames Forge's active
// tunnel modes expose, formatted as `https://<host>` for direct use in
// Content-Security-Policy connect-src.
//
// Sources:
//   - Named Tunnel hostname from the wizard state.json
//   - Legacy named-tunnel hostname from notify_config.json (migration compat).
//   - Tailscale MagicDNS name if a Self.DNSName was cached in the ranker.
//
// Quick Tunnel hosts (*.trycloudflare.com) are covered by a wildcard
// below — no need to enumerate them here.
func tunnelHostnamesForCSP() []string {
	var out []string
	seen := map[string]bool{}

	add := func(host string) {
		if host == "" {
			return
		}
		url := "https://" + host
		if seen[url] {
			return
		}
		seen[url] = true
		out = append(out, url)
	}

	// Wizard-managed named tunnel
	if st := tunnel.LoadWizardState(); st.Created && st.Config != nil {
		add(st.Config.Hostname)
	}

	// Legacy token-based named tunnel
	if cfg, err := loadNotifyConfig(); err == nil {
		if cfg.CloudflareTunnelHostname != "" {
			add(cfg.CloudflareTunnelHostname)
		}
		if cfg.BaseURL != "" {
			// BaseURL is a full URL; strip scheme before re-prefixing.
			host := strings.TrimPrefix(cfg.BaseURL, "https://")
			host = strings.TrimPrefix(host, "http://")
			if i := strings.Index(host, "/"); i >= 0 {
				host = host[:i]
			}
			add(host)
		}
	}

	return out
}

// CORSMiddleware adds CORS headers to support GitHub Pages and rootlevellabs.tech frontends.
func CORSMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Get allowed origins from environment or default to localhost + rootlevellabs.tech
		allowedOrigins := os.Getenv("ALLOWED_ORIGINS")
		if allowedOrigins == "" {
			allowedOrigins = "http://localhost:3000,http://localhost:8333,http://127.0.0.1:8333"
		}

		origin := r.Header.Get("Origin")
		isAllowed := false

		// Always allow rootlevellabs.tech and its subdomains
		if rootlevellabsOrigin(origin) {
			isAllowed = true
		}

		// Allow origins matching any active tunnel hostname so the
		// companion PWA served over /companion/ can call /api/* on the
		// same host from a different origin (e.g. the PWA fetched via
		// Cloudflare cached at a slightly different URL).
		if !isAllowed {
			for _, tunnelOrigin := range tunnelHostnamesForCSP() {
				if origin == tunnelOrigin {
					isAllowed = true
					break
				}
			}
		}

		if !isAllowed {
			for _, allowed := range strings.Split(allowedOrigins, ",") {
				allowed = strings.TrimSpace(allowed)
				if allowed == "*" || origin == allowed {
					isAllowed = true
					break
				}
			}
		}

		if isAllowed {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}

		// Handle preflight requests
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.Header().Set("Access-Control-Max-Age", "3600")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.WriteHeader(http.StatusOK)
			return
		}

		// Add response headers for all requests
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Credentials", "true")

		next(w, r)
	}
}

// buildCSP constructs the Content-Security-Policy header value. The
// connect-src allowlist is dynamic: it always includes the active
// tunnel hostnames so the companion PWA can call /api/* from whichever
// origin it was loaded at.
func buildCSP() string {
	// connect-src: self + websockets + quick-tunnel wildcard + any
	// currently-configured named tunnel hostname.
	connectSrc := []string{"'self'", "ws:", "wss:", "https://*.trycloudflare.com"}
	for _, host := range tunnelHostnamesForCSP() {
		connectSrc = append(connectSrc, host)
	}
	// Retain rootlevellabs.tech for the licensing/docs sites even when
	// the user has no named tunnel configured.
	connectSrc = append(connectSrc,
		"https://rootlevellabs.tech", "https://*.rootlevellabs.tech")

	return "default-src 'self'; " +
		"script-src 'self' 'unsafe-inline'; " +
		"style-src 'self' 'unsafe-inline'; " +
		"img-src 'self' data: https:; " +
		"font-src 'self' data:; " +
		"connect-src " + strings.Join(connectSrc, " ") + ";"
}

// SecureHeaders adds security headers to responses
func SecureHeaders(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Prevent XSS attacks
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "SAMEORIGIN")
		w.Header().Set("X-XSS-Protection", "1; mode=block")

		// Content Security Policy — built dynamically so the
		// connect-src allowlist grows with the user's tunnel config.
		w.Header().Set("Content-Security-Policy", buildCSP())

		next(w, r)
	}
}

// LicenseMiddleware returns 402 Payment Required when the server started without
// a valid license. licenseGated is set in main.go after CheckLicense().
func LicenseMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if licenseGated {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusPaymentRequired)
			_, _ = w.Write([]byte(`{"error":"license required","code":"license_required"}`))
			return
		}
		next(w, r)
	}
}

// WrapWithMiddleware wraps a handler with CORS, security, auth, and license middleware.
func WrapWithMiddleware(handler http.HandlerFunc) http.HandlerFunc {
	return CORSMiddleware(SecureHeaders(AuthMiddleware(LicenseMiddleware(handler))))
}

// WrapLicenseHandler wraps a handler with CORS, security, and auth — but NOT the
// license check. Used for /api/license/* endpoints that must work pre-activation.
func WrapLicenseHandler(handler http.HandlerFunc) http.HandlerFunc {
	return CORSMiddleware(SecureHeaders(AuthMiddleware(handler)))
}
