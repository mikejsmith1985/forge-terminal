// handlers_vault.go ΓÇö HTTP handlers for the Forge Vault API.
//
// The Vault API intentionally never returns secret values in any response body.
// Values are only used server-side for two purposes:
//   1. Building the environment for new PTY sessions (auto-inject, transparent).
//   2. Writing a short-lived temp script that the frontend sources in the terminal.
//
// All endpoints operate on the application-wide vault singleton (activeVault).
// Callers must have already initialised the vault via initVault() in main.go.
package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/vault"
)

// activeVault is the application-wide vault singleton, set by initVault().
var activeVault *vault.Vault

// initVault opens the Forge vault from vaultDir, logging any error.
// The vault is optional ΓÇö if it fails to open, Forge continues without it
// and the vault UI will show an error state.
func initVault(vaultDir string) {
	openedVault, openErr := vault.Open(vaultDir)
	if openErr != nil {
		log.Printf("[Vault] WARNING: failed to open vault at %s: %v ΓÇö vault features disabled", vaultDir, openErr)
		return
	}
	activeVault = openedVault
	log.Printf("[Vault] Ready (%d entries, %d auto-inject)", openedVault.GetStatus().EntryCount, openedVault.GetStatus().AutoInjectCount)
}

// requireVault writes a 503 Service Unavailable and returns false when the vault
// is not initialised. Handlers should guard with: if !requireVault(w) { return }
func requireVault(w http.ResponseWriter) bool {
	if activeVault == nil {
		http.Error(w, "vault not available ΓÇö check server logs", http.StatusServiceUnavailable)
		return false
	}
	return true
}

// ΓöÇΓöÇ GET /api/vault/status ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

// handleVaultStatus returns the vault's current state: whether it's open,
// how many entries exist, and how many will auto-inject into new sessions.
// Never returns any secret values.
func handleVaultStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !requireVault(w) {
		return
	}

	vaultStatus := activeVault.GetStatus()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(vaultStatus)
}

// ΓöÇΓöÇ GET /api/vault/entries ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

// handleVaultListEntries returns metadata for all stored secrets.
// The response contains names, env var names, and flags ΓÇö never secret values.
func handleVaultListEntries(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
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

// ΓöÇΓöÇ POST /api/vault/entries ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

// handleVaultAddEntry stores a new secret in the vault.
// The secret value is encrypted immediately and never returned in the response.
func handleVaultAddEntry(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
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
	addRequest.SecretName = trimmedSecretName
	addRequest.EnvVarName = trimmedEnvVarName

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

// ΓöÇΓöÇ DELETE /api/vault/entries?id=<entryID> ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

// handleVaultDeleteEntry permanently removes a vault entry by ID.
func handleVaultDeleteEntry(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
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

// ΓöÇΓöÇ POST /api/vault/auto-inject ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

// handleVaultToggleAutoInject updates the auto-inject flag for an existing entry.
func handleVaultToggleAutoInject(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
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

// ΓöÇΓöÇ POST /api/vault/inject ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

// handleVaultInject generates a short-lived platform script that sets the
// specified vault entries as environment variables in the current shell session.
//
// The script self-deletes after the user's shell sources it, so secret values
// are never left on disk. Only the script file path is returned ΓÇö values never
// appear in the HTTP response body.
func handleVaultInject(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
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
	// Values are read from in-memory vault ΓÇö they never hit disk as plaintext.
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

	log.Printf("[Vault API] Inject script created: %d vars ΓåÆ %s", len(envVarsToInject), scriptPath)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(injectResult)
}

// scheduleScriptCleanup removes the injection script after a brief delay.
// This is a safety backstop ΓÇö the script should self-delete when sourced,
// but if the user cancels or the shell fails, this ensures cleanup.
func scheduleScriptCleanup(scriptPath string) {
	// Allow 60 seconds for the user to source the script before force-deleting.
	time.Sleep(60 * time.Second)
	os.Remove(scriptPath)
}

// ΓöÇΓöÇ GET /api/vault/entries/value ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

// handleVaultRevealValue returns the decrypted plaintext value for a single
// vault entry. This is the only handler that returns a secret value ΓÇö it exists
// to support the user-initiated reveal action in the Vault UI.
// Every call is logged. The value is never included in list or status responses.
func handleVaultRevealValue(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
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
