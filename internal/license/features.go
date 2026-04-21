// features.go manages Forge's subscription feature flags.
//
// Feature resolution order (highest priority wins):
//  1. Local override file at ~/.forge/feature-overrides.json — for dev and admin use.
//  2. license.Info.Features — the feature list returned by the license server.
//  3. Default: false — all paid features are disabled unless explicitly granted.
//
// The local override file intentionally cannot enable features that the license
// server has not granted. The server is always the authority for paid features;
// the override file is only useful for disabling a feature locally, or for
// testing on dev builds where no license server is reachable.
//
// NOTE: The license server does not yet return plan-based features. Until that
// work lands, the Forge settings UI writes to the override file as a stand-in.
// Operators should treat any locally-enabled feature as an MVP development aid.
package license

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"

	"github.com/mikejsmith1985/forge-terminal/internal/storage"
)

// ── Feature Constants ────────────────────────────────────────────────────────

const (
	// FeatureMobileAccess gates the Forge Companion mobile app.
	// When enabled, the /api/mobile/* endpoints accept mobile token requests
	// and the Forge settings UI displays the mobile connection link.
	FeatureMobileAccess = "mobile_access"

	// localFeatureOverridesFilename is the JSON file inside ~/.forge/ that holds
	// locally-set feature overrides.
	localFeatureOverridesFilename = "feature-overrides.json"
)

// ── Feature Resolution ───────────────────────────────────────────────────────

// HasFeature reports whether the named feature is currently enabled.
// If info is nil (no active license), only the local override file is consulted.
func HasFeature(info *Info, featureName string) bool {
	// The license server is the authoritative source for paid features.
	// Check it first so a cancelled subscription immediately disables the feature.
	if info != nil {
		for _, serverFeature := range info.Features {
			if serverFeature == featureName {
				return true
			}
		}
	}

	// Fall back to the local override file — useful for dev builds and for the
	// MVP period before the license server returns plan-based features.
	overrides, ok := loadLocalFeatureOverrides()
	if ok {
		return overrides[featureName]
	}

	return false
}

// SetLocalFeatureOverride persists a single feature flag to the local override
// file. This is the server-side mechanism behind POST /api/mobile/settings.
func SetLocalFeatureOverride(featureName string, isEnabled bool) error {
	overrides, _ := loadLocalFeatureOverrides()
	if overrides == nil {
		overrides = make(map[string]bool)
	}
	overrides[featureName] = isEnabled
	return saveLocalFeatureOverrides(overrides)
}

// ── Local Override File I/O ───────────────────────────────────────────────────

func localFeatureOverridesPath() string {
	return filepath.Join(storage.GetForgeDir(), localFeatureOverridesFilename)
}

// loadLocalFeatureOverrides reads the feature override JSON from disk.
// Returns nil, false when the file is absent (which is the normal case for
// users who have not customised any features).
func loadLocalFeatureOverrides() (map[string]bool, bool) {
	data, err := os.ReadFile(localFeatureOverridesPath())
	if err != nil {
		// A missing file is expected — not every user has local overrides.
		return nil, false
	}

	var overrides map[string]bool
	if err := json.Unmarshal(data, &overrides); err != nil {
		log.Printf("[License] Ignoring malformed feature-overrides.json: %v", err)
		return nil, false
	}

	return overrides, true
}

// saveLocalFeatureOverrides writes the override map to disk as indented JSON.
func saveLocalFeatureOverrides(overrides map[string]bool) error {
	forgeDir := storage.GetForgeDir()
	if err := os.MkdirAll(forgeDir, 0700); err != nil {
		return err
	}

	data, err := json.MarshalIndent(overrides, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(localFeatureOverridesPath(), data, 0600)
}
