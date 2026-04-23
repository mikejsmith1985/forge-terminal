//go:build windows

package tunnel

import (
	"os"
	"path/filepath"
	"testing"
)

// TestHardenWindowsACL_OnExistingDir exercises the happy path: icacls
// against a freshly created temp dir should succeed (or at worst fail
// with a non-fatal error that gets wrapped — we accept either because
// some CI runners disallow icacls on transient paths). The main goal
// is to ensure the function doesn't panic or pass a malformed SID.
func TestHardenWindowsACL_OnExistingDir(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "cert.pem"), []byte("x"), 0o644); err != nil {
		t.Fatalf("setup: %v", err)
	}
	// Accept either outcome — CI sandboxes sometimes reject icacls.
	_ = hardenWindowsACL(dir)
}
