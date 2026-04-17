//go:build !windows

// dpapi_other_test.go — tests for the non-Windows OS credential stubs.
package vault

import (
	"bytes"
	"testing"
)

// TestWrapUnwrapRoundtripUnix verifies that on non-Windows platforms,
// wrapKeyWithOSCredentials and unwrapKeyFromOSCredentials are identity
// operations — the key is stored as-is.
func TestWrapUnwrapRoundtripUnix(t *testing.T) {
	original := make([]byte, 32)
	for i := range original {
		original[i] = byte(i + 10)
	}

	// On non-Windows, wrapKeyWithOSCredentials is a no-op pass-through
	wrapped, wrapErr := wrapKeyWithOSCredentials(original)
	if wrapErr != nil {
		t.Fatalf("wrapKeyWithOSCredentials failed: %v", wrapErr)
	}

	recovered, unwrapErr := unwrapKeyFromOSCredentials(wrapped)
	if unwrapErr != nil {
		t.Fatalf("unwrapKeyFromOSCredentials failed: %v", unwrapErr)
	}

	if !bytes.Equal(recovered, original) {
		t.Errorf("roundtrip mismatch: got %v, want %v", recovered, original)
	}
}
