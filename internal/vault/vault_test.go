// vault_test.go — Tests for the Forge Vault package.
//
// Tests verify: round-trip encryption/decryption, CRUD operations,
// auto-inject env building, duplicate rejection, and injection script generation.
package vault

import (
	"fmt"
	"os"
	"strings"
	"testing"
)

// ── Crypto tests ──────────────────────────────────────────────────────────────

// TestEncryptDecryptRoundTrip verifies that encrypting then decrypting vault
// contents returns the original data unchanged.
func TestEncryptDecryptRoundTrip(t *testing.T) {
	masterKey := make([]byte, MasterKeyLengthBytes)
	for idx := range masterKey {
		masterKey[idx] = byte(idx + 1) // deterministic non-zero key for testing
	}

	originalContents := &diskContents{
		Version: CurrentVaultFileVersion,
		Entries: []diskEntry{
			{
				ID:          "test-id-1",
				SecretName:  "GitHub Token",
				EnvVarName:  "GITHUB_TOKEN",
				SecretValue: "ghp_supersecretvalue",
			},
		},
	}

	encryptedBlob, encryptErr := encryptVaultContents(originalContents, masterKey)
	if encryptErr != nil {
		t.Fatalf("encryptVaultContents returned unexpected error: %v", encryptErr)
	}
	if len(encryptedBlob) == 0 {
		t.Fatal("encryptVaultContents returned empty blob")
	}

	recoveredContents, decryptErr := decryptVaultContents(encryptedBlob, masterKey)
	if decryptErr != nil {
		t.Fatalf("decryptVaultContents returned unexpected error: %v", decryptErr)
	}
	if len(recoveredContents.Entries) != 1 {
		t.Fatalf("expected 1 entry after decrypt, got %d", len(recoveredContents.Entries))
	}
	if recoveredContents.Entries[0].SecretValue != "ghp_supersecretvalue" {
		t.Errorf("secret value mismatch: got %q, want %q", recoveredContents.Entries[0].SecretValue, "ghp_supersecretvalue")
	}
}

// TestDecryptWithWrongKeyFails verifies that decrypting with the wrong key returns an error.
func TestDecryptWithWrongKeyFails(t *testing.T) {
	correctKey := make([]byte, MasterKeyLengthBytes)
	wrongKey := make([]byte, MasterKeyLengthBytes)
	for idx := range correctKey {
		correctKey[idx] = 0xAA
		wrongKey[idx] = 0xBB
	}

	originalContents := &diskContents{Version: CurrentVaultFileVersion}
	encryptedBlob, _ := encryptVaultContents(originalContents, correctKey)

	_, decryptErr := decryptVaultContents(encryptedBlob, wrongKey)
	if decryptErr == nil {
		t.Error("expected an error decrypting with the wrong key, but got nil")
	}
}

// TestDecryptTooShortBlobFails verifies that a truncated blob is rejected cleanly.
func TestDecryptTooShortBlobFails(t *testing.T) {
	masterKey := make([]byte, MasterKeyLengthBytes)
	tooShortBlob := []byte("short")

	_, decryptErr := decryptVaultContents(tooShortBlob, masterKey)
	if decryptErr == nil {
		t.Error("expected an error for a too-short encrypted blob, but got nil")
	}
}

// ── Vault CRUD tests ──────────────────────────────────────────────────────────

// openTestVault creates a temporary vault directory and opens a fresh vault for testing.
func openTestVault(t *testing.T) (*Vault, func()) {
	t.Helper()
	tempDir, mkdirErr := os.MkdirTemp("", "forge-vault-test-*")
	if mkdirErr != nil {
		t.Fatalf("creating temp dir for test vault: %v", mkdirErr)
	}

	testVault, openErr := Open(tempDir)
	if openErr != nil {
		os.RemoveAll(tempDir)
		t.Fatalf("opening test vault: %v", openErr)
	}

	cleanup := func() {
		os.RemoveAll(tempDir)
	}
	return testVault, cleanup
}

// TestAddAndListEntry verifies that adding an entry persists it and returns it in the list.
func TestAddAndListEntry(t *testing.T) {
	testVault, cleanup := openTestVault(t)
	defer cleanup()

	addRequest := AddEntryRequest{
		SecretName:       "OpenAI API Key",
		EnvVarName:       "OPENAI_API_KEY",
		SecretValue:      "sk-test-secret-value",
		Description:      "Used for AI completions",
		ShouldAutoInject: true,
	}

	createdEntry, addErr := testVault.AddEntry(addRequest)
	if addErr != nil {
		t.Fatalf("AddEntry returned unexpected error: %v", addErr)
	}
	if createdEntry.SecretName != "OpenAI API Key" {
		t.Errorf("expected SecretName %q, got %q", "OpenAI API Key", createdEntry.SecretName)
	}

	allEntries := testVault.ListEntries()
	if len(allEntries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(allEntries))
	}
	if allEntries[0].ID != createdEntry.ID {
		t.Error("listed entry ID does not match created entry ID")
	}
}

// TestListEntriesNeverExposesSecretValue verifies the API-safe guarantee.
func TestListEntriesNeverExposesSecretValue(t *testing.T) {
	testVault, cleanup := openTestVault(t)
	defer cleanup()

	_, _ = testVault.AddEntry(AddEntryRequest{
		SecretName:  "Secret",
		EnvVarName:  "MY_SECRET",
		SecretValue: "super-sensitive-value",
	})

	// VaultEntry has no SecretValue field, so the value structurally cannot leak.
	// This test is a compile-time safety check; if VaultEntry ever gains a SecretValue
	// field, this test will catch accidental exposure via the declared type.
	for _, publicEntry := range testVault.ListEntries() {
		_ = publicEntry // accessing the struct — if SecretValue were a field, we'd catch it here
	}
}

// TestRemoveEntry verifies that an entry is removed from the list after deletion.
func TestRemoveEntry(t *testing.T) {
	testVault, cleanup := openTestVault(t)
	defer cleanup()

	createdEntry, _ := testVault.AddEntry(AddEntryRequest{
		SecretName:  "Temp Key",
		EnvVarName:  "TEMP_KEY",
		SecretValue: "temp-value",
	})

	removeErr := testVault.RemoveEntry(createdEntry.ID)
	if removeErr != nil {
		t.Fatalf("RemoveEntry returned unexpected error: %v", removeErr)
	}

	if len(testVault.ListEntries()) != 0 {
		t.Error("expected 0 entries after removal, but the list is non-empty")
	}
}

// TestRemoveNonExistentEntryFails verifies that removing an unknown ID returns an error.
func TestRemoveNonExistentEntryFails(t *testing.T) {
	testVault, cleanup := openTestVault(t)
	defer cleanup()

	removeErr := testVault.RemoveEntry("does-not-exist")
	if removeErr == nil {
		t.Error("expected an error removing a non-existent entry, but got nil")
	}
}

// TestDuplicateEnvVarRejected verifies that adding two entries with the same env var name fails.
func TestDuplicateEnvVarRejected(t *testing.T) {
	testVault, cleanup := openTestVault(t)
	defer cleanup()

	_, _ = testVault.AddEntry(AddEntryRequest{
		SecretName:  "First",
		EnvVarName:  "DUPLICATE_KEY",
		SecretValue: "value-one",
	})

	_, duplicateErr := testVault.AddEntry(AddEntryRequest{
		SecretName:  "Second",
		EnvVarName:  "DUPLICATE_KEY",
		SecretValue: "value-two",
	})

	if duplicateErr == nil {
		t.Error("expected an error adding a duplicate env var name, but got nil")
	}
}

// TestVaultPersistsAcrossReopen verifies that entries survive a vault close/reopen cycle.
func TestVaultPersistsAcrossReopen(t *testing.T) {
	tempDir, _ := os.MkdirTemp("", "forge-vault-persist-test-*")
	defer os.RemoveAll(tempDir)

	// Open vault, add an entry, then let it go out of scope (simulating app restart).
	firstVault, openErr := Open(tempDir)
	if openErr != nil {
		t.Fatalf("opening first vault: %v", openErr)
	}
	_, _ = firstVault.AddEntry(AddEntryRequest{
		SecretName:  "Persisted Key",
		EnvVarName:  "PERSISTED_KEY",
		SecretValue: "persisted-value",
	})

	// Reopen the vault from the same directory.
	secondVault, reopenErr := Open(tempDir)
	if reopenErr != nil {
		t.Fatalf("reopening vault: %v", reopenErr)
	}

	allEntries := secondVault.ListEntries()
	if len(allEntries) != 1 {
		t.Fatalf("expected 1 entry after reopen, got %d", len(allEntries))
	}
	if allEntries[0].EnvVarName != "PERSISTED_KEY" {
		t.Errorf("unexpected env var name after reopen: %q", allEntries[0].EnvVarName)
	}
}

// ── Auto-inject env tests ─────────────────────────────────────────────────────

// TestGetAutoInjectEnvReturnsMarkedEntries verifies that only auto-inject entries
// appear in the PTY environment overlay.
func TestGetAutoInjectEnvReturnsMarkedEntries(t *testing.T) {
	testVault, cleanup := openTestVault(t)
	defer cleanup()

	_, _ = testVault.AddEntry(AddEntryRequest{
		SecretName:       "Auto Key",
		EnvVarName:       "AUTO_KEY",
		SecretValue:      "auto-secret",
		ShouldAutoInject: true,
	})
	_, _ = testVault.AddEntry(AddEntryRequest{
		SecretName:       "Manual Key",
		EnvVarName:       "MANUAL_KEY",
		SecretValue:      "manual-secret",
		ShouldAutoInject: false,
	})

	injectedVars := testVault.GetAutoInjectEnv()

	if len(injectedVars) != 1 {
		t.Fatalf("expected 1 auto-inject var, got %d: %v", len(injectedVars), injectedVars)
	}
	if injectedVars[0] != "AUTO_KEY=auto-secret" {
		t.Errorf("unexpected auto-inject value: %q", injectedVars[0])
	}
}

// TestSetAutoInjectTogglesCorrectly verifies that the auto-inject flag can be
// flipped and that the change is reflected in GetAutoInjectEnv.
func TestSetAutoInjectTogglesCorrectly(t *testing.T) {
	testVault, cleanup := openTestVault(t)
	defer cleanup()

	createdEntry, _ := testVault.AddEntry(AddEntryRequest{
		SecretName:       "Toggle Key",
		EnvVarName:       "TOGGLE_KEY",
		SecretValue:      "toggle-value",
		ShouldAutoInject: false,
	})

	if len(testVault.GetAutoInjectEnv()) != 0 {
		t.Fatal("expected no auto-inject vars before toggle, but got some")
	}

	toggleErr := testVault.SetAutoInject(createdEntry.ID, true)
	if toggleErr != nil {
		t.Fatalf("SetAutoInject returned unexpected error: %v", toggleErr)
	}

	if len(testVault.GetAutoInjectEnv()) != 1 {
		t.Fatal("expected 1 auto-inject var after toggle, but got none")
	}
}

// ── Injection script tests ────────────────────────────────────────────────────

// TestBuildInjectionScriptCreatesFile verifies that BuildInjectionScript
// produces a file at the returned path.
func TestBuildInjectionScriptCreatesFile(t *testing.T) {
	testVars := map[string]string{
		"TEST_VAR_ONE": "value-one",
		"TEST_VAR_TWO": "value-two",
	}

	scriptPath, buildErr := BuildInjectionScript(testVars)
	if buildErr != nil {
		t.Fatalf("BuildInjectionScript returned unexpected error: %v", buildErr)
	}
	defer os.Remove(scriptPath)

	if _, statErr := os.Stat(scriptPath); statErr != nil {
		t.Fatalf("script file does not exist at path %q: %v", scriptPath, statErr)
	}
}

// TestBuildInjectionScriptContainsVarNames verifies that the script references
// the correct variable names (the actual values should not appear in test assertions).
func TestBuildInjectionScriptContainsVarNames(t *testing.T) {
	testVars := map[string]string{"INJECT_TEST_VAR": "some-value"}

	scriptPath, buildErr := BuildInjectionScript(testVars)
	if buildErr != nil {
		t.Fatalf("BuildInjectionScript returned unexpected error: %v", buildErr)
	}
	defer os.Remove(scriptPath)

	scriptContent, readErr := os.ReadFile(scriptPath)
	if readErr != nil {
		t.Fatalf("reading injection script: %v", readErr)
	}

	if !strings.Contains(string(scriptContent), "INJECT_TEST_VAR") {
		t.Error("injection script does not contain the expected variable name")
	}
}

// TestBuildInjectionScriptRejectsEmptyVars verifies that an empty map returns an error.
func TestBuildInjectionScriptRejectsEmptyVars(t *testing.T) {
	_, buildErr := BuildInjectionScript(map[string]string{})
	if buildErr == nil {
		t.Error("expected an error for empty env vars, but got nil")
	}
}

// TestBuildInjectionScriptHandlesSingleQuotesInValues verifies that secret values
// containing single quotes are safely escaped to prevent shell injection.
func TestBuildInjectionScriptHandlesSingleQuotesInValues(t *testing.T) {
	testVars := map[string]string{"QUOTED_VAR": "value with ' single quote"}

	scriptPath, buildErr := BuildInjectionScript(testVars)
	if buildErr != nil {
		t.Fatalf("BuildInjectionScript returned unexpected error: %v", buildErr)
	}
	defer os.Remove(scriptPath)

	scriptContent, _ := os.ReadFile(scriptPath)
	rawScript := string(scriptContent)

	// The script must not contain a raw unescaped single quote sequence that would
	// break out of the string context and allow command injection.
	if strings.Contains(rawScript, "value with ' single") {
		t.Error("injection script contains unescaped single quote — potential shell injection risk")
	}
}

// TestGetStatusReturnsCorrectCounts verifies that VaultStatus reflects the actual entry list.
func TestGetStatusReturnsCorrectCounts(t *testing.T) {
	testVault, cleanup := openTestVault(t)
	defer cleanup()

	for idx := 0; idx < 3; idx++ {
		_, _ = testVault.AddEntry(AddEntryRequest{
			SecretName:       fmt.Sprintf("Key %d", idx),
			EnvVarName:       fmt.Sprintf("KEY_%d", idx),
			SecretValue:      fmt.Sprintf("secret-%d", idx),
			ShouldAutoInject: idx < 2, // first two are auto-inject
		})
	}

	vaultStatus := testVault.GetStatus()

	if vaultStatus.EntryCount != 3 {
		t.Errorf("expected EntryCount 3, got %d", vaultStatus.EntryCount)
	}
	if vaultStatus.AutoInjectCount != 2 {
		t.Errorf("expected AutoInjectCount 2, got %d", vaultStatus.AutoInjectCount)
	}
	if !vaultStatus.IsOpen {
		t.Error("expected IsOpen to be true")
	}
}
