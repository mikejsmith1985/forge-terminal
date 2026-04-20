package main

import (
	"net/http"
	"os"
	"strings"
)

// rootlevellabsOrigin returns true when origin is https://rootlevellabs.tech
// or any subdomain (e.g. https://license.rootlevellabs.tech).
func rootlevellabsOrigin(origin string) bool {
	return origin == "https://rootlevellabs.tech" ||
		strings.HasSuffix(origin, ".rootlevellabs.tech") &&
			strings.HasPrefix(origin, "https://")
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

// SecureHeaders adds security headers to responses
func SecureHeaders(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Prevent XSS attacks
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "SAMEORIGIN")
		w.Header().Set("X-XSS-Protection", "1; mode=block")

		// Content Security Policy
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' ws: wss: https://*.trycloudflare.com https://rootlevellabs.tech https://*.rootlevellabs.tech;")

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
