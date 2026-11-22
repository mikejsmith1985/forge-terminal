// features_test.go — proves optional features are switched on and off by the user's local setting alone.
package features

import (
	"testing"
)

// useEmptyForgeDir points the Forge data directory at an empty temp folder so
// each test starts with no saved feature settings.
func useEmptyForgeDir(t *testing.T) {
	t.Helper()
	emptyHome := t.TempDir()
	t.Setenv("HOME", emptyHome)
	t.Setenv("USERPROFILE", emptyHome)
}

// TestIsEnabled_OffByDefault confirms an optional feature starts switched off
// until the user turns it on.
func TestIsEnabled_OffByDefault(t *testing.T) {
	useEmptyForgeDir(t)

	if IsEnabled(MobileAccess) {
		t.Error("expected mobile access to be off when the user has never enabled it")
	}
}

// TestSetEnabled_RoundTrip confirms the user's choice is saved and read back,
// with no license involved.
func TestSetEnabled_RoundTrip(t *testing.T) {
	useEmptyForgeDir(t)

	if err := SetEnabled(MobileAccess, true); err != nil {
		t.Fatalf("enabling mobile access: %v", err)
	}
	if !IsEnabled(MobileAccess) {
		t.Error("expected mobile access to be on after the user enabled it")
	}

	if err := SetEnabled(MobileAccess, false); err != nil {
		t.Fatalf("disabling mobile access: %v", err)
	}
	if IsEnabled(MobileAccess) {
		t.Error("expected mobile access to be off after the user disabled it")
	}
}
