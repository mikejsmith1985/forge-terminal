// handlers_vault_test.go — HTTP handler tests for the Forge Vault API.
//
// Tests each handler in isolation using httptest, with a real in-memory vault
// (opened against a temp directory) so the JSON responses and status codes
// reflect real vault behavior rather than mocks.
package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/mikejsmith1985/forge-terminal/internal/vault"
)

// testVaultSessionToken is the known vault session token installed for handler
// tests so requests can authenticate against the gate added in vault_auth.go.
const testVaultSessionToken = "test-vault-session-token"

// openTestVault opens a real vault in a temp directory for handler tests and
// installs a known vault session token so authenticated requests pass the gate.
// Assigns both to their package-level globals and restores them on cleanup.
func openTestVault(t *testing.T) {
	t.Helper()
	dir := filepath.Join(t.TempDir(), "vault")
	openedVault, openErr := vault.Open(dir)
	if openErr != nil {
		t.Fatalf("openTestVault: %v", openErr)
	}
	activeVault = openedVault

	previousToken := activeVaultSessionToken
	activeVaultSessionToken = testVaultSessionToken

	t.Cleanup(func() {
		activeVault = nil
		activeVaultSessionToken = previousToken
	})
}

// authVaultReq attaches the valid vault session token (bearer header) and a
// localhost Origin to a request so it passes both vault gates. Returns the same
// request for convenient inline use.
func authVaultReq(req *http.Request) *http.Request {
	req.Header.Set("Authorization", "Bearer "+testVaultSessionToken)
	req.Header.Set("Origin", "http://localhost:8333")
	return req
}

// TestHandleVaultStatus_OK verifies GET /api/vault/status returns 200 with valid JSON.
func TestHandleVaultStatus_OK(t *testing.T) {
	openTestVault(t)

	req := authVaultReq(httptest.NewRequest(http.MethodGet, "/api/vault/status", nil))
	rec := httptest.NewRecorder()
	handleVaultStatus(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d — body: %s", rec.Code, rec.Body.String())
	}

	var status vault.VaultStatus
	if decErr := json.NewDecoder(rec.Body).Decode(&status); decErr != nil {
		t.Fatalf("failed to decode status response: %v", decErr)
	}
	if !status.IsOpen {
		t.Error("expected vault to report IsOpen=true")
	}
}

// TestHandleVaultStatus_NoVault verifies GET /api/vault/status returns 503
// when the vault is not initialised.
func TestHandleVaultStatus_NoVault(t *testing.T) {
	activeVault = nil

	// Install a token and authenticate so the request passes the auth gate and
	// actually reaches requireVault — that is the 503 path under test here.
	previousToken := activeVaultSessionToken
	activeVaultSessionToken = testVaultSessionToken
	t.Cleanup(func() { activeVaultSessionToken = previousToken })

	req := authVaultReq(httptest.NewRequest(http.MethodGet, "/api/vault/status", nil))
	rec := httptest.NewRecorder()
	handleVaultStatus(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("expected 503, got %d", rec.Code)
	}
}

// TestHandleVaultListEntries_Empty verifies GET /api/vault/entries returns
// an empty JSON array for a fresh vault.
func TestHandleVaultListEntries_Empty(t *testing.T) {
	openTestVault(t)

	req := authVaultReq(httptest.NewRequest(http.MethodGet, "/api/vault/entries", nil))
	rec := httptest.NewRecorder()
	handleVaultListEntries(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}

	var entries []vault.VaultEntry
	if decErr := json.NewDecoder(rec.Body).Decode(&entries); decErr != nil {
		t.Fatalf("failed to decode entries: %v", decErr)
	}
	if entries == nil {
		t.Error("expected a non-nil (possibly empty) array, got nil")
	}
}

// TestHandleVaultAddAndDeleteEntry_Roundtrip verifies POST /api/vault/entries
// adds an entry and DELETE /api/vault/entries?id=... removes it.
func TestHandleVaultAddAndDeleteEntry_Roundtrip(t *testing.T) {
	openTestVault(t)

	// Add entry
	addBody, _ := json.Marshal(vault.AddEntryRequest{
		SecretName:  "Test Token",
		EnvVarName:  "TEST_TOKEN",
		SecretValue: "tok_12345",
		URL:         "https://example.com/token",
		BundleID:    "example-credential",
		BundleType:  "password",
	})
	addReq := authVaultReq(httptest.NewRequest(http.MethodPost, "/api/vault/entries", bytes.NewReader(addBody)))
	addReq.Header.Set("Content-Type", "application/json")
	addRec := httptest.NewRecorder()
	handleVaultAddEntry(addRec, addReq)

	if addRec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d — body: %s", addRec.Code, addRec.Body.String())
	}

	var created vault.VaultEntry
	if decErr := json.NewDecoder(addRec.Body).Decode(&created); decErr != nil {
		t.Fatalf("failed to decode created entry: %v", decErr)
	}
	if created.ID == "" {
		t.Error("created entry must have a non-empty ID")
	}
	if created.EnvVarName != "TEST_TOKEN" {
		t.Errorf("expected EnvVarName 'TEST_TOKEN', got %q", created.EnvVarName)
	}
	if created.URL != "https://example.com/token" {
		t.Errorf("expected URL to be persisted, got %q", created.URL)
	}
	if created.BundleID != "example-credential" {
		t.Errorf("expected BundleID to be persisted, got %q", created.BundleID)
	}
	if created.BundleType != "password" {
		t.Errorf("expected BundleType to be persisted, got %q", created.BundleType)
	}

	// Delete the entry
	delURL := "/api/vault/entries?id=" + created.ID
	delReq := authVaultReq(httptest.NewRequest(http.MethodDelete, delURL, nil))
	delRec := httptest.NewRecorder()
	handleVaultDeleteEntry(delRec, delReq)

	if delRec.Code != http.StatusNoContent {
		t.Errorf("expected 204, got %d — body: %s", delRec.Code, delRec.Body.String())
	}
}

// TestHandleVaultAddEntry_MissingFields verifies that POST /api/vault/entries
// with missing required fields returns 400.
func TestHandleVaultAddEntry_MissingFields(t *testing.T) {
	openTestVault(t)

	addBody, _ := json.Marshal(map[string]string{
		"secretName": "Missing Value Field",
		// no secretValue
	})
	req := authVaultReq(httptest.NewRequest(http.MethodPost, "/api/vault/entries", bytes.NewReader(addBody)))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handleVaultAddEntry(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for missing required fields, got %d", rec.Code)
	}
}

// TestHandleVaultAddEntry_InvalidURL verifies URL validation for POST /api/vault/entries.
func TestHandleVaultAddEntry_InvalidURL(t *testing.T) {
	openTestVault(t)

	addBody, _ := json.Marshal(vault.AddEntryRequest{
		SecretName:  "Bad URL Secret",
		EnvVarName:  "BAD_URL_SECRET",
		SecretValue: "value",
		URL:         "not-a-url",
	})
	req := authVaultReq(httptest.NewRequest(http.MethodPost, "/api/vault/entries", bytes.NewReader(addBody)))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handleVaultAddEntry(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid URL, got %d", rec.Code)
	}
}

// TestHandleVaultDeleteEntry_MissingID verifies DELETE without ?id= returns 400.
func TestHandleVaultDeleteEntry_MissingID(t *testing.T) {
	openTestVault(t)

	req := authVaultReq(httptest.NewRequest(http.MethodDelete, "/api/vault/entries", nil))
	rec := httptest.NewRecorder()
	handleVaultDeleteEntry(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

// TestHandleVaultAddEntry_ResponseOmitsSecretValue verifies the response body
// from a successful POST never contains the secret value.
func TestHandleVaultAddEntry_ResponseOmitsSecretValue(t *testing.T) {
	openTestVault(t)

	const secretVal = "my_very_secret_api_key_abc123"
	addBody, _ := json.Marshal(vault.AddEntryRequest{
		SecretName:  "Sensitive Key",
		EnvVarName:  "SENSITIVE_KEY",
		SecretValue: secretVal,
	})
	req := authVaultReq(httptest.NewRequest(http.MethodPost, "/api/vault/entries", bytes.NewReader(addBody)))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handleVaultAddEntry(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d", rec.Code)
	}

	responseBody := rec.Body.String()
	if bytes.Contains([]byte(responseBody), []byte(secretVal)) {
		t.Error("SECURITY VIOLATION: response body must never contain the secret value")
	}
}

// ── Auth gate (CVE fix: unauthenticated vault reads) ─────────────────────────

// addTestEntry inserts one entry via the authenticated add handler and returns
// its ID, so reveal/inject gate tests have a real target to attack.
func addTestEntry(t *testing.T, secretValue string) string {
	t.Helper()
	addBody, _ := json.Marshal(vault.AddEntryRequest{
		SecretName:  "Gate Test Secret",
		EnvVarName:  "GATE_TEST_SECRET",
		SecretValue: secretValue,
	})
	req := authVaultReq(httptest.NewRequest(http.MethodPost, "/api/vault/entries", bytes.NewReader(addBody)))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handleVaultAddEntry(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("addTestEntry: expected 201, got %d — body: %s", rec.Code, rec.Body.String())
	}
	var created vault.VaultEntry
	if decErr := json.NewDecoder(rec.Body).Decode(&created); decErr != nil {
		t.Fatalf("addTestEntry: decode failed: %v", decErr)
	}
	return created.ID
}

// TestHandleVaultListEntries_NoToken_Unauthorized proves the reported incident is
// closed: listing entries without a token is rejected with 401.
func TestHandleVaultListEntries_NoToken_Unauthorized(t *testing.T) {
	openTestVault(t)

	req := httptest.NewRequest(http.MethodGet, "/api/vault/entries", nil) // no auth
	rec := httptest.NewRecorder()
	handleVaultListEntries(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for tokenless list, got %d", rec.Code)
	}
}

// TestHandleVaultListEntries_TokenlessRejected_EmptyGlobalToken is the exact
// regression for the vulnerability: on a localhost install globalToken is empty,
// and a tokenless list request must still be refused (not served).
func TestHandleVaultListEntries_TokenlessRejected_EmptyGlobalToken(t *testing.T) {
	openTestVault(t)

	previousGlobal := globalToken
	globalToken = "" // the localhost default that left the vault wide open
	t.Cleanup(func() { globalToken = previousGlobal })

	req := httptest.NewRequest(http.MethodGet, "/api/vault/entries", nil)
	rec := httptest.NewRecorder()
	handleVaultListEntries(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("SECURITY REGRESSION: tokenless list returned %d (want 401) with empty globalToken", rec.Code)
	}
}

// TestHandleVaultRevealValue_NoToken_Unauthorized proves the secret-value
// endpoint refuses an unauthenticated request AND never leaks the value.
func TestHandleVaultRevealValue_NoToken_Unauthorized(t *testing.T) {
	openTestVault(t)
	const secretValue = "reveal_secret_value_zzz999"
	entryID := addTestEntry(t, secretValue)

	req := httptest.NewRequest(http.MethodGet, "/api/vault/entries/value?id="+entryID, nil) // no auth
	rec := httptest.NewRecorder()
	handleVaultRevealValue(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for tokenless reveal, got %d", rec.Code)
	}
	if bytes.Contains(rec.Body.Bytes(), []byte(secretValue)) {
		t.Error("SECURITY VIOLATION: 401 response leaked the secret value")
	}
}

// TestHandleVaultRevealValue_CookieOnly_Unauthorized proves the secret-tier gate
// ignores the ambient cookie (CSRF defense): a request authenticated only via a
// forge_vault_token cookie — no Authorization header — is rejected.
func TestHandleVaultRevealValue_CookieOnly_Unauthorized(t *testing.T) {
	openTestVault(t)
	entryID := addTestEntry(t, "cookie_csrf_secret")

	req := httptest.NewRequest(http.MethodGet, "/api/vault/entries/value?id="+entryID, nil)
	req.Header.Set("Origin", "http://localhost:8333")
	req.AddCookie(&http.Cookie{Name: "forge_vault_token", Value: testVaultSessionToken})
	rec := httptest.NewRecorder()
	handleVaultRevealValue(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("CSRF DEFENSE FAILED: cookie-only reveal returned %d (want 401)", rec.Code)
	}
}

// TestHandleVaultRevealValue_ValidBearer_OK confirms the legitimate path still
// works: a request with the correct bearer token returns 200 and the value.
func TestHandleVaultRevealValue_ValidBearer_OK(t *testing.T) {
	openTestVault(t)
	const secretValue = "valid_reveal_secret_777"
	entryID := addTestEntry(t, secretValue)

	req := authVaultReq(httptest.NewRequest(http.MethodGet, "/api/vault/entries/value?id="+entryID, nil))
	rec := httptest.NewRecorder()
	handleVaultRevealValue(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for authenticated reveal, got %d — body: %s", rec.Code, rec.Body.String())
	}
	var revealed vault.RevealValueResponse
	if decErr := json.NewDecoder(rec.Body).Decode(&revealed); decErr != nil {
		t.Fatalf("decode reveal response: %v", decErr)
	}
	if revealed.Value != secretValue {
		t.Errorf("expected revealed value %q, got %q", secretValue, revealed.Value)
	}
}

// TestHandleVaultInject_NoToken_Unauthorized proves the inject endpoint (which
// also exposes secret values, into a shell script) refuses tokenless requests.
func TestHandleVaultInject_NoToken_Unauthorized(t *testing.T) {
	openTestVault(t)
	entryID := addTestEntry(t, "inject_secret_value")

	injectBody, _ := json.Marshal(vault.InjectRequest{EntryIDs: []string{entryID}})
	req := httptest.NewRequest(http.MethodPost, "/api/vault/inject", bytes.NewReader(injectBody)) // no auth
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handleVaultInject(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for tokenless inject, got %d", rec.Code)
	}
}
