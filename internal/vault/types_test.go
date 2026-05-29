// types_test.go — unit tests for Forge Vault public types.
package vault

import (
	"encoding/json"
	"testing"
)

// TestVaultEntryJSONOmitsSecretValue verifies the VaultEntry struct never
// serializes a SecretValue field — the field is intentionally absent.
// This is a compile-time + runtime safety check.
func TestVaultEntryJSONOmitsSecretValue(t *testing.T) {
	entry := VaultEntry{
		ID:               "test-id",
		SecretName:       "My API Key",
		EnvVarName:       "MY_API_KEY",
		ShouldAutoInject: true,
	}

	jsonBytes, marshalErr := json.Marshal(entry)
	if marshalErr != nil {
		t.Fatalf("json.Marshal failed: %v", marshalErr)
	}

	var decoded map[string]interface{}
	if decodeErr := json.Unmarshal(jsonBytes, &decoded); decodeErr != nil {
		t.Fatalf("json.Unmarshal failed: %v", decodeErr)
	}

	// SecretValue must never appear in the JSON output
	if _, present := decoded["secretValue"]; present {
		t.Error("VaultEntry JSON must NOT contain 'secretValue' — security invariant violated")
	}
	if _, present := decoded["SecretValue"]; present {
		t.Error("VaultEntry JSON must NOT contain 'SecretValue' — security invariant violated")
	}

	// Core fields must be present
	if decoded["id"] != "test-id" {
		t.Errorf("expected id 'test-id', got %v", decoded["id"])
	}
}

// TestAddEntryRequestFields verifies the AddEntryRequest type is properly populated.
func TestAddEntryRequestFields(t *testing.T) {
	req := AddEntryRequest{
		SecretName:       "GitHub Token",
		EnvVarName:       "GITHUB_TOKEN",
		SecretValue:      "ghp_test123",
		URL:              "https://github.com/settings/tokens",
		BundleID:         "github-credential",
		BundleType:       "password",
		ShouldAutoInject: true,
	}

	if req.SecretName != "GitHub Token" {
		t.Errorf("unexpected SecretName: %q", req.SecretName)
	}
	if req.EnvVarName != "GITHUB_TOKEN" {
		t.Errorf("unexpected EnvVarName: %q", req.EnvVarName)
	}
	if req.SecretValue != "ghp_test123" {
		t.Errorf("unexpected SecretValue: %q", req.SecretValue)
	}
	if req.URL != "https://github.com/settings/tokens" {
		t.Errorf("unexpected URL: %q", req.URL)
	}
	if req.BundleID != "github-credential" {
		t.Errorf("unexpected BundleID: %q", req.BundleID)
	}
	if req.BundleType != "password" {
		t.Errorf("unexpected BundleType: %q", req.BundleType)
	}
	if !req.ShouldAutoInject {
		t.Error("expected ShouldAutoInject to be true")
	}
}

// TestVaultStatusFields verifies VaultStatus fields are accessible.
func TestVaultStatusFields(t *testing.T) {
	status := VaultStatus{
		IsOpen:          true,
		EntryCount:      5,
		AutoInjectCount: 2,
	}

	if !status.IsOpen {
		t.Error("expected IsOpen true")
	}
	if status.EntryCount != 5 {
		t.Errorf("expected 5 entries, got %d", status.EntryCount)
	}
	if status.AutoInjectCount != 2 {
		t.Errorf("expected 2 auto-inject, got %d", status.AutoInjectCount)
	}
}
