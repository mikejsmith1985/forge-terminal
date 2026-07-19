// handlers_vault.go — HTTP handlers for the Forge Vault API.
//
// The Vault API intentionally never returns secret values in any response body.
// Values are only used server-side for two purposes:
//  1. Building the environment for new PTY sessions (auto-inject, transparent).
//  2. Writing a short-lived temp script that the frontend sources in the terminal.
//
// All endpoints operate on the application-wide vault singleton (activeVault).
// Callers must have already initialised the vault via initVault() in main.go.
package main

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/vault"
)

// activeVault is the application-wide vault singleton, set by initVault().
var activeVault *vault.Vault

// initVault opens the Forge vault from vaultDir, logging any error.
// The vault is optional — if it fails to open, Forge continues without it
// and the vault UI will show an error state.
func initVault(vaultDir string) {
	openedVault, openErr := vault.Open(vaultDir)
	if openErr != nil {
		log.Printf("[Vault] WARNING: failed to open vault at %s: %v — vault features disabled", vaultDir, openErr)
		return
	}
	activeVault = openedVault
	log.Printf("[Vault] Ready (%d entries, %d auto-inject)", openedVault.GetStatus().EntryCount, openedVault.GetStatus().AutoInjectCount)
}

// requireVault writes a 503 Service Unavailable and returns false when the vault
// is not initialised. Handlers should guard with: if !requireVault(w) { return }
func requireVault(w http.ResponseWriter) bool {
	if activeVault == nil {
		http.Error(w, "vault not available — check server logs", http.StatusServiceUnavailable)
		return false
	}
	return true
}

// ── GET /api/vault/status ─────────────────────────────────────────────────────

// handleVaultStatus returns the vault's current state: whether it's open,
// how many entries exist, and how many will auto-inject into new sessions.
// Never returns any secret values.
func handleVaultStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !requireVaultAuth(w, r) {
		return
	}
	if !requireVault(w) {
		return
	}

	vaultStatus := activeVault.GetStatus()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(vaultStatus)
}

// ── GET /api/vault/entries ────────────────────────────────────────────────────

// handleVaultListEntries returns metadata for all stored secrets.
// The response contains names, env var names, and flags — never secret values.
func handleVaultListEntries(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !requireVaultAuth(w, r) {
		return
	}
	if !requireVault(w) {
		return
	}

	allEntries := activeVault.ListEntries()
	if allEntries == nil {
		allEntries = []*vault.VaultEntry{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(allEntries)
}

// ── POST /api/vault/entries ───────────────────────────────────────────────────

// handleVaultAddEntry stores a new secret in the vault.
// The secret value is encrypted immediately and never returned in the response.
func handleVaultAddEntry(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !requireVaultAuth(w, r) {
		return
	}
	if !requireVault(w) {
		return
	}

	var addRequest vault.AddEntryRequest
	if decodeErr := json.NewDecoder(r.Body).Decode(&addRequest); decodeErr != nil {
		http.Error(w, "invalid request body: "+decodeErr.Error(), http.StatusBadRequest)
		return
	}

	trimmedSecretName := strings.TrimSpace(addRequest.SecretName)
	trimmedEnvVarName := strings.TrimSpace(addRequest.EnvVarName)
	if trimmedSecretName == "" || trimmedEnvVarName == "" || addRequest.SecretValue == "" {
		http.Error(w, "secretName, envVarName, and secretValue are required", http.StatusBadRequest)
		return
	}

	normalizedURL, urlErr := normalizeOptionalURL(addRequest.URL)
	if urlErr != nil {
		http.Error(w, urlErr.Error(), http.StatusBadRequest)
		return
	}

	addRequest.SecretName = trimmedSecretName
	addRequest.EnvVarName = trimmedEnvVarName
	addRequest.URL = normalizedURL
	addRequest.BundleID = strings.TrimSpace(addRequest.BundleID)
	addRequest.BundleType = strings.TrimSpace(addRequest.BundleType)

	createdEntry, addErr := activeVault.AddEntry(addRequest)
	if addErr != nil {
		log.Printf("[Vault API] AddEntry error: %v", addErr)
		http.Error(w, addErr.Error(), http.StatusBadRequest)
		return
	}

	log.Printf("[Vault API] Added entry: %s (%s)", createdEntry.SecretName, createdEntry.EnvVarName)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(createdEntry)
}

// ── PUT /api/vault/entries ────────────────────────────────────────────────────

// handleVaultUpdateEntry modifies an existing vault entry's metadata or secret value.
// Only non-empty fields in the request body are applied — omitted fields stay unchanged.
// The entry ID is required; at least one field to update must be provided.
func handleVaultUpdateEntry(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !requireVaultAuth(w, r) {
		return
	}
	if !requireVault(w) {
		return
	}

	var updateRequest vault.UpdateEntryRequest
	if decodeErr := json.NewDecoder(r.Body).Decode(&updateRequest); decodeErr != nil {
		http.Error(w, "invalid request body: "+decodeErr.Error(), http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(updateRequest.ID) == "" {
		http.Error(w, "'id' is required", http.StatusBadRequest)
		return
	}

	if normalizeErr := normalizeUpdateRequest(&updateRequest); normalizeErr != nil {
		http.Error(w, normalizeErr.Error(), http.StatusBadRequest)
		return
	}

	updatedEntry, updateErr := activeVault.UpdateEntry(updateRequest)
	if updateErr != nil {
		log.Printf("[Vault API] UpdateEntry error: %v", updateErr)
		// Distinguish "not found" from validation errors.
		if strings.Contains(updateErr.Error(), "not found") {
			http.Error(w, updateErr.Error(), http.StatusNotFound)
		} else {
			http.Error(w, updateErr.Error(), http.StatusBadRequest)
		}
		return
	}

	log.Printf("[Vault API] Updated entry: %s (%s)", updatedEntry.SecretName, updatedEntry.EnvVarName)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(updatedEntry)
}

// ── DELETE /api/vault/entries?id=<entryID> ────────────────────────────────────

// handleVaultDeleteEntry permanently removes a vault entry by ID.
func handleVaultDeleteEntry(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !requireVaultAuth(w, r) {
		return
	}
	if !requireVault(w) {
		return
	}

	entryID := r.URL.Query().Get("id")
	if strings.TrimSpace(entryID) == "" {
		http.Error(w, "query parameter 'id' is required", http.StatusBadRequest)
		return
	}

	if removeErr := activeVault.RemoveEntry(entryID); removeErr != nil {
		log.Printf("[Vault API] RemoveEntry error: %v", removeErr)
		http.Error(w, removeErr.Error(), http.StatusNotFound)
		return
	}

	log.Printf("[Vault API] Removed entry: %s", entryID)
	w.WriteHeader(http.StatusNoContent)
}

// ── POST /api/vault/auto-inject ───────────────────────────────────────────────

// handleVaultToggleAutoInject updates the auto-inject flag for an existing entry.
func handleVaultToggleAutoInject(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !requireVaultAuth(w, r) {
		return
	}
	if !requireVault(w) {
		return
	}

	var toggleRequest vault.AutoInjectToggleRequest
	if decodeErr := json.NewDecoder(r.Body).Decode(&toggleRequest); decodeErr != nil {
		http.Error(w, "invalid request body: "+decodeErr.Error(), http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(toggleRequest.ID) == "" {
		http.Error(w, "'id' is required", http.StatusBadRequest)
		return
	}

	if toggleErr := activeVault.SetAutoInject(toggleRequest.ID, toggleRequest.ShouldAutoInject); toggleErr != nil {
		log.Printf("[Vault API] SetAutoInject error: %v", toggleErr)
		http.Error(w, toggleErr.Error(), http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ── POST /api/vault/inject ────────────────────────────────────────────────────

// handleVaultInject generates a short-lived platform script that sets the
// specified vault entries as environment variables in the current shell session.
//
// The script self-deletes after the user's shell sources it, so secret values
// are never left on disk. Only the script file path is returned — values never
// appear in the HTTP response body.
func handleVaultInject(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !requireVaultAuthBearerOnly(w, r) {
		return
	}
	if !requireVault(w) {
		return
	}

	var injectRequest vault.InjectRequest
	if decodeErr := json.NewDecoder(r.Body).Decode(&injectRequest); decodeErr != nil {
		http.Error(w, "invalid request body: "+decodeErr.Error(), http.StatusBadRequest)
		return
	}
	if len(injectRequest.EntryIDs) == 0 {
		http.Error(w, "'entryIds' must be a non-empty array", http.StatusBadRequest)
		return
	}

	// Retrieve the secret values for the requested entry IDs.
	// Values are read from in-memory vault — they never hit disk as plaintext.
	envVarsToInject := activeVault.GetEnvVarsForIDs(injectRequest.EntryIDs)
	if len(envVarsToInject) == 0 {
		http.Error(w, "no matching entries found for the provided IDs", http.StatusNotFound)
		return
	}

	scriptPath, scriptErr := vault.BuildInjectionScript(envVarsToInject)
	if scriptErr != nil {
		log.Printf("[Vault API] BuildInjectionScript error: %v", scriptErr)
		http.Error(w, "failed to build injection script: "+scriptErr.Error(), http.StatusInternalServerError)
		return
	}

	// Schedule the script for deletion after a short window, as a backstop in case
	// the self-delete within the script fails (e.g., the user never sources it).
	go scheduleScriptCleanup(scriptPath)

	injectResult := vault.InjectResult{
		ScriptPath:    scriptPath,
		InjectedCount: len(envVarsToInject),
	}

	log.Printf("[Vault API] Inject script created: %d vars → %s", len(envVarsToInject), scriptPath)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(injectResult)
}

// scheduleScriptCleanup removes the injection script after a brief delay.
// This is a safety backstop — the script should self-delete when sourced,
// but if the user cancels or the shell fails, this ensures cleanup.
func scheduleScriptCleanup(scriptPath string) {
	// Allow 60 seconds for the user to source the script before force-deleting.
	time.Sleep(60 * time.Second)
	os.Remove(scriptPath)
}

// normalizeUpdateRequest trims a vault update request's fields in place, enforces
// that at least one updatable field is present, and validates the URL when one is
// being set. The pointer fields (URL, Description) keep their tri-state meaning:
// a nil pointer stays nil (field omitted), while a non-nil value is trimmed — and
// an empty result is a valid update meaning "clear this field", which is what lets
// a user actually blank out a description or URL.
func normalizeUpdateRequest(updateRequest *vault.UpdateEntryRequest) error {
	updateRequest.SecretName = strings.TrimSpace(updateRequest.SecretName)
	updateRequest.EnvVarName = strings.TrimSpace(updateRequest.EnvVarName)
	trimStringPointer(&updateRequest.URL)
	trimStringPointer(&updateRequest.Description)

	hasNoFieldsToUpdate := updateRequest.SecretName == "" &&
		updateRequest.EnvVarName == "" &&
		updateRequest.SecretValue == "" &&
		updateRequest.URL == nil &&
		updateRequest.Description == nil
	if hasNoFieldsToUpdate {
		return errors.New("at least one field (secretName, envVarName, secretValue, url, description) must be provided")
	}

	// Validate the URL only when a non-empty one is supplied; an empty pointer is
	// an intentional clear and needs no validation.
	if updateRequest.URL != nil && *updateRequest.URL != "" {
		normalizedURL, urlErr := normalizeOptionalURL(*updateRequest.URL)
		if urlErr != nil {
			return urlErr
		}
		updateRequest.URL = &normalizedURL
	}
	return nil
}

// trimStringPointer trims whitespace from the pointed-to string when the pointer
// is non-nil, leaving a nil pointer untouched so "field omitted" stays distinct
// from "field explicitly blanked".
func trimStringPointer(target **string) {
	if *target == nil {
		return
	}
	trimmedValue := strings.TrimSpace(**target)
	*target = &trimmedValue
}

// normalizeOptionalURL validates an optional URL field and returns a normalized value.
// Empty input is allowed and represented as an empty string.
func normalizeOptionalURL(rawURL string) (string, error) {
	trimmedURL := strings.TrimSpace(rawURL)
	if trimmedURL == "" {
		return "", nil
	}

	parsedURL, parseErr := url.ParseRequestURI(trimmedURL)
	if parseErr != nil || parsedURL.Scheme == "" || parsedURL.Host == "" {
		return "", errors.New("url must be a valid absolute URL, e.g. https://example.com/login")
	}
	return trimmedURL, nil
}

// ── GET /api/vault/entries/value ─────────────────────────────────────────────

// handleVaultRevealValue returns the decrypted plaintext value for a single
// vault entry. This is the only handler that returns a secret value — it exists
// to support the user-initiated reveal action in the Vault UI.
// Every call is logged. The value is never included in list or status responses.
func handleVaultRevealValue(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !requireVaultAuthBearerOnly(w, r) {
		return
	}
	if !requireVault(w) {
		return
	}

	entryID := strings.TrimSpace(r.URL.Query().Get("id"))
	if entryID == "" {
		http.Error(w, "query parameter 'id' is required", http.StatusBadRequest)
		return
	}

	secretValue, revealErr := activeVault.GetEntryValue(entryID)
	if revealErr != nil {
		log.Printf("[Vault API] RevealValue error: %v", revealErr)
		http.Error(w, revealErr.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(vault.RevealValueResponse{Value: secretValue})
}
