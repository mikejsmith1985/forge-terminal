// crypto_test.go — unit tests for Forge Vault AES-256-GCM crypto layer.
//
// Core encrypt/decrypt roundtrip tests live in vault_test.go alongside
// the integration tests that exercise the full vault lifecycle. This file
// adds focused unit tests for the lower-level crypto helpers.
package vault

import (
	"bytes"
	"encoding/json"
	"testing"
)

// TestEncryptVaultContentsRoundtrip verifies that encrypting and then decrypting
// a diskContents struct with the same key produces identical data.
func TestEncryptVaultContentsRoundtrip(t *testing.T) {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i + 1)
	}

	original := &diskContents{
		Version: 1,
		Entries: []diskEntry{
			{
				ID:               "abc-123",
				SecretName:       "Test Key",
				EnvVarName:       "TEST_KEY",
				SecretValue:      "super-secret-value",
				ShouldAutoInject: true,
			},
		},
	}

	ciphertext, encErr := encryptVaultContents(original, key)
	if encErr != nil {
		t.Fatalf("encryptVaultContents failed: %v", encErr)
	}

	recovered, decErr := decryptVaultContents(ciphertext, key)
	if decErr != nil {
		t.Fatalf("decryptVaultContents failed: %v", decErr)
	}

	if len(recovered.Entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(recovered.Entries))
	}
	if recovered.Entries[0].SecretValue != "super-secret-value" {
		t.Errorf("secret value mismatch: got %q", recovered.Entries[0].SecretValue)
	}
}

// TestEncryptVaultContentsProducesUniqueOutput verifies fresh nonce per call.
func TestEncryptVaultContentsProducesUniqueOutput(t *testing.T) {
	key := make([]byte, 32)
	contents := &diskContents{Version: 1, Entries: []diskEntry{}}

	ct1, err1 := encryptVaultContents(contents, key)
	if err1 != nil {
		t.Fatalf("first encrypt failed: %v", err1)
	}

	ct2, err2 := encryptVaultContents(contents, key)
	if err2 != nil {
		t.Fatalf("second encrypt failed: %v", err2)
	}

	if bytes.Equal(ct1, ct2) {
		t.Error("two encryptions of the same contents must NOT produce identical ciphertext (nonce must be random)")
	}
}

// TestDecryptVaultContentsRejectsWrongKey verifies GCM auth tag fails on wrong key.
func TestDecryptVaultContentsRejectsWrongKey(t *testing.T) {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i + 1)
	}
	wrongKey := make([]byte, 32)

	ciphertext, encErr := encryptVaultContents(&diskContents{Version: 1, Entries: nil}, key)
	if encErr != nil {
		t.Fatalf("encrypt failed: %v", encErr)
	}

	_, decErr := decryptVaultContents(ciphertext, wrongKey)
	if decErr == nil {
		t.Error("decrypt with wrong key must return an error — GCM auth tag validation must fail")
	}
}

// TestClearSensitiveBytes verifies that clearSensitiveBytes zeroes the slice.
func TestClearSensitiveBytes(t *testing.T) {
	sensitive := []byte{1, 2, 3, 4, 5}
	clearSensitiveBytes(sensitive)

	for i, b := range sensitive {
		if b != 0 {
			t.Errorf("expected byte %d to be 0 after clearing, got %d", i, b)
		}
	}
}

// TestEncryptedOutputNeverContainsPlaintext is a JSON-inspection sanity check:
// the ciphertext blob returned by encryptVaultContents must not contain the
// raw secret value as a UTF-8 string.
func TestEncryptedOutputNeverContainsPlaintext(t *testing.T) {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i + 7)
	}

	const secretValue = "never_appear_in_ciphertext_xyz789"
	contents := &diskContents{
		Version: 1,
		Entries: []diskEntry{
			{ID: "x", SecretName: "n", EnvVarName: "N", SecretValue: secretValue, ShouldAutoInject: false},
		},
	}

	ciphertext, encErr := encryptVaultContents(contents, key)
	if encErr != nil {
		t.Fatalf("encrypt failed: %v", encErr)
	}

	// Neither the raw bytes nor a JSON encoding should appear in the ciphertext
	if bytes.Contains(ciphertext, []byte(secretValue)) {
		t.Error("SECURITY VIOLATION: ciphertext must not contain plaintext secret value")
	}

	jsonEncoded, _ := json.Marshal(secretValue)
	if bytes.Contains(ciphertext, jsonEncoded) {
		t.Error("SECURITY VIOLATION: ciphertext must not contain JSON-encoded secret value")
	}
}

