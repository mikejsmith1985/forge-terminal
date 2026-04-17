//go:build windows

// dpapi_windows_test.go — tests for Windows DPAPI key wrapping.
//
// These tests run only on Windows and verify that the DPAPI wrap/unwrap
// roundtrip preserves the key bytes using real crypt32.dll syscalls.
package vault

import (
	"testing"
)

// TestDPAPIWrapUnwrapRoundtrip verifies that wrapping and then unwrapping a key
// on Windows via DPAPI produces the original key bytes.
func TestDPAPIWrapUnwrapRoundtrip(t *testing.T) {
	original := make([]byte, 32)
	for i := range original {
		original[i] = byte(i + 1)
	}

	wrapped, wrapErr := wrapKeyWithOSCredentials(original)
	if wrapErr != nil {
		t.Fatalf("wrapKeyWithOSCredentials failed: %v", wrapErr)
	}

	recovered, unwrapErr := unwrapKeyFromOSCredentials(wrapped)
	if unwrapErr != nil {
		t.Fatalf("unwrapKeyFromOSCredentials failed: %v", unwrapErr)
	}

	if len(recovered) != len(original) {
		t.Fatalf("length mismatch: got %d, want %d", len(recovered), len(original))
	}

	for i, b := range recovered {
		if b != original[i] {
			t.Errorf("byte %d mismatch: got %d, want %d", i, b, original[i])
		}
	}
}

// TestDPAPIWrappedOutputDiffersFromRaw verifies the wrapped bytes are NOT
// identical to the input key (DPAPI adds entropy).
func TestDPAPIWrappedOutputDiffersFromRaw(t *testing.T) {
	rawKey := make([]byte, 32)
	for i := range rawKey {
		rawKey[i] = byte(i + 42)
	}

	wrapped, wrapErr := wrapKeyWithOSCredentials(rawKey)
	if wrapErr != nil {
		t.Fatalf("wrapKeyWithOSCredentials failed: %v", wrapErr)
	}

	// DPAPI output must be longer than 32 bytes (includes header + entropy)
	if len(wrapped) <= 32 {
		t.Errorf("expected wrapped output > 32 bytes (DPAPI envelope), got %d", len(wrapped))
	}
}

