//go:build !windows

package tunnel

import "testing"

// hardenWindowsACL is a no-op on non-Windows platforms; this test
// simply asserts it returns nil so callers don't propagate spurious
// errors. The matching Windows variant lives in creds_windows_test.go.
func TestHardenWindowsACL_NoopOnPOSIX(t *testing.T) {
	if err := hardenWindowsACL(t.TempDir()); err != nil {
		t.Fatalf("hardenWindowsACL on non-windows should be nil, got %v", err)
	}
}
