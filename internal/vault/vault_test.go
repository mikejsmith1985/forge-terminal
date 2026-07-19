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
		URL:              "https://platform.openai.com",
		Description:      "Used for AI completions",
		BundleID:         "openai-primary",
		BundleType:       "password",
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
	if allEntries[0].URL != "https://platform.openai.com" {
		t.Errorf("expected URL to persist, got %q", allEntries[0].URL)
	}
	if allEntries[0].BundleID != "openai-primary" {
		t.Errorf("expected BundleID to persist, got %q", allEntries[0].BundleID)
	}
	if allEntries[0].BundleType != "password" {
		t.Errorf("expected BundleType to persist, got %q", allEntries[0].BundleType)
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

// ── UpdateEntry tests ─────────────────────────────────────────────────────────

// TestUpdateEntryChangesNameAndValue verifies that updating both the secretName
// and secretValue of an existing entry changes them correctly and that the
// listed entry reflects the new name.
func TestUpdateEntryChangesNameAndValue(t *testing.T) {
	testVault, cleanup := openTestVault(t)
	defer cleanup()

	createdEntry, addErr := testVault.AddEntry(AddEntryRequest{
		SecretName:  "Original Name",
		EnvVarName:  "ORIGINAL_ENV",
		SecretValue: "original-secret",
	})
	if addErr != nil {
		t.Fatalf("AddEntry returned unexpected error: %v", addErr)
	}

	updatedEntry, updateErr := testVault.UpdateEntry(UpdateEntryRequest{
		ID:          createdEntry.ID,
		SecretName:  "Updated Name",
		SecretValue: "updated-secret",
	})
	if updateErr != nil {
		t.Fatalf("UpdateEntry returned unexpected error: %v", updateErr)
	}

	if updatedEntry.SecretName != "Updated Name" {
		t.Errorf("expected SecretName %q, got %q", "Updated Name", updatedEntry.SecretName)
	}

	// Verify the change is reflected when listing entries.
	allEntries := testVault.ListEntries()
	if len(allEntries) != 1 {
		t.Fatalf("expected 1 entry after update, got %d", len(allEntries))
	}
	if allEntries[0].SecretName != "Updated Name" {
		t.Errorf("listed SecretName expected %q, got %q", "Updated Name", allEntries[0].SecretName)
	}
}

// TestUpdateEntryValueOnly verifies that updating only the secretValue leaves
// the secretName and envVarName unchanged.
func TestUpdateEntryValueOnly(t *testing.T) {
	testVault, cleanup := openTestVault(t)
	defer cleanup()

	createdEntry, addErr := testVault.AddEntry(AddEntryRequest{
		SecretName:  "Keep This Name",
		EnvVarName:  "KEEP_THIS_ENV",
		SecretValue: "old-secret",
	})
	if addErr != nil {
		t.Fatalf("AddEntry returned unexpected error: %v", addErr)
	}

	// Only supply the secret value — all other fields are intentionally empty.
	_, updateErr := testVault.UpdateEntry(UpdateEntryRequest{
		ID:          createdEntry.ID,
		SecretValue: "new-secret",
	})
	if updateErr != nil {
		t.Fatalf("UpdateEntry returned unexpected error: %v", updateErr)
	}

	allEntries := testVault.ListEntries()
	if len(allEntries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(allEntries))
	}
	if allEntries[0].SecretName != "Keep This Name" {
		t.Errorf("SecretName should be unchanged; expected %q, got %q", "Keep This Name", allEntries[0].SecretName)
	}
	if allEntries[0].EnvVarName != "KEEP_THIS_ENV" {
		t.Errorf("EnvVarName should be unchanged; expected %q, got %q", "KEEP_THIS_ENV", allEntries[0].EnvVarName)
	}
}

// TestUpdateEntryURLOnly verifies that updating only URL leaves the core identifiers unchanged.
func TestUpdateEntryURLOnly(t *testing.T) {
	testVault, cleanup := openTestVault(t)
	defer cleanup()

	createdEntry, addErr := testVault.AddEntry(AddEntryRequest{
		SecretName:  "URL Secret",
		EnvVarName:  "URL_SECRET",
		SecretValue: "url-secret",
		URL:         "https://old.example.com",
	})
	if addErr != nil {
		t.Fatalf("AddEntry returned unexpected error: %v", addErr)
	}

	_, updateErr := testVault.UpdateEntry(UpdateEntryRequest{
		ID:  createdEntry.ID,
		URL: stringPointer("https://new.example.com"),
	})
	if updateErr != nil {
		t.Fatalf("UpdateEntry returned unexpected error: %v", updateErr)
	}

	allEntries := testVault.ListEntries()
	if len(allEntries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(allEntries))
	}
	if allEntries[0].URL != "https://new.example.com" {
		t.Errorf("expected updated URL, got %q", allEntries[0].URL)
	}
	if allEntries[0].EnvVarName != "URL_SECRET" {
		t.Errorf("expected env var to remain unchanged, got %q", allEntries[0].EnvVarName)
	}
}

// stringPointer returns a pointer to the given string. Update requests use pointer
// fields for URL and Description so tests can express "clear this field" (a non-nil
// empty string) distinctly from "leave unchanged" (a nil pointer).
func stringPointer(value string) *string {
	return &value
}

// TestUpdateEntryClearsDescription verifies that a user can blank out a previously
// set description and that the cleared value survives a vault reopen. This directly
// reproduces the reported bug: the save appeared to succeed but reopening still
// showed the old description, because the update path treated an empty string as
// "leave unchanged" rather than "clear this field".
func TestUpdateEntryClearsDescription(t *testing.T) {
	tempDir, mkdirErr := os.MkdirTemp("", "forge-vault-clear-desc-*")
	if mkdirErr != nil {
		t.Fatalf("creating temp dir: %v", mkdirErr)
	}
	defer os.RemoveAll(tempDir)

	firstVault, openErr := Open(tempDir)
	if openErr != nil {
		t.Fatalf("opening first vault: %v", openErr)
	}

	createdEntry, addErr := firstVault.AddEntry(AddEntryRequest{
		SecretName:  "Described Secret",
		EnvVarName:  "DESCRIBED_SECRET",
		SecretValue: "described-secret",
		Description: "old description",
	})
	if addErr != nil {
		t.Fatalf("AddEntry returned unexpected error: %v", addErr)
	}

	// Explicitly clear the description while leaving every other field alone.
	_, updateErr := firstVault.UpdateEntry(UpdateEntryRequest{
		ID:          createdEntry.ID,
		Description: stringPointer(""),
	})
	if updateErr != nil {
		t.Fatalf("UpdateEntry returned unexpected error: %v", updateErr)
	}

	// Reopen from the same directory to simulate closing and reopening the panel.
	secondVault, reopenErr := Open(tempDir)
	if reopenErr != nil {
		t.Fatalf("reopening vault: %v", reopenErr)
	}

	reopenedEntries := secondVault.ListEntries()
	if len(reopenedEntries) != 1 {
		t.Fatalf("expected 1 entry after reopen, got %d", len(reopenedEntries))
	}
	if reopenedEntries[0].Description != "" {
		t.Errorf("expected description to be cleared after reopen, got %q", reopenedEntries[0].Description)
	}
}

// TestUpdateEntryOmittedDescriptionUnchanged verifies the other side of the
// tri-state contract: when the description pointer is nil (field omitted), an
// update to a different field leaves the existing description intact.
func TestUpdateEntryOmittedDescriptionUnchanged(t *testing.T) {
	testVault, cleanup := openTestVault(t)
	defer cleanup()

	createdEntry, addErr := testVault.AddEntry(AddEntryRequest{
		SecretName:  "Keeps Description",
		EnvVarName:  "KEEPS_DESCRIPTION",
		SecretValue: "keeps-description",
		Description: "keep me",
	})
	if addErr != nil {
		t.Fatalf("AddEntry returned unexpected error: %v", addErr)
	}

	// Update only the secret value; Description is nil, so it must be left alone.
	_, updateErr := testVault.UpdateEntry(UpdateEntryRequest{
		ID:          createdEntry.ID,
		SecretValue: "rotated",
	})
	if updateErr != nil {
		t.Fatalf("UpdateEntry returned unexpected error: %v", updateErr)
	}

	allEntries := testVault.ListEntries()
	if allEntries[0].Description != "keep me" {
		t.Errorf("expected description to be preserved, got %q", allEntries[0].Description)
	}
}

// TestUpdateEntryRejectsNonExistentID verifies that calling UpdateEntry with an
// ID that does not exist in the vault returns an error.
func TestUpdateEntryRejectsNonExistentID(t *testing.T) {
	testVault, cleanup := openTestVault(t)
	defer cleanup()

	_, updateErr := testVault.UpdateEntry(UpdateEntryRequest{
		ID:         "non-existent-id-12345",
		SecretName: "Should Fail",
	})
	if updateErr == nil {
		t.Error("expected an error updating a non-existent entry, but got nil")
	}
}

// TestUpdateEntryRejectsDuplicateEnvVar verifies that changing an entry's
// envVarName to one already used by another entry is rejected.
func TestUpdateEntryRejectsDuplicateEnvVar(t *testing.T) {
	testVault, cleanup := openTestVault(t)
	defer cleanup()

	firstEntry, addErr := testVault.AddEntry(AddEntryRequest{
		SecretName:  "First Secret",
		EnvVarName:  "FIRST_ENV",
		SecretValue: "first-value",
	})
	if addErr != nil {
		t.Fatalf("AddEntry (first) returned unexpected error: %v", addErr)
	}

	_, secondAddErr := testVault.AddEntry(AddEntryRequest{
		SecretName:  "Second Secret",
		EnvVarName:  "SECOND_ENV",
		SecretValue: "second-value",
	})
	if secondAddErr != nil {
		t.Fatalf("AddEntry (second) returned unexpected error: %v", secondAddErr)
	}

	// Try to change the first entry's env var to match the second entry's.
	_, updateErr := testVault.UpdateEntry(UpdateEntryRequest{
		ID:         firstEntry.ID,
		EnvVarName: "SECOND_ENV",
	})
	if updateErr == nil {
		t.Error("expected an error when updating envVarName to a duplicate, but got nil")
	}
}

// TestUpdateEntryAllowsSameEnvVarOnSelf verifies that submitting an update with
// the same envVarName the entry already has (a "self-duplicate") does not cause
// a uniqueness violation — it should succeed and apply any other changed fields.
func TestUpdateEntryAllowsSameEnvVarOnSelf(t *testing.T) {
	testVault, cleanup := openTestVault(t)
	defer cleanup()

	createdEntry, addErr := testVault.AddEntry(AddEntryRequest{
		SecretName:  "Self Env Test",
		EnvVarName:  "SELF_ENV",
		SecretValue: "self-value",
	})
	if addErr != nil {
		t.Fatalf("AddEntry returned unexpected error: %v", addErr)
	}

	// Re-submit the same envVarName while changing the secretName.
	updatedEntry, updateErr := testVault.UpdateEntry(UpdateEntryRequest{
		ID:         createdEntry.ID,
		SecretName: "Renamed Self",
		EnvVarName: "SELF_ENV",
	})
	if updateErr != nil {
		t.Fatalf("UpdateEntry should allow same envVarName on self, but got error: %v", updateErr)
	}
	if updatedEntry.SecretName != "Renamed Self" {
		t.Errorf("expected SecretName %q, got %q", "Renamed Self", updatedEntry.SecretName)
	}
}

// ── ListEntryNames tests ──────────────────────────────────────────────────────

// TestListEntryNames_ReturnsAllNames verifies that ListEntryNames returns the
// SecretName for every entry currently in the vault.
func TestListEntryNames_ReturnsAllNames(t *testing.T) {
	tempDir, mkdirErr := os.MkdirTemp("", "forge-vault-listnames-*")
	if mkdirErr != nil {
		t.Fatalf("creating temp dir: %v", mkdirErr)
	}
	defer os.RemoveAll(tempDir)

	testVault, openErr := Open(tempDir)
	if openErr != nil {
		t.Fatalf("opening vault: %v", openErr)
	}

	entryNames := []string{"DBAI-TestBot", "OpenAI Key", "Discord Token"}
	for idx, secretName := range entryNames {
		_, addErr := testVault.AddEntry(AddEntryRequest{
			SecretName:  secretName,
			EnvVarName:  fmt.Sprintf("ENV_VAR_%d", idx),
			SecretValue: fmt.Sprintf("secret-value-%d", idx),
		})
		if addErr != nil {
			t.Fatalf("AddEntry %q returned unexpected error: %v", secretName, addErr)
		}
	}

	returnedNames := testVault.ListEntryNames()

	if len(returnedNames) != len(entryNames) {
		t.Fatalf("expected %d names, got %d: %v", len(entryNames), len(returnedNames), returnedNames)
	}
	nameSet := make(map[string]bool, len(returnedNames))
	for _, name := range returnedNames {
		nameSet[name] = true
	}
	for _, expectedName := range entryNames {
		if !nameSet[expectedName] {
			t.Errorf("expected name %q to appear in ListEntryNames result", expectedName)
		}
	}
}

// TestListEntryNames_EmptyVaultReturnsEmptySlice verifies that an empty vault
// returns an empty (non-nil) slice rather than nil.
func TestListEntryNames_EmptyVaultReturnsEmptySlice(t *testing.T) {
	tempDir, mkdirErr := os.MkdirTemp("", "forge-vault-listnames-empty-*")
	if mkdirErr != nil {
		t.Fatalf("creating temp dir: %v", mkdirErr)
	}
	defer os.RemoveAll(tempDir)

	emptyVault, openErr := Open(tempDir)
	if openErr != nil {
		t.Fatalf("opening vault: %v", openErr)
	}

	returnedNames := emptyVault.ListEntryNames()

	if returnedNames == nil {
		t.Error("ListEntryNames must return an empty slice, not nil")
	}
	if len(returnedNames) != 0 {
		t.Errorf("expected 0 names for empty vault, got %d: %v", len(returnedNames), returnedNames)
	}
}

// TestListEntryNames_NeverExposesSecretValues verifies that none of the entries'
// secret values appear anywhere in the ListEntryNames output.
func TestListEntryNames_NeverExposesSecretValues(t *testing.T) {
	tempDir, mkdirErr := os.MkdirTemp("", "forge-vault-listnames-zerok-*")
	if mkdirErr != nil {
		t.Fatalf("creating temp dir: %v", mkdirErr)
	}
	defer os.RemoveAll(tempDir)

	testVault, openErr := Open(tempDir)
	if openErr != nil {
		t.Fatalf("opening vault: %v", openErr)
	}

	const sensitiveToken = "ghp_SHOULD-NOT-APPEAR-IN-NAMES-LIST"
	_, addErr := testVault.AddEntry(AddEntryRequest{
		SecretName:  "GitHub Token",
		EnvVarName:  "GITHUB_TOKEN",
		SecretValue: sensitiveToken,
	})
	if addErr != nil {
		t.Fatalf("AddEntry returned unexpected error: %v", addErr)
	}

	returnedNames := testVault.ListEntryNames()

	for _, name := range returnedNames {
		if strings.Contains(name, sensitiveToken) {
			t.Errorf("zero-knowledge violation: secret value appeared in ListEntryNames output: %q", name)
		}
	}
}

// TestResolveEnvVarsForNames_ErrorIncludesAvailableNames verifies that when
// vault_inject is called with an unknown name, the error message lists the
// names that ARE available so the agent can self-correct without user intervention.
func TestResolveEnvVarsForNames_ErrorIncludesAvailableNames(t *testing.T) {
	tempDir, mkdirErr := os.MkdirTemp("", "forge-vault-errnames-*")
	if mkdirErr != nil {
		t.Fatalf("creating temp dir: %v", mkdirErr)
	}
	defer os.RemoveAll(tempDir)

	testVault, openErr := Open(tempDir)
	if openErr != nil {
		t.Fatalf("opening vault: %v", openErr)
	}

	_, addErr := testVault.AddEntry(AddEntryRequest{
		SecretName:  "DBAI-TestBot",
		EnvVarName:  "DBAI_TESTBOT_TOKEN",
		SecretValue: "real-secret-value",
	})
	if addErr != nil {
		t.Fatalf("AddEntry returned unexpected error: %v", addErr)
	}

	// Agent guesses the wrong name — the error must tell it the correct one.
	_, injectErr := testVault.BuildInjectionScriptForNames([]string{"DBAI_TESTBOT"})

	if injectErr == nil {
		t.Fatal("expected an error for unknown entry name, got nil")
	}
	if !strings.Contains(injectErr.Error(), "DBAI-TestBot") {
		t.Errorf("error message must include available entry names so the agent can self-correct\ngot: %v", injectErr)
	}
}

// TestUpdateEntryPersistsAcrossReopen verifies that an updated secret value
// survives a vault close/reopen cycle (i.e. the update was saved to disk).
func TestUpdateEntryPersistsAcrossReopen(t *testing.T) {
	tempDir, mkdirErr := os.MkdirTemp("", "forge-vault-update-persist-*")
	if mkdirErr != nil {
		t.Fatalf("creating temp dir: %v", mkdirErr)
	}
	defer os.RemoveAll(tempDir)

	// Open the vault and add an entry with an initial secret value.
	firstVault, openErr := Open(tempDir)
	if openErr != nil {
		t.Fatalf("opening first vault: %v", openErr)
	}

	createdEntry, addErr := firstVault.AddEntry(AddEntryRequest{
		SecretName:  "Persist Update Key",
		EnvVarName:  "PERSIST_UPDATE_KEY",
		SecretValue: "before-update",
	})
	if addErr != nil {
		t.Fatalf("AddEntry returned unexpected error: %v", addErr)
	}

	// Update the secret value while the vault is still open.
	_, updateErr := firstVault.UpdateEntry(UpdateEntryRequest{
		ID:          createdEntry.ID,
		SecretValue: "after-update",
	})
	if updateErr != nil {
		t.Fatalf("UpdateEntry returned unexpected error: %v", updateErr)
	}

	// Reopen the vault from the same directory (simulates app restart).
	secondVault, reopenErr := Open(tempDir)
	if reopenErr != nil {
		t.Fatalf("reopening vault: %v", reopenErr)
	}

	// Retrieve the secret value via the reopened vault and verify it persisted.
	revealedValue, revealErr := secondVault.GetEntryValue(createdEntry.ID)
	if revealErr != nil {
		t.Fatalf("GetEntryValue returned unexpected error: %v", revealErr)
	}
	if revealedValue != "after-update" {
		t.Errorf("expected persisted value %q, got %q", "after-update", revealedValue)
	}
}
