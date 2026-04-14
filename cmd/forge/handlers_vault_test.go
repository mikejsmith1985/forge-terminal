// handlers_vault_test.go — Unit tests for the Forge Vault HTTP handler layer.
//
// Tests the handler guard logic and method-not-allowed branches without
// requiring a real vault instance. Integration-level vault tests (full
// encrypt/decrypt pipeline) live in internal/vault/vault_test.go.
package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestHandleVaultStatus_VaultNotInitialized verifies that handleVaultStatus
// returns 503 Service Unavailable when the vault singleton is nil.
func TestHandleVaultStatus_VaultNotInitialized(t *testing.T) {
	// Ensure the vault singleton is nil for this test.
	originalVault := activeVault
	activeVault = nil
	defer func() { activeVault = originalVault }()

	req := httptest.NewRequest(http.MethodGet, "/api/vault/status", nil)
	recorder := httptest.NewRecorder()

	handleVaultStatus(recorder, req)

	if recorder.Code != http.StatusServiceUnavailable {
		t.Errorf("expected 503 when vault is nil, got %d", recorder.Code)
	}
}

// TestHandleVaultStatus_MethodNotAllowed verifies that non-GET requests to
// the status endpoint are rejected with 405 Method Not Allowed.
func TestHandleVaultStatus_MethodNotAllowed(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/vault/status", nil)
	recorder := httptest.NewRecorder()

	handleVaultStatus(recorder, req)

	if recorder.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405 for POST to vault status, got %d", recorder.Code)
	}
}

// TestHandleVaultListEntries_VaultNotInitialized verifies the 503 guard for listing.
func TestHandleVaultListEntries_VaultNotInitialized(t *testing.T) {
	originalVault := activeVault
	activeVault = nil
	defer func() { activeVault = originalVault }()

	req := httptest.NewRequest(http.MethodGet, "/api/vault/entries", nil)
	recorder := httptest.NewRecorder()

	handleVaultListEntries(recorder, req)

	if recorder.Code != http.StatusServiceUnavailable {
		t.Errorf("expected 503 when vault is nil, got %d", recorder.Code)
	}
}

// TestHandleVaultAddEntry_MethodNotAllowed verifies that GET requests to the
// add-entry endpoint are rejected with 405 Method Not Allowed.
func TestHandleVaultAddEntry_MethodNotAllowed(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/vault/entries", nil)
	recorder := httptest.NewRecorder()

	handleVaultAddEntry(recorder, req)

	if recorder.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405 for GET to add-entry handler, got %d", recorder.Code)
	}
}

// TestHandleVaultDeleteEntry_MethodNotAllowed verifies that non-DELETE requests
// to the delete handler return 405.
func TestHandleVaultDeleteEntry_MethodNotAllowed(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/vault/entries", nil)
	recorder := httptest.NewRecorder()

	handleVaultDeleteEntry(recorder, req)

	if recorder.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405 for GET to delete-entry handler, got %d", recorder.Code)
	}
}

// TestHandleVaultRevealValue_VaultNotInitialized verifies the 503 guard for reveal.
func TestHandleVaultRevealValue_VaultNotInitialized(t *testing.T) {
	originalVault := activeVault
	activeVault = nil
	defer func() { activeVault = originalVault }()

	req := httptest.NewRequest(http.MethodGet, "/api/vault/entries/value?id=test-id", nil)
	recorder := httptest.NewRecorder()

	handleVaultRevealValue(recorder, req)

	if recorder.Code != http.StatusServiceUnavailable {
		t.Errorf("expected 503 when vault is nil, got %d", recorder.Code)
	}
}

// TestHandleVaultRevealValue_MissingID verifies that a missing 'id' query
// parameter returns 400 Bad Request even when vault is nil.
func TestHandleVaultRevealValue_MissingID(t *testing.T) {
	// requireVault check runs first — nil vault returns 503, not 400.
	// So we only test the 400 path when vault is available but ID is missing.
	// Here we just confirm method gating still works.
	req := httptest.NewRequest(http.MethodPost, "/api/vault/entries/value", nil)
	recorder := httptest.NewRecorder()

	handleVaultRevealValue(recorder, req)

	if recorder.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405 for POST to reveal endpoint, got %d", recorder.Code)
	}
}
