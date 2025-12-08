// Package storage provides centralized path management for Forge data.
package storage

import (
	"os"
	"path/filepath"
)

// GetForgeDir returns the root Forge data directory.
func GetForgeDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ".forge"
	}
	return filepath.Join(home, ".forge")
}

// GetTerminalDir returns the terminal-specific data directory (v1 data).
func GetTerminalDir() string {
	return filepath.Join(GetForgeDir(), "terminal")
}

// GetAssistantDir returns the assistant-specific data directory (v2 data).
func GetAssistantDir() string {
	return filepath.Join(GetForgeDir(), "assistant")
}

// GetTerminalConfigPath returns the path to terminal config file.
func GetTerminalConfigPath() string {
	return filepath.Join(GetTerminalDir(), "config.json")
}

// GetCommandsPath returns the path to saved commands file.
func GetCommandsPath() string {
	return filepath.Join(GetTerminalDir(), "commands.json")
}

// GetSessionsDir returns the directory for session data.
func GetSessionsDir() string {
	return filepath.Join(GetTerminalDir(), "sessions")
}

// GetWelcomePath returns the path to welcome flag file.
func GetWelcomePath() string {
	return filepath.Join(GetTerminalDir(), ".welcome-shown")
}

// GetAMDir returns the directory for Artificial Memory logs.
func GetAMDir() string {
	return filepath.Join(GetForgeDir(), "am")
}

// GetAssistantConfigPath returns the path to assistant config file (v2).
func GetAssistantConfigPath() string {
	return filepath.Join(GetAssistantDir(), "config.json")
}

// GetModelsDir returns the directory for AI models (v2).
func GetModelsDir() string {
	return filepath.Join(GetAssistantDir(), "models")
}

// GetWorkspaceIndexDir returns the directory for workspace indexes (v2).
func GetWorkspaceIndexDir() string {
	return filepath.Join(GetAssistantDir(), "workspace-index")
}

// GetTrainingDataDir returns the directory for training data (v2).
func GetTrainingDataDir() string {
	return filepath.Join(GetAssistantDir(), "training-data")
}

// LegacyConfigPath returns the old config path for migration.
func LegacyConfigPath() string {
	return filepath.Join(GetForgeDir(), "config.json")
}

// LegacyCommandsPath returns the old commands path for migration.
func LegacyCommandsPath() string {
	return filepath.Join(GetForgeDir(), "commands.json")
}

// LegacySessionsDir returns the old sessions directory for migration.
func LegacySessionsDir() string {
	return filepath.Join(GetForgeDir(), "sessions")
}

// LegacyWelcomePath returns the old welcome flag path for migration.
func LegacyWelcomePath() string {
	return filepath.Join(GetForgeDir(), ".welcome-shown")
}
