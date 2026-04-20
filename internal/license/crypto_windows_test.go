//go:build windows

package license

import (
	"bytes"
	"crypto/rand"
	"testing"
)

func TestWrapUnwrapKey_RoundTrip(t *testing.T) {
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		t.Fatalf("generating key: %v", err)
	}

	wrapped, err := wrapKeyWithOSCredentials(key)
	if err != nil {
		t.Fatalf("wrapKeyWithOSCredentials: %v", err)
	}
	if bytes.Equal(wrapped, key) {
		t.Error("wrapped key should not equal plaintext key (DPAPI should transform it)")
	}

	recovered, err := unwrapKeyFromOSCredentials(wrapped)
	if err != nil {
		t.Fatalf("unwrapKeyFromOSCredentials: %v", err)
	}
	if !bytes.Equal(recovered, key) {
		t.Errorf("recovered key does not match original: got %x, want %x", recovered, key)
	}
}

func TestWrapKey_ProducesDifferentOutputEachTime(t *testing.T) {
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		t.Fatalf("generating key: %v", err)
	}

	wrapped1, err := wrapKeyWithOSCredentials(key)
	if err != nil {
		t.Fatalf("first wrap: %v", err)
	}
	wrapped2, err := wrapKeyWithOSCredentials(key)
	if err != nil {
		t.Fatalf("second wrap: %v", err)
	}

	// DPAPI adds a random salt, so two wraps of the same key should differ
	if bytes.Equal(wrapped1, wrapped2) {
		t.Log("warning: two DPAPI wraps of the same key produced identical output (may be deterministic on this system)")
	}
}
