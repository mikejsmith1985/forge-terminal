package main

import (
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"strings"
)

// globalToken is the auth token for remote access. Empty means no auth required.
var globalToken string

// SetAuthToken configures the global auth token.
func SetAuthToken(token string) {
	globalToken = token
}

// GenerateToken generates a cryptographically secure random token.
func GenerateToken() string {
	tokenBytes := make([]byte, 24)
	_, _ = rand.Read(tokenBytes)
	return base64.URLEncoding.EncodeToString(tokenBytes)
}

// AuthMiddleware protects routes with token-based authentication.
// When globalToken is empty, all requests pass through unchanged.
// When set, requests must supply the token via one of:
//   - A "forge_token" HttpOnly cookie (set automatically on first authenticated request)
//   - An "Authorization: Bearer <token>" header
//   - A "?token=<token>" query parameter (sets the cookie then proceeds)
func AuthMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if globalToken == "" {
			next(w, r)
			return
		}

		// Check ?token= query param — validate, set cookie, then serve
		if q := r.URL.Query().Get("token"); q == globalToken {
			isSecure := r.Header.Get("X-Forwarded-Proto") == "https" || r.TLS != nil
			http.SetCookie(w, &http.Cookie{
				Name:     "forge_token",
				Value:    q,
				Path:     "/",
				HttpOnly: true,
				SameSite: http.SameSiteStrictMode,
				Secure:   isSecure,
			})
			next(w, r)
			return
		}

		// Check for valid session cookie
		if cookie, err := r.Cookie("forge_token"); err == nil && cookie.Value == globalToken {
			next(w, r)
			return
		}

		// Check Authorization: Bearer header
		if auth := r.Header.Get("Authorization"); strings.HasPrefix(auth, "Bearer ") {
			if strings.TrimPrefix(auth, "Bearer ") == globalToken {
				next(w, r)
				return
			}
		}

		// Unauthorized — return appropriate response based on request type
		isWebSocket := strings.EqualFold(r.Header.Get("Upgrade"), "websocket")
		accept := r.Header.Get("Accept")
		if strings.Contains(accept, "text/html") || (r.URL.Path == "/" && !isWebSocket) {
			http.Error(w, "Unauthorized: include ?token=<token> in the URL", http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"unauthorized","message":"Token required. Include ?token=<token> in the URL or Authorization: Bearer <token> header."}`))
	}
}
