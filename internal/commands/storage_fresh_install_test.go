// storage_fresh_install_test.go — proves command storage works on a machine that has never run Forge.
package commands

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime/debug"
	"testing"

	"github.com/mikejsmith1985/forge-terminal/internal/storage"
)

// testMaxStackBytes caps the goroutine stack so a load/save recursion regression
// fails in milliseconds instead of exhausting 1 GB of memory first.
const testMaxStackBytes = 8 * 1024 * 1024

// useEmptyHomeDir points the Forge data directory at a fresh, empty temp folder,
// simulating a first launch on a brand-new PC.
func useEmptyHomeDir(t *testing.T) {
	t.Helper()
	emptyHome := t.TempDir()
	t.Setenv("USERPROFILE", emptyHome)
	t.Setenv("HOME", emptyHome)
	previousMaxStack := debug.SetMaxStack(testMaxStackBytes)
	t.Cleanup(func() { debug.SetMaxStack(previousMaxStack) })
}

// readCommandsFile parses the commands file currently on disk.
func readCommandsFile(t *testing.T) []Command {
	t.Helper()
	fileContents, readErr := os.ReadFile(storage.GetCommandsPath())
	if readErr != nil {
		t.Fatalf("commands file was not written: %v", readErr)
	}
	var savedCommands []Command
	if parseErr := json.Unmarshal(fileContents, &savedCommands); parseErr != nil {
		t.Fatalf("commands file is not valid JSON: %v", parseErr)
	}
	return savedCommands
}

// TestLoadCommands_FreshInstallCreatesDefaults is the field defect: on a PC with
// no commands.json, LoadCommands and SaveCommands called each other forever and
// the process died silently at startup.
func TestLoadCommands_FreshInstallCreatesDefaults(t *testing.T) {
	useEmptyHomeDir(t)

	loadedCommands, loadErr := LoadCommands()
	if loadErr != nil {
		t.Fatalf("LoadCommands on a fresh install failed: %v", loadErr)
	}
	if len(loadedCommands) != len(DefaultCommands) {
		t.Fatalf("expected %d default commands, got %d", len(DefaultCommands), len(loadedCommands))
	}
	if savedCount := len(readCommandsFile(t)); savedCount != len(DefaultCommands) {
		t.Fatalf("expected %d commands on disk, got %d", len(DefaultCommands), savedCount)
	}
	firstCardHistory := filepath.Join(storage.GetTerminalDir(), "card-history", "card-1.json")
	if _, statErr := os.Stat(firstCardHistory); statErr != nil {
		t.Fatalf("expected a first version history for each default card: %v", statErr)
	}
}

// TestLoadCommands_DeduplicatesSavedFile covers the second path into the same
// recursion: a saved file holding two cards with the same ID.
func TestLoadCommands_DeduplicatesSavedFile(t *testing.T) {
	useEmptyHomeDir(t)
	duplicatedCommands := []Command{
		{ID: 1, Description: "first copy", Command: "echo one"},
		{ID: 1, Description: "second copy", Command: "echo two"},
		{ID: 2, Description: "unique", Command: "echo three"},
	}
	writeCommandsFile(t, duplicatedCommands)

	loadedCommands, loadErr := LoadCommands()
	if loadErr != nil {
		t.Fatalf("LoadCommands with duplicates failed: %v", loadErr)
	}
	if len(loadedCommands) != 2 || loadedCommands[0].Description != "first copy" {
		t.Fatalf("expected the first copy of each ID to be kept, got %+v", loadedCommands)
	}
	if savedCount := len(readCommandsFile(t)); savedCount != 2 {
		t.Fatalf("expected the cleaned file on disk to hold 2 commands, got %d", savedCount)
	}
}

// TestSaveCommands_SkipsVersionForUnchangedCard keeps the change-detection that
// SaveCommands' comparison read exists for: re-saving an identical card must
// not add a new history version.
func TestSaveCommands_SkipsVersionForUnchangedCard(t *testing.T) {
	useEmptyHomeDir(t)
	unchangedCommands := []Command{{ID: 9, Description: "stable", Command: "echo stable"}}

	if saveErr := SaveCommands(unchangedCommands); saveErr != nil {
		t.Fatalf("first save failed: %v", saveErr)
	}
	if saveErr := SaveCommands(unchangedCommands); saveErr != nil {
		t.Fatalf("second save failed: %v", saveErr)
	}

	cardHistory, historyErr := GetCardHistory(9)
	if historyErr != nil {
		t.Fatalf("reading card history failed: %v", historyErr)
	}
	if len(cardHistory.Versions) != 1 {
		t.Fatalf("expected 1 version for an unchanged card, got %d", len(cardHistory.Versions))
	}
}

// writeCommandsFile seeds the commands file directly, bypassing SaveCommands.
func writeCommandsFile(t *testing.T, commandsToWrite []Command) {
	t.Helper()
	if mkdirErr := os.MkdirAll(storage.GetTerminalDir(), 0700); mkdirErr != nil {
		t.Fatalf("creating terminal dir failed: %v", mkdirErr)
	}
	fileContents, marshalErr := json.Marshal(commandsToWrite)
	if marshalErr != nil {
		t.Fatalf("encoding seed commands failed: %v", marshalErr)
	}
	if writeErr := os.WriteFile(storage.GetCommandsPath(), fileContents, 0600); writeErr != nil {
		t.Fatalf("writing seed commands failed: %v", writeErr)
	}
}
