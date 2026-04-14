// dpapi_windows_test.go — Unit tests for Windows DPAPI key wrapping.
//
// Verifies that wrapKeyWithOSCredentials + unwrapKeyFromOSCredentials form a
// lossless round-trip on Windows. These tests are excluded from non-Windows
// builds via the build constraint on the source file.
//
//go:build windows

package vault

import (
	"bytes"
	"crypto/rand"
	"io"
	"testing"
)

// TestDPAPIWrapUnwrapRoundTrip verifies that a key protected with DPAPI
// can be fully recovered by unwrapping.
func TestDPAPIWrapUnwrapRoundTrip(t *testing.T) {
	originalKey := make([]byte, MasterKeyLengthBytes)
	if _, err := io.ReadFull(rand.Reader, originalKey); err != nil {
		t.Fatalf("failed to generate random key: %v", err)
	}

	wrappedKey, wrapErr := wrapKeyWithOSCredentials(originalKey)
	if wrapErr != nil {
		t.Fatalf("wrapKeyWithOSCredentials failed: %v", wrapErr)
	}
	if len(wrappedKey) == 0 {
		t.Fatal("wrapKeyWithOSCredentials returned empty result")
	}

	recoveredKey, unwrapErr := unwrapKeyFromOSCredentials(wrappedKey)
	if unwrapErr != nil {
		t.Fatalf("unwrapKeyFromOSCredentials failed: %v", unwrapErr)
	}

	if !bytes.Equal(originalKey, recoveredKey) {
		t.Error("recovered key does not match original key after DPAPI round-trip")
	}
}

// TestDPAPIWrappedKeyDiffersFromOriginal verifies that the wrapped key blob
// is not simply the raw key bytes — DPAPI must actually transform the data.
func TestDPAPIWrappedKeyDiffersFromOriginal(t *testing.T) {
	originalKey := make([]byte, MasterKeyLengthBytes)
	if _, err := io.ReadFull(rand.Reader, originalKey); err != nil {
		t.Fatalf("failed to generate random key: %v", err)
	}

	wrappedKey, wrapErr := wrapKeyWithOSCredentials(originalKey)
	if wrapErr != nil {
		t.Fatalf("wrapKeyWithOSCredentials failed: %v", wrapErr)
	}

	// On Windows, DPAPI must produce a blob that is different from (and larger
	// than) the raw key. If they are equal, wrapping is not happening.
	if bytes.Equal(originalKey, wrappedKey) {
		t.Error("DPAPI-wrapped key should not be identical to the original key bytes")
	}
}
