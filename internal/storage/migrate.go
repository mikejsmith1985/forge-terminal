// Package storage provides centralized path management for Forge data.
package storage

import (
	"fmt"
	"log"
	"os"
)

// fileExists checks if a file or directory exists.
func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// MigrateToV2 migrates old flat structure to new organized structure.
// Old: ~/.forge/{config.json, commands.json, sessions/, .welcome-shown}
// New: ~/.forge/terminal/{config.json, commands.json, sessions/, .welcome-shown}
// This function is idempotent - safe to call multiple times.
func MigrateToV2() error {
	// Check if already migrated (terminal directory exists with config)
	if fileExists(GetTerminalConfigPath()) {
		log.Printf("[Storage] Already migrated to v2 structure")
		return nil
	}

	log.Printf("[Storage] Migrating to v2 directory structure...")

	// Ensure new directories exist
	dirs := []string{
		GetTerminalDir(),
		GetAssistantDir(),
		GetSessionsDir(),
	}
	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("failed to create directory %s: %w", dir, err)
		}
	}

	// Migrate files
	migrations := map[string]string{
		LegacyConfigPath():  GetTerminalConfigPath(),
		LegacyCommandsPath(): GetCommandsPath(),
		LegacyWelcomePath():  GetWelcomePath(),
	}

	for oldPath, newPath := range migrations {
		if fileExists(oldPath) {
			log.Printf("[Storage] Migrating %s -> %s", oldPath, newPath)
			if err := os.Rename(oldPath, newPath); err != nil {
				// Don't fail if migration fails - log and continue
				log.Printf("[Storage] Warning: failed to migrate %s: %v", oldPath, err)
			}
		}
	}

	// Migrate sessions directory
	oldSessions := LegacySessionsDir()
	newSessions := GetSessionsDir()
	if fileExists(oldSessions) && !fileExists(newSessions) {
		log.Printf("[Storage] Migrating sessions directory")
		if err := os.Rename(oldSessions, newSessions); err != nil {
			log.Printf("[Storage] Warning: failed to migrate sessions: %v", err)
		}
	}

	log.Printf("[Storage] Migration complete")
	return nil
}

// EnsureDirectories creates all necessary directories if they don't exist.
func EnsureDirectories() error {
	dirs := []string{
		GetForgeDir(),
		GetTerminalDir(),
		GetAssistantDir(),
		GetSessionsDir(),
		GetAMDir(),
	}

	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("failed to create directory %s: %w", dir, err)
		}
	}

	return nil
}

// CleanLegacyFiles removes old files after successful migration.
// Only call this if you're sure migration succeeded.
func CleanLegacyFiles() error {
	legacyFiles := []string{
		LegacyConfigPath(),
		LegacyCommandsPath(),
		LegacyWelcomePath(),
	}

	for _, path := range legacyFiles {
		if fileExists(path) {
			if err := os.Remove(path); err != nil {
				log.Printf("[Storage] Warning: failed to remove legacy file %s: %v", path, err)
			}
		}
	}

	// Remove legacy sessions directory if empty
	oldSessions := LegacySessionsDir()
	if fileExists(oldSessions) {
		if err := os.Remove(oldSessions); err != nil {
			// Might not be empty, that's okay
			log.Printf("[Storage] Legacy sessions directory not removed (might not be empty)")
		}
	}

	return nil
}

// GetCurrentStructure returns a string describing the current directory structure.
func GetCurrentStructure() string {
	if fileExists(GetTerminalConfigPath()) {
		return "v2 (migrated)"
	}
	if fileExists(LegacyConfigPath()) {
		return "v1 (legacy)"
	}
	return "new (no data)"
}
