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
	mu          sync.RWMutex
	isOpen      bool
	vaultPath   string  // absolute path to vault.enc
	masterKey   []byte  // 32-byte AES-256 key held in memory while running
	entries     []*diskEntry
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
		Description:      request.Description,
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
func diskEntryToPublic(entry *diskEntry) *VaultEntry {
	return &VaultEntry{
		ID:               entry.ID,
		SecretName:       entry.SecretName,
		EnvVarName:       entry.EnvVarName,
		Description:      entry.Description,
		ShouldAutoInject: entry.ShouldAutoInject,
		CreatedAt:        entry.CreatedAt,
		LastUsedAt:       entry.LastUsedAt,
	}
}
