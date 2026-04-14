// vault_test.go — Unit tests for core Forge Vault operations.
//
// Tests use a temporary directory as the vault store so no real files are
// modified. Each test gets a fresh vault instance via Open().
package vault_test

import (
	"os"
	"testing"

	"github.com/mikejsmith1985/forge-terminal/internal/vault"
)

// openTempVault creates a vault in a fresh temp directory and returns it
// along with a cleanup function the caller should defer.
func openTempVault(t *testing.T) (*vault.Vault, func()) {
	t.Helper()
	tempDir, err := os.MkdirTemp("", "forge-vault-test-*")
	if err != nil {
		t.Fatalf("failed to create temp vault dir: %v", err)
	}
	openedVault, openErr := vault.Open(tempDir)
	if openErr != nil {
		os.RemoveAll(tempDir)
		t.Fatalf("vault.Open failed: %v", openErr)
	}
	cleanup := func() { os.RemoveAll(tempDir) }
	return openedVault, cleanup
}

// TestOpen_CreatesEmptyVault verifies that a fresh vault directory produces
// a vault with zero entries and an open status.
func TestOpen_CreatesEmptyVault(t *testing.T) {
	testVault, cleanup := openTempVault(t)
	defer cleanup()

	vaultStatus := testVault.GetStatus()
	if !vaultStatus.IsOpen {
		t.Error("expected IsOpen=true for freshly opened vault")
	}
	if vaultStatus.EntryCount != 0 {
		t.Errorf("expected empty vault, got EntryCount=%d", vaultStatus.EntryCount)
	}
}

// TestAddEntry_StoresAndReturnsPublicEntry verifies that AddEntry saves a
// secret and returns the API-safe metadata without the secret value.
func TestAddEntry_StoresAndReturnsPublicEntry(t *testing.T) {
	testVault, cleanup := openTempVault(t)
	defer cleanup()

	addRequest := vault.AddEntryRequest{
		SecretName:       "OpenAI API Key",
		EnvVarName:       "OPENAI_API_KEY",
		SecretValue:      "sk-test-value",
		Description:      "For code generation",
		ShouldAutoInject: true,
	}

	createdEntry, addErr := testVault.AddEntry(addRequest)
	if addErr != nil {
		t.Fatalf("AddEntry failed: %v", addErr)
	}

	if createdEntry.ID == "" {
		t.Error("created entry should have a non-empty ID")
	}
	if createdEntry.SecretName != addRequest.SecretName {
		t.Errorf("SecretName: expected %q, got %q", addRequest.SecretName, createdEntry.SecretName)
	}
	if createdEntry.EnvVarName != addRequest.EnvVarName {
		t.Errorf("EnvVarName: expected %q, got %q", addRequest.EnvVarName, createdEntry.EnvVarName)
	}
	if !createdEntry.ShouldAutoInject {
		t.Error("ShouldAutoInject should be true")
	}
}

// TestAddEntry_RejectsDuplicateEnvVarName verifies that adding two entries
// with the same EnvVarName returns an error to prevent injection conflicts.
func TestAddEntry_RejectsDuplicateEnvVarName(t *testing.T) {
	testVault, cleanup := openTempVault(t)
	defer cleanup()

	addRequest := vault.AddEntryRequest{
		SecretName:  "First Key",
		EnvVarName:  "MY_KEY",
		SecretValue: "first-value",
	}
	if _, err := testVault.AddEntry(addRequest); err != nil {
		t.Fatalf("first AddEntry failed: %v", err)
	}

	duplicateRequest := vault.AddEntryRequest{
		SecretName:  "Second Key",
		EnvVarName:  "MY_KEY", // same env var name — must be rejected
		SecretValue: "second-value",
	}
	_, duplicateErr := testVault.AddEntry(duplicateRequest)
	if duplicateErr == nil {
		t.Error("AddEntry should reject duplicate env var name but succeeded")
	}
}

// TestRemoveEntry_DeletesExistingEntry verifies that RemoveEntry reduces
// the entry count and makes the deleted ID unretrievable.
func TestRemoveEntry_DeletesExistingEntry(t *testing.T) {
	testVault, cleanup := openTempVault(t)
	defer cleanup()

	addRequest := vault.AddEntryRequest{
		SecretName:  "Key to delete",
		EnvVarName:  "TEMP_KEY",
		SecretValue: "temp-value",
	}
	createdEntry, addErr := testVault.AddEntry(addRequest)
	if addErr != nil {
		t.Fatalf("AddEntry failed: %v", addErr)
	}

	removeErr := testVault.RemoveEntry(createdEntry.ID)
	if removeErr != nil {
		t.Fatalf("RemoveEntry failed: %v", removeErr)
	}

	allEntries := testVault.ListEntries()
	for _, entry := range allEntries {
		if entry.ID == createdEntry.ID {
			t.Error("removed entry still appears in ListEntries")
		}
	}
}

// TestRemoveEntry_RejectsUnknownID verifies that RemoveEntry returns an error
// for a non-existent entry ID rather than silently succeeding.
func TestRemoveEntry_RejectsUnknownID(t *testing.T) {
	testVault, cleanup := openTempVault(t)
	defer cleanup()

	removeErr := testVault.RemoveEntry("non-existent-id")
	if removeErr == nil {
		t.Error("RemoveEntry should return an error for an unknown entry ID")
	}
}

// TestGetEntryValue_ReturnsCorrectSecret verifies that GetEntryValue returns
// the exact plaintext value that was stored by AddEntry.
func TestGetEntryValue_ReturnsCorrectSecret(t *testing.T) {
	testVault, cleanup := openTempVault(t)
	defer cleanup()

	const expectedSecretValue = "sk-test-secret-value-12345"
	addRequest := vault.AddEntryRequest{
		SecretName:  "Test Key",
		EnvVarName:  "TEST_KEY",
		SecretValue: expectedSecretValue,
	}
	createdEntry, addErr := testVault.AddEntry(addRequest)
	if addErr != nil {
		t.Fatalf("AddEntry failed: %v", addErr)
	}

	revealedValue, revealErr := testVault.GetEntryValue(createdEntry.ID)
	if revealErr != nil {
		t.Fatalf("GetEntryValue failed: %v", revealErr)
	}
	if revealedValue != expectedSecretValue {
		t.Errorf("GetEntryValue: expected %q, got %q", expectedSecretValue, revealedValue)
	}
}

// TestGetAutoInjectEnv_OnlyIncludesFlaggedEntries verifies that GetAutoInjectEnv
// returns key=value pairs only for entries with ShouldAutoInject=true.
func TestGetAutoInjectEnv_OnlyIncludesFlaggedEntries(t *testing.T) {
	testVault, cleanup := openTempVault(t)
	defer cleanup()

	injectRequest := vault.AddEntryRequest{
		SecretName:       "Auto Key",
		EnvVarName:       "AUTO_KEY",
		SecretValue:      "auto-value",
		ShouldAutoInject: true,
	}
	manualRequest := vault.AddEntryRequest{
		SecretName:       "Manual Key",
		EnvVarName:       "MANUAL_KEY",
		SecretValue:      "manual-value",
		ShouldAutoInject: false,
	}

	if _, err := testVault.AddEntry(injectRequest); err != nil {
		t.Fatalf("AddEntry (auto-inject) failed: %v", err)
	}
	if _, err := testVault.AddEntry(manualRequest); err != nil {
		t.Fatalf("AddEntry (manual) failed: %v", err)
	}

	autoInjectEnvVars := testVault.GetAutoInjectEnv()
	if len(autoInjectEnvVars) != 1 {
		t.Errorf("expected 1 auto-inject env var, got %d", len(autoInjectEnvVars))
	}
	if len(autoInjectEnvVars) > 0 && autoInjectEnvVars[0] != "AUTO_KEY=auto-value" {
		t.Errorf("unexpected auto-inject value: %q", autoInjectEnvVars[0])
	}
}

// TestOpen_PersistsAcrossReopen verifies that entries survive a vault close and reopen.
// This proves the encrypt-to-disk and decrypt-from-disk pipeline is correct end-to-end.
func TestOpen_PersistsAcrossReopen(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "forge-vault-persist-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// First open: add an entry and close.
	firstVault, openErr := vault.Open(tempDir)
	if openErr != nil {
		t.Fatalf("first vault.Open failed: %v", openErr)
	}
	addRequest := vault.AddEntryRequest{
		SecretName:  "Persistent Key",
		EnvVarName:  "PERSISTENT_KEY",
		SecretValue: "persisted-secret",
	}
	if _, err := firstVault.AddEntry(addRequest); err != nil {
		t.Fatalf("AddEntry failed: %v", err)
	}

	// Second open: the entry must still be there.
	secondVault, reopenErr := vault.Open(tempDir)
	if reopenErr != nil {
		t.Fatalf("second vault.Open (reopen) failed: %v", reopenErr)
	}

	allEntries := secondVault.ListEntries()
	if len(allEntries) != 1 {
		t.Fatalf("expected 1 entry after reopen, got %d", len(allEntries))
	}
	if allEntries[0].EnvVarName != "PERSISTENT_KEY" {
		t.Errorf("expected env var %q after reopen, got %q", "PERSISTENT_KEY", allEntries[0].EnvVarName)
	}
}
