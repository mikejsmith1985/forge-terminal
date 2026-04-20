//go:build !windows

package license

import (
	"bytes"
	"crypto/rand"
	"os"
	"testing"
)

// On non-Windows, wrapKeyWithOSCredentials is a passthrough.
// Security is enforced via 0600 file permissions on the key file.

func TestWrapUnwrapKey_Passthrough(t *testing.T) {
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		t.Fatalf("generating key: %v", err)
	}

	wrapped, err := wrapKeyWithOSCredentials(key)
	if err != nil {
		t.Fatalf("wrapKeyWithOSCredentials: %v", err)
	}
	if !bytes.Equal(wrapped, key) {
		t.Error("Unix wrap should be a passthrough — wrapped != original")
	}

	recovered, err := unwrapKeyFromOSCredentials(wrapped)
	if err != nil {
		t.Fatalf("unwrapKeyFromOSCredentials: %v", err)
	}
	if !bytes.Equal(recovered, key) {
		t.Error("Unix unwrap should be a passthrough — recovered != original")
	}
}

func TestEnforceKeyFilePermissions(t *testing.T) {
	keyFile := t.TempDir() + "/license.key"
	if err := os.WriteFile(keyFile, []byte("test"), 0644); err != nil {
		t.Fatalf("creating test file: %v", err)
	}

	if err := enforceKeyFilePermissions(keyFile); err != nil {
		t.Fatalf("enforceKeyFilePermissions: %v", err)
	}

	fi, err := os.Stat(keyFile)
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	if perm := fi.Mode().Perm(); perm != 0600 {
		t.Errorf("file permissions = %o, want 0600", perm)
	}
}
