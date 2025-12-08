package commands

import (
	"os"
	"path/filepath"
	"testing"
)

func TestStorage(t *testing.T) {
	// Create a temporary directory for testing
	tempDir, err := os.MkdirTemp("", "forge-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// Mock UserHomeDir
	originalHomeDir := UserHomeDir
	defer func() { UserHomeDir = originalHomeDir }()
	UserHomeDir = func() (string, error) {
		return tempDir, nil
	}

	// Test 1: LoadCommands should create default commands on first run
	commands, err := LoadCommands()
	if err != nil {
		t.Fatalf("LoadCommands failed: %v", err)
	}

	if len(commands) != 5 {
		t.Errorf("Expected 5 default commands, got %d", len(commands))
	}

	if commands[0].Command != "claude" {
		t.Errorf("Expected first command to be 'claude', got '%s'", commands[0].Command)
	}

	// Verify file exists
	configDir, _ := GetConfigDir()
	commandsPath := filepath.Join(configDir, "commands.json")
	if _, err := os.Stat(commandsPath); os.IsNotExist(err) {
		t.Errorf("commands.json was not created at %s", commandsPath)
	}

	// Test 2: SaveCommands should persist changes
	newCommand := Command{
		ID:          6,
		Description: "Test Command",
		Command:     "echo test",
		KeyBinding:  "Ctrl+Shift+6",
		PasteOnly:   false,
		Favorite:    false,
	}
	commands = append(commands, newCommand)

	if err := SaveCommands(commands); err != nil {
		t.Fatalf("SaveCommands failed: %v", err)
	}

	// Test 3: LoadCommands should load saved commands
	loadedCommands, err := LoadCommands()
	if err != nil {
		t.Fatalf("LoadCommands failed: %v", err)
	}

	if len(loadedCommands) != 6 {
		t.Errorf("Expected 6 commands, got %d", len(loadedCommands))
	}

	lastCmd := loadedCommands[5]
	if lastCmd.Description != "Test Command" {
		t.Errorf("Expected last command description 'Test Command', got '%s'", lastCmd.Description)
	}
}
