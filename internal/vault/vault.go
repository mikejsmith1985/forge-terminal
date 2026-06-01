// vault.go — Core Forge Vault operations.
//
// The Vault holds the in-memory decrypted state of all stored secrets.
// On every write (add, remove, toggle) the full entry list is re-encrypted
// with a fresh AES-GCM nonce and written atomically via rename to prevent
// partial-write corruption.
//
// Thread safety: all public methods acquire vault.mu before reading or
// modifying the in-memory entry list, so the vault is safe to use from
// multiple concurrent HTTP handler goroutines.
package vault

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/google/uuid"
)

// Vault is the in-memory state of the Forge secret store.
// Obtain an instance by calling Open; use GetGlobal to retrieve the
// application-wide singleton after initialization.
type Vault struct {
	mu        sync.RWMutex
	isOpen    bool
	vaultPath string // absolute path to vault.enc
	masterKey []byte // 32-byte AES-256 key held in memory while running
	entries   []*diskEntry
}

// globalVaultInstance is the application-wide singleton set by Open.
var globalVaultInstance *Vault

// GetGlobal returns the application-wide Vault singleton.
// Returns nil when the vault has not been initialized yet (before main calls Open).
func GetGlobal() *Vault {
	return globalVaultInstance
}

// Open loads (or creates) the Forge vault from vaultDir, decrypts it into memory,
// and stores the result as the application singleton.
// Call this once during application startup; afterwards use GetGlobal.
func Open(vaultDir string) (*Vault, error) {
	if mkdirErr := os.MkdirAll(vaultDir, 0700); mkdirErr != nil {
		return nil, fmt.Errorf("creating vault directory %q: %w", vaultDir, mkdirErr)
	}

	masterKey, keyErr := loadOrCreateMasterKey(vaultDir)
	if keyErr != nil {
		return nil, fmt.Errorf("loading vault encryption key: %w", keyErr)
	}

	newVault := &Vault{
		isOpen:    true,
		vaultPath: filepath.Join(vaultDir, "vault.enc"),
		masterKey: masterKey,
		entries:   make([]*diskEntry, 0),
	}

	if pathExists(newVault.vaultPath) {
		if loadErr := newVault.loadFromDisk(); loadErr != nil {
			return nil, fmt.Errorf("loading existing vault data: %w", loadErr)
		}
	}

	log.Printf("[Vault] Opened at %s (%d entries)", newVault.vaultPath, len(newVault.entries))
	globalVaultInstance = newVault
	return newVault, nil
}

// ── Write operations ─────────────────────────────────────────────────────────

// AddEntry stores a new secret in the vault and encrypts the vault to disk.
// Returns the public entry metadata (without the secret value).
// Returns an error if the env var name is already in use.
func (v *Vault) AddEntry(request AddEntryRequest) (*VaultEntry, error) {
	v.mu.Lock()
	defer v.mu.Unlock()

	if !v.isOpen {
		return nil, fmt.Errorf("vault is not open")
	}
	if request.SecretName == "" || request.EnvVarName == "" || request.SecretValue == "" {
		return nil, fmt.Errorf("secretName, envVarName, and secretValue are all required")
	}

	// Reject duplicate env var names to prevent silent injection conflicts.
	for _, existingEntry := range v.entries {
		if existingEntry.EnvVarName == request.EnvVarName {
			return nil, fmt.Errorf("env var %q already exists in the vault — remove the old entry first", request.EnvVarName)
		}
	}

	newEntry := &diskEntry{
		ID:               uuid.New().String(),
		SecretName:       request.SecretName,
		EnvVarName:       request.EnvVarName,
		SecretValue:      request.SecretValue,
		URL:              request.URL,
		Description:      request.Description,
		BundleID:         request.BundleID,
		BundleType:       request.BundleType,
		ShouldAutoInject: request.ShouldAutoInject,
		CreatedAt:        time.Now().UTC(),
	}

	v.entries = append(v.entries, newEntry)

	if saveErr := v.saveToFileLocked(); saveErr != nil {
		// Roll back the in-memory append if the disk write fails.
		v.entries = v.entries[:len(v.entries)-1]
		return nil, fmt.Errorf("saving vault after add: %w", saveErr)
	}

	log.Printf("[Vault] Added entry: %s (%s)", newEntry.SecretName, newEntry.EnvVarName)
	return diskEntryToPublic(newEntry), nil
}

// RemoveEntry permanently deletes the entry with the given ID from the vault.
func (v *Vault) RemoveEntry(entryID string) error {
	v.mu.Lock()
	defer v.mu.Unlock()

	if !v.isOpen {
		return fmt.Errorf("vault is not open")
	}

	removalIndex := v.findEntryIndexLocked(entryID)
	if removalIndex < 0 {
		return fmt.Errorf("vault entry %q not found", entryID)
	}

	removedEntry := v.entries[removalIndex]
	v.entries = append(v.entries[:removalIndex], v.entries[removalIndex+1:]...)

	if saveErr := v.saveToFileLocked(); saveErr != nil {
		// Roll back the removal if the disk write fails.
		restored := make([]*diskEntry, len(v.entries)+1)
		copy(restored, v.entries[:removalIndex])
		restored[removalIndex] = removedEntry
		copy(restored[removalIndex+1:], v.entries[removalIndex:])
		v.entries = restored
		return fmt.Errorf("saving vault after remove: %w", saveErr)
	}

	log.Printf("[Vault] Removed entry: %s (%s)", removedEntry.SecretName, removedEntry.EnvVarName)
	return nil
}

// UpdateEntry modifies an existing vault entry's metadata and/or secret value.
// Only non-empty fields in the request are applied — omitted fields are left unchanged.
// If the env var name is being changed, the new name is checked for uniqueness
// against all other entries (excluding the entry being updated).
// Returns the updated public entry metadata (without the secret value).
func (v *Vault) UpdateEntry(request UpdateEntryRequest) (*VaultEntry, error) {
	v.mu.Lock()
	defer v.mu.Unlock()

	if !v.isOpen {
		return nil, fmt.Errorf("vault is not open")
	}

	entryIndex := v.findEntryIndexLocked(request.ID)
	if entryIndex < 0 {
		return nil, fmt.Errorf("vault entry %q not found", request.ID)
	}

	targetEntry := v.entries[entryIndex]

	// Snapshot the original values so we can roll back if the disk write fails.
	originalSecretName := targetEntry.SecretName
	originalEnvVarName := targetEntry.EnvVarName
	originalSecretValue := targetEntry.SecretValue
	originalURL := targetEntry.URL
	originalDescription := targetEntry.Description

	// If the caller is changing the env var name, reject duplicates against other entries.
	if request.EnvVarName != "" && request.EnvVarName != targetEntry.EnvVarName {
		for idx, existingEntry := range v.entries {
			if idx == entryIndex {
				continue // skip the entry being updated
			}
			if existingEntry.EnvVarName == request.EnvVarName {
				return nil, fmt.Errorf("env var %q already exists in the vault — choose a different name", request.EnvVarName)
			}
		}
		targetEntry.EnvVarName = request.EnvVarName
	}

	// Apply non-empty fields from the request.
	if request.SecretName != "" {
		targetEntry.SecretName = request.SecretName
	}
	if request.SecretValue != "" {
		targetEntry.SecretValue = request.SecretValue
	}
	if request.URL != "" {
		targetEntry.URL = request.URL
	}
	if request.Description != "" {
		targetEntry.Description = request.Description
	}

	if saveErr := v.saveToFileLocked(); saveErr != nil {
		// Roll back in-memory changes on disk write failure.
		targetEntry.SecretName = originalSecretName
		targetEntry.EnvVarName = originalEnvVarName
		targetEntry.SecretValue = originalSecretValue
		targetEntry.URL = originalURL
		targetEntry.Description = originalDescription
		return nil, fmt.Errorf("saving vault after update: %w", saveErr)
	}

	log.Printf("[Vault] Updated entry: %s (%s)", targetEntry.SecretName, targetEntry.EnvVarName)
	return diskEntryToPublic(targetEntry), nil
}

// SetAutoInject updates the auto-inject flag for the entry with the given ID.
func (v *Vault) SetAutoInject(entryID string, shouldAutoInject bool) error {
	v.mu.Lock()
	defer v.mu.Unlock()

	if !v.isOpen {
		return fmt.Errorf("vault is not open")
	}

	idx := v.findEntryIndexLocked(entryID)
	if idx < 0 {
		return fmt.Errorf("vault entry %q not found", entryID)
	}

	v.entries[idx].ShouldAutoInject = shouldAutoInject
	return v.saveToFileLocked()
}

// ── Read operations ──────────────────────────────────────────────────────────

// ListEntryNames returns the SecretName of every vault entry in insertion order.
// This is the discovery method exposed to MCP agents via the vault_list tool.
// Only names are returned — secret values and UUIDs are intentionally excluded
// so agents can learn what is available without receiving sensitive material.
func (v *Vault) ListEntryNames() []string {
	v.mu.RLock()
	defer v.mu.RUnlock()

	entryNames := make([]string, 0, len(v.entries))
	for _, entry := range v.entries {
		entryNames = append(entryNames, entry.SecretName)
	}
	return entryNames
}

// ListEntries returns public metadata for all vault entries.
// Secret values are intentionally excluded from the returned structs.
func (v *Vault) ListEntries() []*VaultEntry {
	v.mu.RLock()
	defer v.mu.RUnlock()

	publicEntries := make([]*VaultEntry, 0, len(v.entries))
	for _, entry := range v.entries {
		publicEntries = append(publicEntries, diskEntryToPublic(entry))
	}
	return publicEntries
}

// GetAutoInjectEnv returns a slice of "KEY=value" strings for every entry
// flagged with ShouldAutoInject = true.
// This is called by the terminal session spawner to build the PTY environment.
// Values are read from memory and injected directly — they never touch disk,
// log output, or WebSocket messages.
func (v *Vault) GetAutoInjectEnv() []string {
	v.mu.RLock()
	defer v.mu.RUnlock()

	if !v.isOpen {
		return nil
	}

	injectedVars := make([]string, 0)
	for _, entry := range v.entries {
		if entry.ShouldAutoInject {
			injectedVars = append(injectedVars, entry.EnvVarName+"="+entry.SecretValue)
			log.Printf("[Vault] Auto-injecting %s into PTY session", entry.EnvVarName)
		}
	}
	return injectedVars
}

// GetEnvVarsForIDs returns "KEY=value" strings for the specified entry IDs.
// Used for the manual "Inject Now" flow (writes a temp script for the frontend to source).
func (v *Vault) GetEnvVarsForIDs(entryIDs []string) map[string]string {
	v.mu.Lock()
	defer v.mu.Unlock()

	now := time.Now().UTC()
	result := make(map[string]string, len(entryIDs))

	for _, targetID := range entryIDs {
		for _, entry := range v.entries {
			if entry.ID == targetID {
				result[entry.EnvVarName] = entry.SecretValue
				entry.LastUsedAt = &now
				break
			}
		}
	}

	// Best-effort save to update LastUsedAt timestamps.
	if len(result) > 0 {
		_ = v.saveToFileLocked()
	}

	return result
}

// BuildInjectionScriptForNames is the zero-knowledge injection path for MCP agents.
//
// It looks up the vault entries matching secretNames, writes a self-deleting
// platform script (PowerShell on Windows, POSIX sh elsewhere) with their env var
// assignments, and returns only the absolute path to that script. Secret values
// flow from vault memory → temp file and never appear in the return value, making
// this safe for agents to call without exposing secrets to conversation context.
//
// Returns an error if any requested name is not found in the vault or if the vault
// is not open. The caller should pass the returned path to terminal_execute
// using `. '<path>'` (dot-source) to activate the variables in the running session.
func (v *Vault) BuildInjectionScriptForNames(secretNames []string) (string, error) {
	if len(secretNames) == 0 {
		return "", fmt.Errorf("at least one secret name is required")
	}

	resolvedEnvVars, resolveErr := v.resolveEnvVarsForNames(secretNames)
	if resolveErr != nil {
		return "", resolveErr
	}

	return BuildInjectionScript(resolvedEnvVars)
}

// resolveEnvVarsForNames maps the requested secret names to their envVarName→secretValue
// pairs, updating LastUsedAt timestamps as a side effect. Holds the write lock
// for the duration so callers must NOT hold the lock when calling this method.
// Returns an error if any requested name has no matching entry.
func (v *Vault) resolveEnvVarsForNames(secretNames []string) (map[string]string, error) {
	// Track which names have not yet been found so we can report missing entries.
	pendingNames := make(map[string]bool, len(secretNames))
	for _, secretName := range secretNames {
		pendingNames[secretName] = true
	}

	v.mu.Lock()
	defer v.mu.Unlock()

	if !v.isOpen {
		return nil, fmt.Errorf("vault is not open")
	}

	now := time.Now().UTC()
	resolvedEnvVars := make(map[string]string, len(secretNames))

	for _, entry := range v.entries {
		if pendingNames[entry.SecretName] {
			resolvedEnvVars[entry.EnvVarName] = entry.SecretValue
			entry.LastUsedAt = &now
			delete(pendingNames, entry.SecretName) // mark as found
		}
	}

	// Any name remaining in pendingNames was not present in the vault.
	// Include the full list of available names in the error so agents can
	// self-correct on the next call without requiring user intervention.
	if len(pendingNames) > 0 {
		missingNames := make([]string, 0, len(pendingNames))
		for missingName := range pendingNames {
			missingNames = append(missingNames, missingName)
		}
		availableNames := make([]string, 0, len(v.entries))
		for _, entry := range v.entries {
			availableNames = append(availableNames, entry.SecretName)
		}
		return nil, fmt.Errorf("vault entries not found: %v. Available entry names: %v", missingNames, availableNames)
	}

	// Persist updated LastUsedAt timestamps before releasing the lock.
	if len(resolvedEnvVars) > 0 {
		_ = v.saveToFileLocked()
	}

	return resolvedEnvVars, nil
}

// GetEntryValue returns the decrypted plaintext value for the entry with entryID.
// This is the only Vault method that exposes a raw secret value to a caller
// outside the PTY session spawner — it exists solely to support the user-initiated
// reveal action in the Vault UI. Every call is logged for auditability.
func (v *Vault) GetEntryValue(entryID string) (string, error) {
	v.mu.RLock()
	defer v.mu.RUnlock()

	if !v.isOpen {
		return "", fmt.Errorf("vault is not open")
	}

	for _, entry := range v.entries {
		if entry.ID == entryID {
			log.Printf("[Vault] Secret value revealed: %s (%s)", entry.SecretName, entry.EnvVarName)
			return entry.SecretValue, nil
		}
	}

	return "", fmt.Errorf("vault entry %q not found", entryID)
}

// GetStatus returns a snapshot of the vault's current state.
func (v *Vault) GetStatus() VaultStatus {
	v.mu.RLock()
	defer v.mu.RUnlock()

	autoInjectCount := 0
	for _, entry := range v.entries {
		if entry.ShouldAutoInject {
			autoInjectCount++
		}
	}

	return VaultStatus{
		IsOpen:          v.isOpen,
		EntryCount:      len(v.entries),
		AutoInjectCount: autoInjectCount,
		VaultPath:       v.vaultPath,
	}
}

// ── Internal helpers ─────────────────────────────────────────────────────────

// loadFromDisk reads vault.enc, decrypts it, and populates v.entries.
// Must be called before acquiring v.mu (used only during Open).
func (v *Vault) loadFromDisk() error {
	encryptedData, readErr := os.ReadFile(v.vaultPath)
	if readErr != nil {
		return fmt.Errorf("reading vault file: %w", readErr)
	}

	contents, decryptErr := decryptVaultContents(encryptedData, v.masterKey)
	if decryptErr != nil {
		return fmt.Errorf("decrypting vault: %w", decryptErr)
	}

	v.entries = make([]*diskEntry, len(contents.Entries))
	for idx := range contents.Entries {
		entryCopy := contents.Entries[idx]
		v.entries[idx] = &entryCopy
	}
	return nil
}

// saveToFileLocked encrypts v.entries and writes the result to vault.enc
// atomically (write temp file → rename).
// MUST be called with v.mu already held.
func (v *Vault) saveToFileLocked() error {
	contents := &diskContents{
		Version: CurrentVaultFileVersion,
		Entries: make([]diskEntry, len(v.entries)),
	}
	for idx, entry := range v.entries {
		contents.Entries[idx] = *entry
	}

	encryptedData, encryptErr := encryptVaultContents(contents, v.masterKey)
	if encryptErr != nil {
		return fmt.Errorf("encrypting vault contents: %w", encryptErr)
	}

	// Write to a temporary file first so a crash during write can never corrupt the live vault.
	tempFilePath := v.vaultPath + ".tmp"
	if writeErr := os.WriteFile(tempFilePath, encryptedData, 0600); writeErr != nil {
		return fmt.Errorf("writing vault temp file: %w", writeErr)
	}

	if renameErr := os.Rename(tempFilePath, v.vaultPath); renameErr != nil {
		_ = os.Remove(tempFilePath)
		return fmt.Errorf("committing vault file via rename: %w", renameErr)
	}

	return nil
}

// findEntryIndexLocked returns the slice index of the entry with entryID,
// or -1 if not found. Must be called with v.mu held.
func (v *Vault) findEntryIndexLocked(entryID string) int {
	for idx, entry := range v.entries {
		if entry.ID == entryID {
			return idx
		}
	}
	return -1
}

// diskEntryToPublic converts the internal disk representation to the API-safe
// VaultEntry type. The SecretValue field is intentionally not copied.
//
// It also recomputes DescriptionWarning on every read (rather than persisting it),
// so descriptions that contain secret material — including those stored before this
// check existed — are flagged to the user without any data migration.
func diskEntryToPublic(entry *diskEntry) *VaultEntry {
	_, descriptionWarning := ScanForSecretInText(entry.Description)

	return &VaultEntry{
		ID:                 entry.ID,
		SecretName:         entry.SecretName,
		EnvVarName:         entry.EnvVarName,
		URL:                entry.URL,
		Description:        entry.Description,
		BundleID:           entry.BundleID,
		BundleType:         entry.BundleType,
		ShouldAutoInject:   entry.ShouldAutoInject,
		CreatedAt:          entry.CreatedAt,
		LastUsedAt:         entry.LastUsedAt,
		DescriptionWarning: descriptionWarning,
	}
}
