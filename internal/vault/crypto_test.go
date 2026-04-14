// crypto_test.go — Unit tests for AES-256-GCM vault encryption.
//
// Verifies the encrypt/decrypt round-trip, that different nonces produce
// different ciphertext, and that tampered ciphertext is rejected.
package vault

import (
	"bytes"
	"crypto/rand"
	"io"
	"testing"
	"time"
)

// generateTestMasterKey creates a random 32-byte key suitable for test use.
func generateTestMasterKey(t *testing.T) []byte {
	t.Helper()
	masterKey := make([]byte, MasterKeyLengthBytes)
	if _, err := io.ReadFull(rand.Reader, masterKey); err != nil {
		t.Fatalf("failed to generate test master key: %v", err)
	}
	return masterKey
}

// buildTestDiskContents creates a diskContents value populated with sample entries.
func buildTestDiskContents() *diskContents {
	createdAt := time.Date(2024, 6, 1, 10, 0, 0, 0, time.UTC)
	return &diskContents{
		Version: CurrentVaultFileVersion,
		Entries: []diskEntry{
			{
				ID:               "entry-aaa",
				SecretName:       "Test Key",
				EnvVarName:       "TEST_KEY",
				SecretValue:      "super-secret-value",
				ShouldAutoInject: true,
				CreatedAt:        createdAt,
			},
		},
	}
}

// TestEncryptDecryptRoundTrip verifies that encrypt followed by decrypt
// produces the original plaintext contents.
func TestEncryptDecryptRoundTrip(t *testing.T) {
	masterKey := generateTestMasterKey(t)
	originalContents := buildTestDiskContents()

	encryptedBlob, encryptErr := encryptVaultContents(originalContents, masterKey)
	if encryptErr != nil {
		t.Fatalf("encryptVaultContents failed: %v", encryptErr)
	}
	if len(encryptedBlob) == 0 {
		t.Fatal("encryptVaultContents returned empty blob")
	}

	decryptedContents, decryptErr := decryptVaultContents(encryptedBlob, masterKey)
	if decryptErr != nil {
		t.Fatalf("decryptVaultContents failed: %v", decryptErr)
	}

	if decryptedContents.Version != originalContents.Version {
		t.Errorf("version mismatch: expected %d, got %d", originalContents.Version, decryptedContents.Version)
	}
	if len(decryptedContents.Entries) != len(originalContents.Entries) {
		t.Fatalf("entry count mismatch: expected %d, got %d", len(originalContents.Entries), len(decryptedContents.Entries))
	}

	recoveredEntry := decryptedContents.Entries[0]
	originalEntry := originalContents.Entries[0]
	if recoveredEntry.SecretValue != originalEntry.SecretValue {
		t.Errorf("SecretValue mismatch: expected %q, got %q", originalEntry.SecretValue, recoveredEntry.SecretValue)
	}
	if recoveredEntry.EnvVarName != originalEntry.EnvVarName {
		t.Errorf("EnvVarName mismatch: expected %q, got %q", originalEntry.EnvVarName, recoveredEntry.EnvVarName)
	}
}

// TestEncryptProducesUniqueNonces verifies that two encryptions of the same
// plaintext produce different ciphertext blobs (fresh nonce on each write).
func TestEncryptProducesUniqueNonces(t *testing.T) {
	masterKey := generateTestMasterKey(t)
	contents := buildTestDiskContents()

	firstBlob, err1 := encryptVaultContents(contents, masterKey)
	if err1 != nil {
		t.Fatalf("first encryption failed: %v", err1)
	}

	secondBlob, err2 := encryptVaultContents(contents, masterKey)
	if err2 != nil {
		t.Fatalf("second encryption failed: %v", err2)
	}

	if bytes.Equal(firstBlob, secondBlob) {
		t.Error("two encryptions of the same content produced identical blobs — nonces must be random")
	}
}

// TestDecryptRejectsWrongKey verifies that decryption fails when the wrong
// master key is used, protecting against cross-user key reuse.
func TestDecryptRejectsWrongKey(t *testing.T) {
	correctKey := generateTestMasterKey(t)
	wrongKey := generateTestMasterKey(t)
	contents := buildTestDiskContents()

	encryptedBlob, encryptErr := encryptVaultContents(contents, correctKey)
	if encryptErr != nil {
		t.Fatalf("encryption failed: %v", encryptErr)
	}

	_, decryptErr := decryptVaultContents(encryptedBlob, wrongKey)
	if decryptErr == nil {
		t.Error("decryption should have failed with wrong key but succeeded")
	}
}

// TestDecryptRejectsTamperedCiphertext verifies AES-GCM authentication tag
// detection — any modification to the ciphertext must cause decryption to fail.
func TestDecryptRejectsTamperedCiphertext(t *testing.T) {
	masterKey := generateTestMasterKey(t)
	contents := buildTestDiskContents()

	encryptedBlob, encryptErr := encryptVaultContents(contents, masterKey)
	if encryptErr != nil {
		t.Fatalf("encryption failed: %v", encryptErr)
	}

	// Flip a byte in the middle of the ciphertext to simulate tampering.
	tamperedBlob := make([]byte, len(encryptedBlob))
	copy(tamperedBlob, encryptedBlob)
	tamperedBlob[len(tamperedBlob)/2] ^= 0xFF

	_, decryptErr := decryptVaultContents(tamperedBlob, masterKey)
	if decryptErr == nil {
		t.Error("decryption should have failed with tampered ciphertext but succeeded")
	}
}

// TestDecryptRejectsTooShortBlob ensures we guard against malformed blobs
// that are too short to contain a valid nonce.
func TestDecryptRejectsTooShortBlob(t *testing.T) {
	masterKey := generateTestMasterKey(t)
	tooShortBlob := []byte("short")

	_, decryptErr := decryptVaultContents(tooShortBlob, masterKey)
	if decryptErr == nil {
		t.Error("decryption should have failed for blob shorter than nonce length")
	}
}
