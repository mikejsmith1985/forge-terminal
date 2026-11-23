// Tests that an update explains itself in plain words when Forge's own program file has vanished.
package updater

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestResolveRunningBinaryPath_MissingFolderExplainsFix covers the case where the folder Forge
// was launched from is deleted or moved while it is still running.
func TestResolveRunningBinaryPath_MissingFolderExplainsFix(t *testing.T) {
	vanishedPath := filepath.Join(t.TempDir(), "Installers", "fterm.exe")

	_, err := resolveRunningBinaryPath(vanishedPath)
	if err == nil {
		t.Fatal("expected an error for a program file that no longer exists")
	}

	message := err.Error()
	for _, expectedText := range []string{vanishedPath, "moved or deleted", "download", "/releases/latest"} {
		if !strings.Contains(message, expectedText) {
			t.Errorf("error message %q is missing %q", message, expectedText)
		}
	}
	if strings.Contains(message, "GetFileAttributesEx") {
		t.Errorf("error message still shows the raw Windows error: %q", message)
	}
}

// TestResolveRunningBinaryPath_ExistingFileResolves confirms a normal install is unaffected.
func TestResolveRunningBinaryPath_ExistingFileResolves(t *testing.T) {
	existingPath := filepath.Join(t.TempDir(), "fterm.exe")
	if err := os.WriteFile(existingPath, []byte("binary"), 0o600); err != nil {
		t.Fatal(err)
	}

	resolvedPath, err := resolveRunningBinaryPath(existingPath)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.EqualFold(filepath.Base(resolvedPath), "fterm.exe") {
		t.Errorf("resolved to %q, want a path ending in fterm.exe", resolvedPath)
	}
}
