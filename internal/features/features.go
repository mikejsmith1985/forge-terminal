// Package features stores which optional Forge features the user has switched on.
//
// These used to be paid add-ons granted by a license server. Forge no longer
// requires a license, so the user's own saved choice is now the only source of
// truth. Choices live in ~/.forge/feature-overrides.json. The file name is kept
// so that settings saved by earlier versions carry over unchanged.
package features

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"

	"github.com/mikejsmith1985/forge-terminal/internal/storage"
)

// MobileAccess switches on the Forge Companion phone app. When it is on, the
// /api/mobile/* endpoints accept the companion's token and the sidebar shows
// the QR code for connecting a phone.
const MobileAccess = "mobile_access"

// settingsFilename is the JSON file inside ~/.forge/ that holds the choices.
const settingsFilename = "feature-overrides.json"

// IsEnabled reports whether the user has switched the named feature on.
// Every optional feature is off until the user turns it on.
func IsEnabled(featureName string) bool {
	savedChoices, wasLoaded := loadSavedChoices()
	if !wasLoaded {
		return false
	}
	return savedChoices[featureName]
}

// SetEnabled saves the user's on/off choice for one feature. It backs
// POST /api/mobile/settings, the switch in the Forge Companion sidebar card.
func SetEnabled(featureName string, isEnabled bool) error {
	savedChoices, _ := loadSavedChoices()
	if savedChoices == nil {
		savedChoices = make(map[string]bool)
	}
	savedChoices[featureName] = isEnabled
	return writeSavedChoices(savedChoices)
}

// settingsPath returns where the feature choices are stored.
func settingsPath() string {
	return filepath.Join(storage.GetForgeDir(), settingsFilename)
}

// loadSavedChoices reads the saved choices. It returns false when the file is
// absent, which is normal for a user who has never changed a feature.
func loadSavedChoices() (map[string]bool, bool) {
	fileContents, err := os.ReadFile(settingsPath())
	if err != nil {
		return nil, false
	}

	var savedChoices map[string]bool
	if err := json.Unmarshal(fileContents, &savedChoices); err != nil {
		log.Printf("[Features] Ignoring malformed %s: %v", settingsFilename, err)
		return nil, false
	}
	return savedChoices, true
}

// writeSavedChoices writes the choices to disk as indented JSON, readable only by this user.
func writeSavedChoices(savedChoices map[string]bool) error {
	if err := os.MkdirAll(storage.GetForgeDir(), 0700); err != nil {
		return err
	}
	fileContents, err := json.MarshalIndent(savedChoices, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(settingsPath(), fileContents, 0600)
}
