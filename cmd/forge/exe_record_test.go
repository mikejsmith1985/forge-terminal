// exe_record_test.go — proves Forge leaves a findable record of its own binary path.
package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRecordExecutablePathWritesAbsolutePath(t *testing.T) {
	forgeDir := t.TempDir()
	executablePath := filepath.Join(forgeDir, "bin", "fterm.exe")

	if recordErr := recordExecutablePath(forgeDir, executablePath); recordErr != nil {
		t.Fatalf("recordExecutablePath returned error: %v", recordErr)
	}

	recorded, readErr := os.ReadFile(filepath.Join(forgeDir, executableRecordFilename))
	if readErr != nil {
		t.Fatalf("record file not written: %v", readErr)
	}
	if strings.TrimSpace(string(recorded)) != executablePath {
		t.Fatalf("recorded %q, want %q", recorded, executablePath)
	}
}

func TestRecordExecutablePathOverwritesStaleRecord(t *testing.T) {
	forgeDir := t.TempDir()
	recordPath := filepath.Join(forgeDir, executableRecordFilename)
	if writeErr := os.WriteFile(recordPath, []byte("C:\\old\\fterm.exe\n"), 0644); writeErr != nil {
		t.Fatal(writeErr)
	}
	newPath := filepath.Join(forgeDir, "new", "fterm.exe")

	if recordErr := recordExecutablePath(forgeDir, newPath); recordErr != nil {
		t.Fatalf("recordExecutablePath returned error: %v", recordErr)
	}

	recorded, _ := os.ReadFile(recordPath)
	if strings.TrimSpace(string(recorded)) != newPath {
		t.Fatalf("stale record not replaced: got %q", recorded)
	}
}

func TestRecordExecutablePathRejectsEmptyPath(t *testing.T) {
	if recordErr := recordExecutablePath(t.TempDir(), ""); recordErr == nil {
		t.Fatal("expected an error for an empty executable path")
	}
}
