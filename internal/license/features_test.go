// features_test.go tests the feature flag resolution logic in features.go.
package license

import (
	"os"
	"path/filepath"
	"testing"
)

// setupTempForgeDir creates a temporary directory and sets it as the forge dir
// for the duration of the test, restoring the original value when done.
func setupTempForgeDir(t *testing.T) string {
	t.Helper()
	temporaryDir := t.TempDir()

	originalHome := os.Getenv("HOME")
	// Override HOME so storage.GetForgeDir() points to our temp dir.
	// The forge dir is $HOME/.forge, so we create .forge inside the temp dir.
	forgeDir := filepath.Join(temporaryDir, ".forge")
	if err := os.MkdirAll(forgeDir, 0700); err != nil {
		t.Fatalf("creating temp forge dir: %v", err)
	}

	t.Setenv("HOME", temporaryDir)
	t.Cleanup(func() {
		os.Setenv("HOME", originalHome)
	})

	return temporaryDir
}

// TestHasFeature_DefaultDisabled confirms that a feature is off when
// neither the license info nor any local override enables it.
func TestHasFeature_DefaultDisabled(t *testing.T) {
	setupTempForgeDir(t)

	isEnabled := HasFeature(nil, FeatureMobileAccess)
	if isEnabled {
		t.Error("expected mobile_access to be disabled when no license info and no overrides exist")
	}
}

// TestHasFeature_LicenseServerEnables confirms that a feature granted by
// the license server (via Info.Features) is reported as enabled.
func TestHasFeature_LicenseServerEnables(t *testing.T) {
	setupTempForgeDir(t)

	licenseInfo := &Info{
		Features: []string{FeatureMobileAccess},
	}

	isEnabled := HasFeature(licenseInfo, FeatureMobileAccess)
	if !isEnabled {
		t.Error("expected mobile_access to be enabled when license server grants it")
	}
}

// TestHasFeature_LocalOverrideEnables confirms that writing a local override
// enables the feature even when no license server info is present.
func TestHasFeature_LocalOverrideEnables(t *testing.T) {
	setupTempForgeDir(t)

	if err := SetLocalFeatureOverride(FeatureMobileAccess, true); err != nil {
		t.Fatalf("SetLocalFeatureOverride: %v", err)
	}

	isEnabled := HasFeature(nil, FeatureMobileAccess)
	if !isEnabled {
		t.Error("expected mobile_access to be enabled via local override")
	}
}

// TestHasFeature_LocalOverrideDisables confirms that a local override of false
// disables the feature even when the license server grants it.
func TestHasFeature_LocalOverrideDisables(t *testing.T) {
	setupTempForgeDir(t)

	// The license server grants the feature.
	licenseInfo := &Info{
		Features: []string{FeatureMobileAccess},
	}

	// But we locally set it to false.
	if err := SetLocalFeatureOverride(FeatureMobileAccess, false); err != nil {
		t.Fatalf("SetLocalFeatureOverride: %v", err)
	}

	// The license server wins — local override can only GRANT during MVP phase
	// (the server takes priority). If the server grants it, it's on.
	isEnabled := HasFeature(licenseInfo, FeatureMobileAccess)
	if !isEnabled {
		t.Error("license server grant should win over local override=false")
	}
}

// TestSetLocalFeatureOverride_Roundtrip confirms enable/disable persists correctly.
func TestSetLocalFeatureOverride_Roundtrip(t *testing.T) {
	setupTempForgeDir(t)

	if err := SetLocalFeatureOverride(FeatureMobileAccess, true); err != nil {
		t.Fatalf("enabling: %v", err)
	}

	if !HasFeature(nil, FeatureMobileAccess) {
		t.Error("feature should be enabled after SetLocalFeatureOverride(true)")
	}

	if err := SetLocalFeatureOverride(FeatureMobileAccess, false); err != nil {
		t.Fatalf("disabling: %v", err)
	}

	if HasFeature(nil, FeatureMobileAccess) {
		t.Error("feature should be disabled after SetLocalFeatureOverride(false)")
	}
}
