// handlers_mobile.go implements the Forge Companion mobile API.
//
// The mobile API exposes a small, scoped subset of Forge capabilities to the
// Forge Companion PWA (forge-companion/index.html). It runs on a separate bearer
// token from the MCP token so that a compromised mobile token cannot invoke
// powerful MCP tools (environment_run, workflow tools, etc.).
//
// All /api/mobile/* endpoints except /api/mobile/settings use mobile-bearer
// authentication. Settings is gated by the standard Forge session cookie because
// it is called from the desktop UI, not from the companion app.
//
// CORS headers are applied to all /api/mobile/* endpoints so the companion PWA
// can call them from a different origin (tunnel URL, GitHub Pages, etc.).
package main

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/mikejsmith1985/forge-terminal/internal/commands"
	"github.com/mikejsmith1985/forge-terminal/internal/license"
	"github.com/mikejsmith1985/forge-terminal/internal/storage"
	"github.com/mikejsmith1985/forge-terminal/internal/updater"
)

// ── Mobile Token ─────────────────────────────────────────────────────────────

const (
	// mobileTokenFilename is the file inside ~/.forge/ that holds the mobile bearer token.
	mobileTokenFilename = "mobile-token"

	// mobileTokenByteLength is 32 bytes = 256-bit entropy, matching the MCP token.
	mobileTokenByteLength = 32
)

// activeMobileToken is the loaded token used to authenticate companion app requests.
// It is set once by initMobileToken() at startup and is safe to read concurrently.
var (
	activeMobileToken     string
	activeMobileTokenOnce sync.Once
)

// initMobileToken loads (or generates) the mobile bearer token from disk.
// It must be called after the storage paths are ready, before routes are registered.
func initMobileToken() {
	activeMobileTokenOnce.Do(func() {
		token, err := loadOrCreateMobileToken()
		if err != nil {
			log.Printf("[Mobile] WARNING: could not load mobile token: %v — mobile API will be unavailable", err)
			return
		}
		activeMobileToken = token
		log.Printf("[Mobile] Companion token ready at: %s", mobileTokenPath())
	})
}

// mobileTokenPath returns the absolute path to the mobile token file.
func mobileTokenPath() string {
	return filepath.Join(storage.GetForgeDir(), mobileTokenFilename)
}

// loadOrCreateMobileToken reads the token from disk, generating a fresh one
// if the file does not exist yet. Mirrors the logic in internal/mcp/auth.go.
func loadOrCreateMobileToken() (string, error) {
	tokenPath := mobileTokenPath()

	existingData, readErr := os.ReadFile(tokenPath)
	if readErr == nil {
		trimmedToken := strings.TrimSpace(string(existingData))
		if len(trimmedToken) > 0 {
			return trimmedToken, nil
		}
	}

	return generateAndSaveMobileToken(tokenPath)
}

// generateAndSaveMobileToken creates a random 256-bit hex token and saves it
// to disk with owner-only permissions (0600).
func generateAndSaveMobileToken(tokenPath string) (string, error) {
	rawBytes := make([]byte, mobileTokenByteLength)
	if _, err := rand.Read(rawBytes); err != nil {
		return "", fmt.Errorf("generating mobile token entropy: %w", err)
	}

	newToken := hex.EncodeToString(rawBytes)

	forgeDir := filepath.Dir(tokenPath)
	if err := os.MkdirAll(forgeDir, 0700); err != nil {
		return "", fmt.Errorf("creating forge dir for mobile token: %w", err)
	}

	if err := os.WriteFile(tokenPath, []byte(newToken), 0600); err != nil {
		return "", fmt.Errorf("saving mobile token to disk: %w", err)
	}

	log.Printf("[Mobile] Generated new companion token, saved to: %s", tokenPath)
	return newToken, nil
}

// ── Auth Helpers ──────────────────────────────────────────────────────────────

// validateMobileRequest checks that the request carries the correct mobile bearer
// token. Returns true if authentication succeeded. On failure, it writes a 401
// JSON response and returns false — the caller should return immediately.
func validateMobileRequest(w http.ResponseWriter, r *http.Request) bool {
	if activeMobileToken == "" {
		writeMobileJSON(w, http.StatusServiceUnavailable, map[string]string{
			"error": "mobile token not initialised — restart Forge",
		})
		return false
	}

	authHeader := r.Header.Get("Authorization")
	if !strings.HasPrefix(authHeader, "Bearer ") {
		writeMobileJSON(w, http.StatusUnauthorized, map[string]string{
			"error": "missing Authorization: Bearer <token> header",
		})
		return false
	}

	providedToken := strings.TrimPrefix(authHeader, "Bearer ")
	isTokenMatch := subtle.ConstantTimeCompare(
		[]byte(providedToken),
		[]byte(activeMobileToken),
	) == 1

	if !isTokenMatch {
		writeMobileJSON(w, http.StatusUnauthorized, map[string]string{
			"error": "invalid mobile token",
		})
		return false
	}

	return true
}

// ── CORS Helpers ──────────────────────────────────────────────────────────────

// addMobileCORSHeaders writes the CORS headers required for the companion PWA
// to call /api/mobile/* from a different origin. This function must be called
// before writing any response body.
func addMobileCORSHeaders(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
	w.Header().Set("Vary", "Origin")
}

// handleMobileCORSPreflight handles OPTIONS preflight requests for mobile endpoints.
// It returns true when the request was a preflight (caller should return immediately).
func handleMobileCORSPreflight(w http.ResponseWriter, r *http.Request) bool {
	addMobileCORSHeaders(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return true
	}
	return false
}

// ── JSON Response Helper ──────────────────────────────────────────────────────

// writeMobileJSON serialises v to JSON and writes it with the given status code.
// CORS headers are always included so the companion PWA can read error responses.
func writeMobileJSON(w http.ResponseWriter, statusCode int, v any) {
	addMobileCORSHeaders(w)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)

	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("[Mobile] JSON encode error: %v", err)
	}
}

// ── Feature Gate ──────────────────────────────────────────────────────────────

// isMobileAccessEnabled returns true when the mobile_access feature flag is on
// for the currently loaded license. It reads from the package-level activeLicenseInfo.
func isMobileAccessEnabled() bool {
	return license.HasFeature(activeLicenseInfo, license.FeatureMobileAccess)
}

// ── Endpoint: GET /api/mobile/info ───────────────────────────────────────────

// mobileInfoResponse is returned by /api/mobile/info to the companion app.
type mobileInfoResponse struct {
	// Version is the running Forge binary version.
	Version string `json:"version"`

	// MobileAccessEnabled indicates whether this Forge instance has mobile access
	// unlocked. If false, the companion app should show the upgrade screen.
	MobileAccessEnabled bool `json:"mobile_access_enabled"`

	// UpgradeURL is the URL the user should visit to unlock mobile access.
	UpgradeURL string `json:"upgrade_url,omitempty"`
}

// handleMobileInfo validates the mobile token and returns the Forge version
// plus the mobile feature flag state. This is the companion app's first call —
// it determines whether to show the sessions list or the upgrade screen.
func handleMobileInfo(w http.ResponseWriter, r *http.Request) {
	if handleMobileCORSPreflight(w, r) {
		return
	}
	if !validateMobileRequest(w, r) {
		return
	}

	isMobileEnabled := isMobileAccessEnabled()
	response := mobileInfoResponse{
		Version:             updater.Version,
		MobileAccessEnabled: isMobileEnabled,
	}

	if !isMobileEnabled {
		response.UpgradeURL = "https://rootlevellabs.tech/upgrade"
	}

	writeMobileJSON(w, http.StatusOK, response)
}

// ── Endpoint: GET /api/mobile/sessions ───────────────────────────────────────

// mobileSessionInfo is the companion-specific session representation returned
// by /api/mobile/sessions. It extends ActiveSessionInfo with a human-readable
// tab title so the companion app can display friendly names instead of raw IDs.
type mobileSessionInfo struct {
	SessionID        string `json:"sessionId"`
	TabTitle         string `json:"tabTitle"`
	IsDetached       bool   `json:"isDetached"`
	ConnectedClients int    `json:"connectedClients"`
}

// buildTabTitleIndex loads the persisted session state and returns a map of
// tab ID → human-readable title. Errors are treated as non-fatal: if the file
// cannot be read the caller falls back to using session IDs as titles.
func buildTabTitleIndex() map[string]string {
	titleByTabID := make(map[string]string)

	sessionState, err := commands.LoadSession()
	if err != nil {
		log.Printf("[Mobile] could not load session titles from disk (non-fatal): %v", err)
		return titleByTabID
	}

	for _, tab := range sessionState.Tabs {
		if tab.ID != "" && tab.Title != "" {
			titleByTabID[tab.ID] = tab.Title
		}
	}
	return titleByTabID
}

// handleMobileSessions returns the list of active PTY sessions augmented with
// human-readable tab titles. The companion app renders these as session cards
// and lets the user tap one to open it.
func handleMobileSessions(w http.ResponseWriter, r *http.Request) {
	if handleMobileCORSPreflight(w, r) {
		return
	}
	if !validateMobileRequest(w, r) {
		return
	}
	if !isMobileAccessEnabled() {
		writeMobileJSON(w, http.StatusForbidden, map[string]any{
			"error":       "mobile_access feature is not enabled for this instance",
			"upgrade_url": "https://rootlevellabs.tech/upgrade",
		})
		return
	}

	activeSessions := termHandler.ListActiveSessions()
	titleByTabID := buildTabTitleIndex()

	sessionInfoList := make([]mobileSessionInfo, 0, len(activeSessions))
	for _, activeSession := range activeSessions {
		// Use the persisted tab title when available; fall back to the session ID
		// so the list is always populated even if sessions.json is missing or stale.
		tabTitle := titleByTabID[activeSession.SessionID]
		if tabTitle == "" {
			tabTitle = activeSession.SessionID
		}
		sessionInfoList = append(sessionInfoList, mobileSessionInfo{
			SessionID:        activeSession.SessionID,
			TabTitle:         tabTitle,
			IsDetached:       activeSession.IsDetached,
			ConnectedClients: activeSession.ConnectedClients,
		})
	}

	writeMobileJSON(w, http.StatusOK, map[string]any{
		"sessions": sessionInfoList,
	})
}

// ── Endpoint: POST /api/mobile/exec ──────────────────────────────────────────

// mobileExecRequest is the body expected by POST /api/mobile/exec.
type mobileExecRequest struct {
	// SessionID is the PTY session to write the command to.
	SessionID string `json:"session_id"`

	// Command is the shell command to execute (a newline is appended automatically).
	Command string `json:"command"`
}

// handleMobileExec sends a shell command to a named terminal session and
// immediately returns. The companion app polls /api/mobile/read to see output.
func handleMobileExec(w http.ResponseWriter, r *http.Request) {
	if handleMobileCORSPreflight(w, r) {
		return
	}
	if r.Method != http.MethodPost {
		writeMobileJSON(w, http.StatusMethodNotAllowed, map[string]string{
			"error": "use POST",
		})
		return
	}
	if !validateMobileRequest(w, r) {
		return
	}
	if !isMobileAccessEnabled() {
		writeMobileJSON(w, http.StatusForbidden, map[string]any{
			"error":       "mobile_access feature is not enabled",
			"upgrade_url": "https://rootlevellabs.tech/upgrade",
		})
		return
	}

	var execRequest mobileExecRequest
	if err := json.NewDecoder(r.Body).Decode(&execRequest); err != nil {
		writeMobileJSON(w, http.StatusBadRequest, map[string]string{
			"error": "invalid JSON body: " + err.Error(),
		})
		return
	}

	if execRequest.SessionID == "" {
		writeMobileJSON(w, http.StatusBadRequest, map[string]string{
			"error": "session_id is required",
		})
		return
	}
	if execRequest.Command == "" {
		writeMobileJSON(w, http.StatusBadRequest, map[string]string{
			"error": "command is required",
		})
		return
	}

	if err := termHandler.WriteCommandToSession(execRequest.SessionID, execRequest.Command); err != nil {
		writeMobileJSON(w, http.StatusNotFound, map[string]string{
			"error": err.Error(),
		})
		return
	}

	writeMobileJSON(w, http.StatusOK, map[string]string{
		"status": "sent",
	})
}

// ── Endpoint: GET /api/mobile/read ───────────────────────────────────────────

// handleMobileRead returns the current scrollback buffer for a session.
// The companion app calls this endpoint every second to refresh its terminal view.
// ANSI escape sequences are stripped server-side so the PWA can render plain text.
func handleMobileRead(w http.ResponseWriter, r *http.Request) {
	if handleMobileCORSPreflight(w, r) {
		return
	}
	if !validateMobileRequest(w, r) {
		return
	}
	if !isMobileAccessEnabled() {
		writeMobileJSON(w, http.StatusForbidden, map[string]any{
			"error":       "mobile_access feature is not enabled",
			"upgrade_url": "https://rootlevellabs.tech/upgrade",
		})
		return
	}

	sessionID := r.URL.Query().Get("session_id")
	if sessionID == "" {
		writeMobileJSON(w, http.StatusBadRequest, map[string]string{
			"error": "session_id query parameter is required",
		})
		return
	}

	rawScrollback, sessionFound := termHandler.GetSessionScrollback(sessionID)
	if !sessionFound {
		writeMobileJSON(w, http.StatusNotFound, map[string]string{
			"error": fmt.Sprintf("no session with id %q", sessionID),
		})
		return
	}

	strippedOutput := stripANSICodes(string(rawScrollback))

	writeMobileJSON(w, http.StatusOK, map[string]any{
		"session_id": sessionID,
		"output":     strippedOutput,
		"size":       len(rawScrollback),
	})
}

// stripANSICodes removes ANSI/VT100 escape sequences from terminal output so
// the companion PWA can display it as plain text without extra libraries.
//
// This function strips: CSI sequences (\x1b[...m, \x1b[...H, etc.), OSC sequences
// (\x1b]...BEL/ST), and standalone escape characters.
func stripANSICodes(rawTerminalOutput string) string {
	if !strings.ContainsRune(rawTerminalOutput, '\x1b') {
		return rawTerminalOutput
	}

	var cleanOutput strings.Builder
	cleanOutput.Grow(len(rawTerminalOutput))

	inputRunes := []rune(rawTerminalOutput)
	totalRunes := len(inputRunes)

	for position := 0; position < totalRunes; position++ {
		currentRune := inputRunes[position]

		if currentRune != '\x1b' {
			cleanOutput.WriteRune(currentRune)
			continue
		}

		// ESC character found — skip the sequence that follows.
		nextPosition := position + 1
		if nextPosition >= totalRunes {
			break
		}

		switch inputRunes[nextPosition] {
		case '[':
			// CSI sequence: \x1b[ ... <final byte in 0x40–0x7E range>
			position = nextPosition + 1
			for position < totalRunes {
				sequenceByte := inputRunes[position]
				position++
				if sequenceByte >= 0x40 && sequenceByte <= 0x7E {
					// Found the final byte — CSI sequence consumed.
					position--
					break
				}
			}

		case ']':
			// OSC sequence: \x1b] ... BEL (\x07) or ST (\x1b\\)
			position = nextPosition + 1
			for position < totalRunes {
				sequenceByte := inputRunes[position]
				if sequenceByte == '\x07' {
					break
				}
				if sequenceByte == '\x1b' && position+1 < totalRunes && inputRunes[position+1] == '\\' {
					position++
					break
				}
				position++
			}

		default:
			// Two-character ESC sequence (e.g. \x1bM, \x1b=).
			position = nextPosition
		}
	}

	return cleanOutput.String()
}

// ── Endpoint: GET + POST /api/mobile/settings ────────────────────────────────

// mobileSettingsResponse is returned by GET /api/mobile/settings.
type mobileSettingsResponse struct {
	// MobileAccessEnabled is the current state of the mobile_access feature flag.
	MobileAccessEnabled bool `json:"mobile_access_enabled"`

	// MobileToken is the companion app's bearer token. Only returned from the
	// desktop settings UI (Forge session auth) — never from the companion app.
	MobileToken string `json:"mobile_token"`

	// TokenPath is the absolute path where the mobile token is stored on disk.
	TokenPath string `json:"token_path"`
}

// handleMobileSettings serves the mobile settings page used by the desktop UI.
// GET returns the current feature state and the mobile token (for QR code display).
// POST toggles the mobile_access feature flag.
//
// This endpoint uses Forge session cookie auth (via WrapWithMiddleware) because
// it is only called from the Forge desktop UI — never from the companion app.
func handleMobileSettings(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		handleGetMobileSettings(w, r)
	case http.MethodPost:
		handlePostMobileSettings(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleGetMobileSettings returns the current mobile feature state and the token.
func handleGetMobileSettings(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(mobileSettingsResponse{
		MobileAccessEnabled: isMobileAccessEnabled(),
		MobileToken:         activeMobileToken,
		TokenPath:           mobileTokenPath(),
	}); err != nil {
		log.Printf("[Mobile] GET settings encode error: %v", err)
	}
}

// mobileSettingsUpdateRequest is the body expected by POST /api/mobile/settings.
type mobileSettingsUpdateRequest struct {
	// Enabled is the new state for the mobile_access feature.
	Enabled bool `json:"enabled"`
}

// handlePostMobileSettings writes the new mobile_access flag to the local
// feature override file. This is the mechanism the Forge settings UI uses
// to enable/disable mobile access for an instance.
func handlePostMobileSettings(w http.ResponseWriter, r *http.Request) {
	var updateRequest mobileSettingsUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&updateRequest); err != nil {
		http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	if err := license.SetLocalFeatureOverride(license.FeatureMobileAccess, updateRequest.Enabled); err != nil {
		http.Error(w, "could not save feature override: "+err.Error(), http.StatusInternalServerError)
		return
	}

	log.Printf("[Mobile] mobile_access feature override set to: %v", updateRequest.Enabled)

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(map[string]any{
		"mobile_access_enabled": updateRequest.Enabled,
		"ok":                    true,
	}); err != nil {
		log.Printf("[Mobile] POST settings encode error: %v", err)
	}
}
