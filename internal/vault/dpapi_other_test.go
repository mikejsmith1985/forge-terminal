// dpapi_other_test.go — Unit tests for Unix vault key protection (no-op wrapping).
//
// On non-Windows platforms, key wrapping is a no-op and security relies on
// 0600 file permissions. These tests verify that behavior.
//
//go:build !windows

package vault

import (
	"bytes"
	"crypto/rand"
	"io"
	"testing"
)

// TestUnixWrapIsNoOp verifies that wrapKeyWithOSCredentials on non-Windows
// platforms returns the exact input bytes unchanged.
func TestUnixWrapIsNoOp(t *testing.T) {
	originalKey := make([]byte, MasterKeyLengthBytes)
	if _, err := io.ReadFull(rand.Reader, originalKey); err != nil {
		t.Fatalf("failed to generate random key: %v", err)
	}

	wrappedKey, wrapErr := wrapKeyWithOSCredentials(originalKey)
	if wrapErr != nil {
		t.Fatalf("wrapKeyWithOSCredentials failed: %v", wrapErr)
	}

	if !bytes.Equal(originalKey, wrappedKey) {
		t.Error("on non-Windows, wrapKeyWithOSCredentials should return the original bytes unchanged")
	}
}

// TestUnixUnwrapIsNoOp verifies that unwrapKeyFromOSCredentials on non-Windows
// platforms returns the exact input bytes unchanged.
func TestUnixUnwrapIsNoOp(t *testing.T) {
	originalKey := make([]byte, MasterKeyLengthBytes)
	if _, err := io.ReadFull(rand.Reader, originalKey); err != nil {
		t.Fatalf("failed to generate random key: %v", err)
	}

	recoveredKey, unwrapErr := unwrapKeyFromOSCredentials(originalKey)
	if unwrapErr != nil {
		t.Fatalf("unwrapKeyFromOSCredentials failed: %v", unwrapErr)
	}

	if !bytes.Equal(originalKey, recoveredKey) {
		t.Error("on non-Windows, unwrapKeyFromOSCredentials should return the original bytes unchanged")
	}
}
