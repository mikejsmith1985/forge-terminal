// vault_auth_test.go — unit tests for the Forge Vault authentication gate.
//
// These tests pin the security contract that closes the unauthenticated-read
// vulnerability: every vault route must require the vault session token, even
// when the global remote-access token is unset (the localhost default).
package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// setTestVaultToken installs a known vault session token for the duration of a
// test and restores the previous value afterwards. It bypasses the once-guarded
// initVaultSessionToken so tests do not touch the real ~/.forge directory.
func setTestVaultToken(t *testing.T, token string) {
	t.Helper()
	previousToken := activeVaultSessionToken
	activeVaultSessionToken = token
	t.Cleanup(func() {
		activeVaultSessionToken = previousToken
	})
}

// bearerVaultRequest builds a GET request carrying the given bearer token and a
// localhost Origin (the origin the desktop UI uses).
func bearerVaultRequest(token string) *http.Request {
	req := httptest.NewRequest(http.MethodGet, "/api/vault/entries", nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	req.Header.Set("Origin", "http://localhost:8333")
	return req
}

// TestRequireVaultAuth_ValidBearer_Authorised confirms a request carrying the
// correct token in the Authorization header is allowed through.
func TestRequireVaultAuth_ValidBearer_Authorised(t *testing.T) {
	setTestVaultToken(t, "correct-token")

	rec := httptest.NewRecorder()
	if !requireVaultAuth(rec, bearerVaultRequest("correct-token")) {
		t.Fatalf("expected authorised, got rejection with status %d", rec.Code)
	}
}

// TestRequireVaultAuth_NoToken_Unauthorized confirms a request with no
// credentials is rejected with 401.
func TestRequireVaultAuth_NoToken_Unauthorized(t *testing.T) {
	setTestVaultToken(t, "correct-token")

	rec := httptest.NewRecorder()
	if requireVaultAuth(rec, bearerVaultRequest("")) {
		t.Fatal("expected rejection for a request with no token")
	}
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rec.Code)
	}
}

// TestRequireVaultAuth_WrongToken_Unauthorized confirms a mismatched token is
// rejected with 401.
func TestRequireVaultAuth_WrongToken_Unauthorized(t *testing.T) {
	setTestVaultToken(t, "correct-token")

	rec := httptest.NewRecorder()
	if requireVaultAuth(rec, bearerVaultRequest("wrong-token")) {
		t.Fatal("expected rejection for a wrong token")
	}
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rec.Code)
	}
}

// TestRequireVaultAuth_UninitialisedToken_ServiceUnavailable confirms the gate
// fails CLOSED: when no token is loaded, requests are refused with 503 rather
// than silently allowed through.
func TestRequireVaultAuth_UninitialisedToken_ServiceUnavailable(t *testing.T) {
	setTestVaultToken(t, "")

	rec := httptest.NewRecorder()
	if requireVaultAuth(rec, bearerVaultRequest("anything")) {
		t.Fatal("expected rejection when no vault token is initialised")
	}
	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("expected 503, got %d", rec.Code)
	}
}

// TestRequireVaultAuth_TokenlessRequest_Rejected_EvenWithEmptyGlobalToken is the
// regression test for the reported incident: on a localhost install globalToken
// is empty, yet a tokenless request to the vault must still be rejected.
func TestRequireVaultAuth_TokenlessRequest_Rejected_EvenWithEmptyGlobalToken(t *testing.T) {
	setTestVaultToken(t, "correct-token")

	previousGlobal := globalToken
	globalToken = "" // the localhost default that made the vault wide open
	t.Cleanup(func() { globalToken = previousGlobal })

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/vault/entries", nil) // no Authorization at all
	if requireVaultAuth(rec, req) {
		t.Fatal("SECURITY REGRESSION: tokenless vault request allowed when globalToken is empty")
	}
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rec.Code)
	}
}

// TestRequireVaultAuth_DisallowedOrigin_Forbidden confirms a cross-site Origin
// is rejected with 403 even if it somehow carries a valid token.
func TestRequireVaultAuth_DisallowedOrigin_Forbidden(t *testing.T) {
	setTestVaultToken(t, "correct-token")

	req := bearerVaultRequest("correct-token")
	req.Header.Set("Origin", "https://evil.example")
	rec := httptest.NewRecorder()
	if requireVaultAuth(rec, req) {
		t.Fatal("expected rejection for a disallowed cross-site origin")
	}
	if rec.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %d", rec.Code)
	}
}

// TestRequireVaultAuthBearerOnly_CookieRejected confirms the secret-tier gate
// ignores cookies: a valid token in the forge_vault_token cookie (but absent
// from the Authorization header) is rejected. This is the CSRF defense for the
// reveal/inject endpoints.
func TestRequireVaultAuthBearerOnly_CookieRejected(t *testing.T) {
	setTestVaultToken(t, "correct-token")

	req := httptest.NewRequest(http.MethodGet, "/api/vault/entries/value?id=x", nil)
	req.Header.Set("Origin", "http://localhost:8333")
	req.AddCookie(&http.Cookie{Name: "forge_vault_token", Value: "correct-token"})
	rec := httptest.NewRecorder()
	if requireVaultAuthBearerOnly(rec, req) {
		t.Fatal("CSRF DEFENSE FAILED: cookie-only request accepted on secret-tier route")
	}
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rec.Code)
	}
}

// TestRequireVaultAuthBearerOnly_ValidBearer_Authorised confirms the secret-tier
// gate still allows a correct bearer token.
func TestRequireVaultAuthBearerOnly_ValidBearer_Authorised(t *testing.T) {
	setTestVaultToken(t, "correct-token")

	req := httptest.NewRequest(http.MethodGet, "/api/vault/entries/value?id=x", nil)
	req.Header.Set("Origin", "http://localhost:8333")
	req.Header.Set("Authorization", "Bearer correct-token")
	rec := httptest.NewRecorder()
	if !requireVaultAuthBearerOnly(rec, req) {
		t.Fatalf("expected authorised, got rejection with status %d", rec.Code)
	}
}

// TestInjectVaultTokenIntoHTML_EmbedsToken confirms the token is injected before
// </head> as the window.__forgeVaultToken global the frontend reads.
func TestInjectVaultTokenIntoHTML_EmbedsToken(t *testing.T) {
	setTestVaultToken(t, "inject-me-1234")

	page := []byte("<html><head><title>Forge</title></head><body></body></html>")
	result := string(injectVaultTokenIntoHTML(page))

	if !strings.Contains(result, `window.__forgeVaultToken="inject-me-1234"`) {
		t.Errorf("expected token global in output, got: %s", result)
	}
	// Must be injected inside <head>, before the closing tag.
	if !strings.Contains(result, `;</script></head>`) {
		t.Errorf("expected script injected immediately before </head>, got: %s", result)
	}
}

// TestInjectVaultTokenIntoHTML_NoTokenLeavesPageUnchanged confirms that when no
// token is loaded (fail-closed state), the page is served verbatim with no
// injected global.
func TestInjectVaultTokenIntoHTML_NoTokenLeavesPageUnchanged(t *testing.T) {
	setTestVaultToken(t, "")

	page := []byte("<html><head></head><body></body></html>")
	result := string(injectVaultTokenIntoHTML(page))

	if strings.Contains(result, "__forgeVaultToken") {
		t.Errorf("expected no token global when token is unset, got: %s", result)
	}
}

// TestVaultOriginAllowed_Cases covers the origin allowlist decisions.
func TestVaultOriginAllowed_Cases(t *testing.T) {
	testCases := []struct {
		name        string
		originValue string
		wantAllowed bool
	}{
		{name: "empty origin (curl / same-origin GET)", originValue: "", wantAllowed: true},
		{name: "localhost any port", originValue: "http://localhost:8333", wantAllowed: true},
		{name: "loopback ip", originValue: "http://127.0.0.1:3005", wantAllowed: true},
		{name: "rootlevellabs subdomain", originValue: "https://license.rootlevellabs.tech", wantAllowed: true},
		{name: "arbitrary external site", originValue: "https://evil.example", wantAllowed: false},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/vault/entries", nil)
			if testCase.originValue != "" {
				req.Header.Set("Origin", testCase.originValue)
			}
			if got := vaultOriginAllowed(req); got != testCase.wantAllowed {
				t.Errorf("vaultOriginAllowed(%q) = %v, want %v", testCase.originValue, got, testCase.wantAllowed)
			}
		})
	}
}
