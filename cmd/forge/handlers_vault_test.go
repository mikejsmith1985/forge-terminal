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

// openTestVault opens a real vault in a temp directory for handler tests.
// Assigns the result to the package-level activeVault.
func openTestVault(t *testing.T) {
	t.Helper()
	dir := filepath.Join(t.TempDir(), "vault")
	openedVault, openErr := vault.Open(dir)
	if openErr != nil {
		t.Fatalf("openTestVault: %v", openErr)
	}
	activeVault = openedVault

	t.Cleanup(func() {
		activeVault = nil
	})
}

// TestHandleVaultStatus_OK verifies GET /api/vault/status returns 200 with valid JSON.
func TestHandleVaultStatus_OK(t *testing.T) {
	openTestVault(t)

	req := httptest.NewRequest(http.MethodGet, "/api/vault/status", nil)
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

	req := httptest.NewRequest(http.MethodGet, "/api/vault/status", nil)
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

	req := httptest.NewRequest(http.MethodGet, "/api/vault/entries", nil)
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
	addReq := httptest.NewRequest(http.MethodPost, "/api/vault/entries", bytes.NewReader(addBody))
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
	delReq := httptest.NewRequest(http.MethodDelete, delURL, nil)
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
	req := httptest.NewRequest(http.MethodPost, "/api/vault/entries", bytes.NewReader(addBody))
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
	req := httptest.NewRequest(http.MethodPost, "/api/vault/entries", bytes.NewReader(addBody))
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

	req := httptest.NewRequest(http.MethodDelete, "/api/vault/entries", nil)
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
	req := httptest.NewRequest(http.MethodPost, "/api/vault/entries", bytes.NewReader(addBody))
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
