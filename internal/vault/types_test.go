// types_test.go — Tests for the Forge Vault public type definitions.
//
// Verifies that VaultEntry and AddEntryRequest serialize/deserialize correctly,
// and that API-safe types never expose the secret value field.
package vault_test

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/vault"
)

// TestVaultEntry_JSONRoundTrip ensures VaultEntry marshals and unmarshals without data loss.
func TestVaultEntry_JSONRoundTrip(t *testing.T) {
	createdAt := time.Date(2024, 1, 15, 12, 0, 0, 0, time.UTC)
	originalEntry := &vault.VaultEntry{
		ID:               "test-id-123",
		SecretName:       "OpenAI API Key",
		EnvVarName:       "OPENAI_API_KEY",
		Description:      "Used for code generation",
		ShouldAutoInject: true,
		CreatedAt:        createdAt,
	}

	encoded, marshalErr := json.Marshal(originalEntry)
	if marshalErr != nil {
		t.Fatalf("failed to marshal VaultEntry: %v", marshalErr)
	}

	var decodedEntry vault.VaultEntry
	if unmarshalErr := json.Unmarshal(encoded, &decodedEntry); unmarshalErr != nil {
		t.Fatalf("failed to unmarshal VaultEntry: %v", unmarshalErr)
	}

	if decodedEntry.ID != originalEntry.ID {
		t.Errorf("ID mismatch: expected %q, got %q", originalEntry.ID, decodedEntry.ID)
	}
	if decodedEntry.SecretName != originalEntry.SecretName {
		t.Errorf("SecretName mismatch: expected %q, got %q", originalEntry.SecretName, decodedEntry.SecretName)
	}
	if decodedEntry.EnvVarName != originalEntry.EnvVarName {
		t.Errorf("EnvVarName mismatch: expected %q, got %q", originalEntry.EnvVarName, decodedEntry.EnvVarName)
	}
	if decodedEntry.ShouldAutoInject != originalEntry.ShouldAutoInject {
		t.Errorf("ShouldAutoInject mismatch: expected %v, got %v", originalEntry.ShouldAutoInject, decodedEntry.ShouldAutoInject)
	}
}

// TestVaultEntry_DoesNotContainSecretValue confirms the API-safe VaultEntry type
// has no SecretValue field in its JSON output — a key security invariant.
func TestVaultEntry_DoesNotContainSecretValue(t *testing.T) {
	entry := &vault.VaultEntry{
		ID:         "entry-1",
		SecretName: "My Key",
		EnvVarName: "MY_KEY",
	}

	encoded, err := json.Marshal(entry)
	if err != nil {
		t.Fatalf("failed to marshal VaultEntry: %v", err)
	}

	// VaultEntry must never expose a secretValue field in JSON output.
	if strings.Contains(string(encoded), "secretValue") {
		t.Error("VaultEntry JSON should NOT contain 'secretValue' — secret values must not be in list responses")
	}
}

// TestAddEntryRequest_JSONRoundTrip ensures the add-entry request body deserializes correctly.
func TestAddEntryRequest_JSONRoundTrip(t *testing.T) {
	rawJSON := `{"secretName":"GitHub Token","envVarName":"GITHUB_TOKEN","secretValue":"ghp_secret","description":"","shouldAutoInject":true}`

	var addRequest vault.AddEntryRequest
	if err := json.Unmarshal([]byte(rawJSON), &addRequest); err != nil {
		t.Fatalf("failed to unmarshal AddEntryRequest: %v", err)
	}

	if addRequest.SecretName != "GitHub Token" {
		t.Errorf("SecretName: expected %q, got %q", "GitHub Token", addRequest.SecretName)
	}
	if addRequest.EnvVarName != "GITHUB_TOKEN" {
		t.Errorf("EnvVarName: expected %q, got %q", "GITHUB_TOKEN", addRequest.EnvVarName)
	}
	if addRequest.SecretValue != "ghp_secret" {
		t.Errorf("SecretValue: expected %q, got %q", "ghp_secret", addRequest.SecretValue)
	}
	if !addRequest.ShouldAutoInject {
		t.Error("ShouldAutoInject should be true")
	}
}

// TestVaultStatus_JSON ensures VaultStatus serializes with the expected field names.
func TestVaultStatus_JSON(t *testing.T) {
	status := vault.VaultStatus{
		IsOpen:          true,
		EntryCount:      3,
		AutoInjectCount: 2,
		VaultPath:       "/home/user/.forge/vault/vault.enc",
	}

	encoded, err := json.Marshal(status)
	if err != nil {
		t.Fatalf("failed to marshal VaultStatus: %v", err)
	}

	encodedString := string(encoded)
	requiredFields := []string{"isOpen", "entryCount", "autoInjectCount", "vaultPath"}
	for _, field := range requiredFields {
		if !strings.Contains(encodedString, field) {
			t.Errorf("VaultStatus JSON missing expected field %q", field)
		}
	}
}
