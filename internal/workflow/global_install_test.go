package workflow

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// fakeConstitution is a stand-in body used to prove the install/upsert logic
// without depending on the real template content.
const fakeConstitution = "# Global Constitution\n\nProcess protection: never wildcard-kill fterm.exe.\n"

// TestInstallGlobalConstitution_FreshHome proves a first-time install writes the
// master copy plus every supported CLI tool's global instructions file.
func TestInstallGlobalConstitution_FreshHome(t *testing.T) {
	homeDir := t.TempDir()

	result, err := InstallGlobalConstitution(homeDir, fakeConstitution)
	if err != nil {
		t.Fatalf("InstallGlobalConstitution() error: %v", err)
	}

	// Master copy under ~/.forge
	masterPath := filepath.Join(homeDir, ".forge", "constitution.md")
	masterBytes, err := os.ReadFile(masterPath)
	if err != nil {
		t.Fatalf("master constitution not written: %v", err)
	}
	if string(masterBytes) != fakeConstitution {
		t.Error("master constitution content does not match input")
	}

	// Each CLI tool's global file must exist, carry both markers, and embed the body.
	cliFiles := map[string]string{
		"claude":  filepath.Join(homeDir, ".claude", "CLAUDE.md"),
		"copilot": filepath.Join(homeDir, ".copilot", "copilot-instructions.md"),
		"gemini":  filepath.Join(homeDir, ".gemini", "GEMINI.md"),
	}
	for tool, path := range cliFiles {
		content, err := os.ReadFile(path)
		if err != nil {
			t.Errorf("%s global file not written: %v", tool, err)
			continue
		}
		text := string(content)
		if !strings.Contains(text, constitutionMarkerStart) || !strings.Contains(text, constitutionMarkerEnd) {
			t.Errorf("%s global file missing constitution markers", tool)
		}
		if !strings.Contains(text, "fterm.exe") {
			t.Errorf("%s global file missing constitution body", tool)
		}
	}

	if len(result.TargetsWritten) != len(cliFiles) {
		t.Errorf("expected %d targets written, got %d", len(cliFiles), len(result.TargetsWritten))
	}
}

// TestInstallGlobalConstitution_Idempotent proves re-installing does not stack
// duplicate marker blocks — the managed block is replaced, not appended.
func TestInstallGlobalConstitution_Idempotent(t *testing.T) {
	homeDir := t.TempDir()

	if _, err := InstallGlobalConstitution(homeDir, fakeConstitution); err != nil {
		t.Fatalf("first install error: %v", err)
	}
	if _, err := InstallGlobalConstitution(homeDir, fakeConstitution); err != nil {
		t.Fatalf("second install error: %v", err)
	}

	claudePath := filepath.Join(homeDir, ".claude", "CLAUDE.md")
	content, err := os.ReadFile(claudePath)
	if err != nil {
		t.Fatal(err)
	}
	if count := strings.Count(string(content), constitutionMarkerStart); count != 1 {
		t.Errorf("expected exactly 1 constitution block after re-install, found %d", count)
	}
}

// TestUpsertMarkerBlock_PreservesUserContent proves the user's own instructions
// outside the managed markers survive an update.
func TestUpsertMarkerBlock_PreservesUserContent(t *testing.T) {
	existing := "# My personal notes\n\n" +
		constitutionMarkerStart + "\nOLD BODY\n" + constitutionMarkerEnd +
		"\n\n# More personal notes\n"

	updated := upsertMarkerBlock(existing, "NEW BODY", constitutionMarkerStart, constitutionMarkerEnd)

	if !strings.Contains(updated, "# My personal notes") || !strings.Contains(updated, "# More personal notes") {
		t.Error("user content outside markers was lost")
	}
	if strings.Contains(updated, "OLD BODY") {
		t.Error("old managed body was not replaced")
	}
	if !strings.Contains(updated, "NEW BODY") {
		t.Error("new managed body was not inserted")
	}
	if count := strings.Count(updated, constitutionMarkerStart); count != 1 {
		t.Errorf("expected 1 marker block, found %d", count)
	}
}

// TestUpsertMarkerBlock_AppendsWhenAbsent proves the block is appended (not
// dropped) when the file has no existing markers.
func TestUpsertMarkerBlock_AppendsWhenAbsent(t *testing.T) {
	existing := "# Existing user instructions\n"

	updated := upsertMarkerBlock(existing, "BODY", constitutionMarkerStart, constitutionMarkerEnd)

	if !strings.Contains(updated, "# Existing user instructions") {
		t.Error("existing content was lost")
	}
	if !strings.Contains(updated, constitutionMarkerStart) || !strings.Contains(updated, "BODY") {
		t.Error("managed block was not appended")
	}
}
