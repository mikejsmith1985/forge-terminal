// vault_auth.go — authentication gate for the Forge Vault HTTP API.
//
// The vault stores the user's real credentials, so — unlike the rest of the
// localhost dashboard — it must NOT trust "any process that can reach
// localhost". Every /api/vault/* route is gated by a dedicated vault session
// token that is enforced even when the global remote-access token is unset
// (the default on a localhost install). This closes the vulnerability where any
// local process could `curl http://localhost:<port>/api/vault/entries` (and the
// value endpoint) and read secrets with no credentials at all.
package main

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/mikejsmith1985/forge-terminal/internal/storage"
)

// ── Vault Session Token ──────────────────────────────────────────────────────

const (
	// vaultSessionTokenFilename is the file inside ~/.forge/ that holds the vault
	// session bearer token.
	vaultSessionTokenFilename = "vault-session-token"

	// vaultSessionTokenByteLength is 32 bytes = 256-bit entropy, matching the
	// mobile and MCP tokens.
	vaultSessionTokenByteLength = 32
)

// activeVaultSessionToken is the loaded token that authenticates vault API
// requests. It is set once by initVaultSessionToken() at startup and is safe to
// read concurrently thereafter. Empty means the token failed to load, in which
// case the vault gate fails closed (503) rather than open.
var (
	activeVaultSessionToken     string
	activeVaultSessionTokenOnce sync.Once
)

// initVaultSessionToken loads (or generates) the vault session token from disk.
// It must be called after the storage paths are ready and before routes are
// registered, so the token is available to inject into the served page.
func initVaultSessionToken() {
	activeVaultSessionTokenOnce.Do(func() {
		token, loadErr := loadOrCreateVaultSessionToken()
		if loadErr != nil {
			// Fail closed: with no token loaded, requireVaultAuth returns 503 and
			// the vault API is unreachable rather than silently unauthenticated.
			log.Printf("[Vault] WARNING: could not load vault session token: %v — vault API will be unavailable", loadErr)
			return
		}
		activeVaultSessionToken = token
		log.Printf("[Vault] Session token ready at: %s", vaultSessionTokenPath())
	})
}

// vaultSessionTokenPath returns the absolute path to the vault session token file.
func vaultSessionTokenPath() string {
	return filepath.Join(storage.GetForgeDir(), vaultSessionTokenFilename)
}

// loadOrCreateVaultSessionToken reads the token from disk, generating a fresh
// one if the file does not exist yet. Mirrors loadOrCreateMobileToken.
func loadOrCreateVaultSessionToken() (string, error) {
	tokenPath := vaultSessionTokenPath()

	existingData, readErr := os.ReadFile(tokenPath)
	if readErr == nil {
		trimmedToken := strings.TrimSpace(string(existingData))
		if len(trimmedToken) > 0 {
			return trimmedToken, nil
		}
	}

	return generateAndSaveVaultSessionToken(tokenPath)
}

// generateAndSaveVaultSessionToken creates a random 256-bit hex token and saves
// it to disk with owner-only permissions (0600).
func generateAndSaveVaultSessionToken(tokenPath string) (string, error) {
	rawBytes := make([]byte, vaultSessionTokenByteLength)
	if _, randErr := rand.Read(rawBytes); randErr != nil {
		return "", fmt.Errorf("generating vault session token entropy: %w", randErr)
	}

	newToken := hex.EncodeToString(rawBytes)

	forgeDir := filepath.Dir(tokenPath)
	if mkdirErr := os.MkdirAll(forgeDir, 0700); mkdirErr != nil {
		return "", fmt.Errorf("creating forge dir for vault session token: %w", mkdirErr)
	}

	if writeErr := os.WriteFile(tokenPath, []byte(newToken), 0600); writeErr != nil {
		return "", fmt.Errorf("saving vault session token to disk: %w", writeErr)
	}

	log.Printf("[Vault] Generated new session token, saved to: %s", tokenPath)
	return newToken, nil
}

// validVaultSessionToken reports whether candidate matches the active vault
// session token using a constant-time comparison (timing-attack safe). Returns
// false when no token is loaded.
func validVaultSessionToken(candidate string) bool {
	if activeVaultSessionToken == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(candidate), []byte(activeVaultSessionToken)) == 1
}

// ── Request Gates ────────────────────────────────────────────────────────────

// requireVaultAuth is the metadata-tier gate for vault routes that never return
// a secret value (status, list, add, update, delete, auto-inject). It accepts
// the vault session token via the Authorization: Bearer header, the
// forge_vault_token cookie, a ?token= query parameter, or — when remote access
// is configured — the existing forge_token session cookie. Cross-site origins
// are rejected. Returns true when the request is authorised; on failure it
// writes the appropriate status and returns false.
func requireVaultAuth(w http.ResponseWriter, r *http.Request) bool {
	if activeVaultSessionToken == "" {
		writeVaultAuthError(w, http.StatusServiceUnavailable, "vault auth not initialised — restart Forge")
		return false
	}
	if !vaultOriginAllowed(r) {
		writeVaultAuthError(w, http.StatusForbidden, "origin not allowed")
		return false
	}
	if vaultMetadataTokenPresent(r) {
		return true
	}
	writeVaultAuthError(w, http.StatusUnauthorized, "missing or invalid vault token")
	return false
}

// requireVaultAuthBearerOnly is the secret-tier gate for routes that expose
// actual secret values (reveal, inject). It is stricter than requireVaultAuth:
// the token MUST arrive in the Authorization: Bearer header — cookies and query
// parameters are ignored. Because a cross-site request cannot set a custom
// header without a CORS preflight that vaultOriginAllowed denies, this makes the
// secret-exposing endpoints immune to CSRF via the ambient session cookie.
func requireVaultAuthBearerOnly(w http.ResponseWriter, r *http.Request) bool {
	if activeVaultSessionToken == "" {
		writeVaultAuthError(w, http.StatusServiceUnavailable, "vault auth not initialised — restart Forge")
		return false
	}
	if !vaultOriginAllowed(r) {
		writeVaultAuthError(w, http.StatusForbidden, "origin not allowed")
		return false
	}
	if validVaultSessionToken(bearerToken(r)) {
		return true
	}
	writeVaultAuthError(w, http.StatusUnauthorized, "missing or invalid vault token (Authorization: Bearer required)")
	return false
}

// vaultMetadataTokenPresent reports whether r carries a valid credential for the
// metadata tier, checking (in order) the bearer header, the forge_vault_token
// cookie, a ?token= query parameter, and — only when globalToken is configured —
// the forge_token session cookie. The forge_token branch lets an already-
// authenticated remote session reach metadata without a separate vault token; it
// can never match on a localhost install because globalToken is empty there.
func vaultMetadataTokenPresent(r *http.Request) bool {
	if validVaultSessionToken(bearerToken(r)) {
		return true
	}
	if cookie, cookieErr := r.Cookie("forge_vault_token"); cookieErr == nil && validVaultSessionToken(cookie.Value) {
		return true
	}
	if queryToken := r.URL.Query().Get("token"); queryToken != "" && validVaultSessionToken(queryToken) {
		return true
	}
	if globalToken != "" {
		if cookie, cookieErr := r.Cookie("forge_token"); cookieErr == nil &&
			subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(globalToken)) == 1 {
			return true
		}
	}
	return false
}

// bearerToken extracts the token from an "Authorization: Bearer <token>" header,
// or returns "" when the header is absent or malformed.
func bearerToken(r *http.Request) string {
	authHeader := r.Header.Get("Authorization")
	if !strings.HasPrefix(authHeader, "Bearer ") {
		return ""
	}
	return strings.TrimPrefix(authHeader, "Bearer ")
}

// writeVaultAuthError writes a JSON error response with the given status code.
func writeVaultAuthError(w http.ResponseWriter, statusCode int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_, _ = w.Write([]byte(fmt.Sprintf(`{"error":%q}`, message)))
}

// ── Origin Allowlist ─────────────────────────────────────────────────────────

// vaultOriginAllowed reports whether a request's Origin (or Referer fallback) is
// permitted to reach the vault API. A missing Origin is allowed because
// same-origin GETs and non-browser clients (the desktop UI fetch, curl) do not
// send one — those are still gated by the token. A present Origin must match
// localhost, rootlevellabs.tech, or an active tunnel hostname; anything else is a
// cross-site caller and is rejected. This blocks a malicious web page or browser
// extension from driving the vault API even if it somehow obtained a token.
//
// The allowlist deliberately reuses rootlevellabsOrigin and tunnelHostnamesForCSP
// so it stays in lockstep with the CORS and CSP policies in middleware.go.
func vaultOriginAllowed(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		// Fall back to the Referer's origin so cross-site posts that omit Origin
		// but carry a Referer are still evaluated.
		if referer := r.Header.Get("Referer"); referer != "" {
			origin = originFromURL(referer)
		}
	}
	if origin == "" {
		return true
	}
	if isLocalhostOrigin(origin) {
		return true
	}
	if rootlevellabsOrigin(origin) {
		return true
	}
	for _, tunnelOrigin := range tunnelHostnamesForCSP() {
		if origin == tunnelOrigin {
			return true
		}
	}
	return false
}

// originFromURL reduces a full URL (such as a Referer) to its scheme://host
// origin, or returns "" when the URL cannot be parsed into one.
func originFromURL(rawURL string) string {
	parsed, parseErr := url.Parse(rawURL)
	if parseErr != nil || parsed.Scheme == "" || parsed.Host == "" {
		return ""
	}
	return parsed.Scheme + "://" + parsed.Host
}

// isLocalhostOrigin reports whether origin points at the local machine on any
// port — the desktop UI is served from http://localhost:<port>.
func isLocalhostOrigin(origin string) bool {
	parsed, parseErr := url.Parse(origin)
	if parseErr != nil {
		return false
	}
	host := parsed.Hostname()
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
}
