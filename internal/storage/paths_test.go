package storage

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPaths(t *testing.T) {
	// Test that paths are constructed correctly
	forgeDir := GetForgeDir()
	if forgeDir == "" {
		t.Error("GetForgeDir should not return empty string")
	}

	terminalDir := GetTerminalDir()
	if !filepath.IsAbs(terminalDir) && terminalDir != filepath.Join(".forge", "terminal") {
		t.Error("GetTerminalDir should return absolute path or relative .forge/terminal")
	}

	assistantDir := GetAssistantDir()
	if !filepath.IsAbs(assistantDir) && assistantDir != filepath.Join(".forge", "assistant") {
		t.Error("GetAssistantDir should return absolute path or relative .forge/assistant")
	}

	// Test that terminal paths are under terminal directory
	configPath := GetTerminalConfigPath()
	if !contains(configPath, "terminal") {
		t.Error("Terminal config should be under terminal directory")
	}

	commandsPath := GetCommandsPath()
	if !contains(commandsPath, "terminal") {
		t.Error("Commands path should be under terminal directory")
	}

	sessionsDir := GetSessionsDir()
	if !contains(sessionsDir, "terminal") {
		t.Error("Sessions directory should be under terminal directory")
	}

	// Test that assistant paths are under assistant directory
	assistantConfig := GetAssistantConfigPath()
	if !contains(assistantConfig, "assistant") {
		t.Error("Assistant config should be under assistant directory")
	}

	modelsDir := GetModelsDir()
	if !contains(modelsDir, "assistant") {
		t.Error("Models directory should be under assistant directory")
	}

	// Test that AM directory is at root level
	amDir := GetAMDir()
	if !contains(amDir, filepath.Join(".forge", "am")) && !contains(amDir, filepath.Join("forge", "am")) {
		t.Error("AM directory should be at .forge/am")
	}
}

func TestLegacyPaths(t *testing.T) {
	// Test legacy paths for migration
	legacyConfig := LegacyConfigPath()
	if contains(legacyConfig, "terminal") || contains(legacyConfig, "assistant") {
		t.Error("Legacy config should not be under terminal or assistant directories")
	}

	legacyCommands := LegacyCommandsPath()
	if contains(legacyCommands, "terminal") || contains(legacyCommands, "assistant") {
		t.Error("Legacy commands should not be under terminal or assistant directories")
	}

	legacySessions := LegacySessionsDir()
	if contains(legacySessions, "terminal") || contains(legacySessions, "assistant") {
		t.Error("Legacy sessions should not be under terminal or assistant directories")
	}
}

func TestMigration(t *testing.T) {
	// Create temporary test directory
	tmpDir := t.TempDir()
	
	// Override home directory for testing
	oldHome := os.Getenv("HOME")
	os.Setenv("HOME", tmpDir)
	defer os.Setenv("HOME", oldHome)

	// Create legacy structure
	forgeDir := filepath.Join(tmpDir, ".forge")
	os.MkdirAll(forgeDir, 0755)
	
	legacyConfig := filepath.Join(forgeDir, "config.json")
	os.WriteFile(legacyConfig, []byte(`{"test":"data"}`), 0644)
	
	legacyCommands := filepath.Join(forgeDir, "commands.json")
	os.WriteFile(legacyCommands, []byte(`[]`), 0644)
	
	legacySessions := filepath.Join(forgeDir, "sessions")
	os.MkdirAll(legacySessions, 0755)
	os.WriteFile(filepath.Join(legacySessions, "test.json"), []byte(`{}`), 0644)

	// Verify legacy structure exists
	if !fileExists(legacyConfig) {
		t.Fatal("Failed to create legacy config")
	}

	// Run migration
	if err := MigrateToV2(); err != nil {
		t.Fatalf("Migration failed: %v", err)
	}

	// Verify new structure exists
	newConfig := filepath.Join(forgeDir, "terminal", "config.json")
	if !fileExists(newConfig) {
		t.Error("Config was not migrated to terminal directory")
	}

	newCommands := filepath.Join(forgeDir, "terminal", "commands.json")
	if !fileExists(newCommands) {
		t.Error("Commands were not migrated to terminal directory")
	}

	newSessions := filepath.Join(forgeDir, "terminal", "sessions")
	if !fileExists(newSessions) {
		t.Error("Sessions were not migrated to terminal directory")
	}

	// Verify content preserved
	content, _ := os.ReadFile(newConfig)
	if string(content) != `{"test":"data"}` {
		t.Error("Config content was not preserved during migration")
	}

	// Test idempotency - run migration again
	if err := MigrateToV2(); err != nil {
		t.Fatalf("Second migration failed: %v", err)
	}

	// Verify files still exist and weren't corrupted
	if !fileExists(newConfig) {
		t.Error("Config disappeared after second migration")
	}
}

func TestEnsureDirectories(t *testing.T) {
	tmpDir := t.TempDir()
	oldHome := os.Getenv("HOME")
	os.Setenv("HOME", tmpDir)
	defer os.Setenv("HOME", oldHome)

	if err := EnsureDirectories(); err != nil {
		t.Fatalf("EnsureDirectories failed: %v", err)
	}

	// Check all directories exist
	dirs := []string{
		GetForgeDir(),
		GetTerminalDir(),
		GetAssistantDir(),
		GetSessionsDir(),
		GetAMDir(),
	}

	for _, dir := range dirs {
		if !fileExists(dir) {
			t.Errorf("Directory %s was not created", dir)
		}
	}
}

func TestGetCurrentStructure(t *testing.T) {
	tmpDir := t.TempDir()
	oldHome := os.Getenv("HOME")
	os.Setenv("HOME", tmpDir)
	defer os.Setenv("HOME", oldHome)

	// Should be "new" initially
	structure := GetCurrentStructure()
	if structure != "new (no data)" {
		t.Errorf("Expected 'new (no data)', got '%s'", structure)
	}

	// Create legacy structure
	forgeDir := filepath.Join(tmpDir, ".forge")
	os.MkdirAll(forgeDir, 0755)
	os.WriteFile(filepath.Join(forgeDir, "config.json"), []byte(`{}`), 0644)

	structure = GetCurrentStructure()
	if structure != "v1 (legacy)" {
		t.Errorf("Expected 'v1 (legacy)', got '%s'", structure)
	}

	// Migrate
	MigrateToV2()

	structure = GetCurrentStructure()
	if structure != "v2 (migrated)" {
		t.Errorf("Expected 'v2 (migrated)', got '%s'", structure)
	}
}

// Helper function
func contains(s, substr string) bool {
	return strings.Contains(s, substr)
}
