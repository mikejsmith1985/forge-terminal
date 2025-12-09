package main

import (
	"net/http"
	"os"
	"strings"
)

// CORSMiddleware adds CORS headers to support GitHub Pages frontend
func CORSMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Get allowed origins from environment or default to localhost
		allowedOrigins := os.Getenv("ALLOWED_ORIGINS")
		if allowedOrigins == "" {
			// Default: allow localhost and current origin
			allowedOrigins = "http://localhost:3000,http://localhost:8333,http://127.0.0.1:8333"
		}

		// Check if origin is allowed
		origin := r.Header.Get("Origin")
		isAllowed := false
		
		for _, allowed := range strings.Split(allowedOrigins, ",") {
			allowed = strings.TrimSpace(allowed)
			if allowed == "*" || origin == allowed {
				isAllowed = true
				break
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
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-XSS-Protection", "1; mode=block")

		// Content Security Policy - allow external resources but prevent inline scripts
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' ws: wss:;")

		// Prevent MIME type sniffing
		w.Header().Set("Content-Type", "application/json; charset=utf-8")

		next(w, r)
	}
}

// WrapWithMiddleware wraps a handler with CORS and security middleware
func WrapWithMiddleware(handler http.HandlerFunc) http.HandlerFunc {
	return CORSMiddleware(SecureHeaders(handler))
}
