package commands

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// Command represents a command card
type Command struct {
	ID          int    `json:"id"`
	Description string `json:"description"`
	Command     string `json:"command"`
	KeyBinding  string `json:"keyBinding"`
	PasteOnly   bool   `json:"pasteOnly"`
	Favorite    bool   `json:"favorite"`
	Icon        string `json:"icon,omitempty"`
}

// Default commands created on first run
var DefaultCommands = []Command{
	{
		ID:          1,
		Description: "🤖 Run Claude Code",
		Command:     "claude",
		KeyBinding:  "Ctrl+Shift+1",
		PasteOnly:   false,
		Favorite:    true,
	},
	{
		ID:          2,
		Description: "📝 Design Command",
		Command:     "You are an expert software architect. Produce a clear, actionable design specification.\n\nRequirements:\n- Specific file paths and names\n- Interface definitions before implementations\n- Data structures with field types\n- Edge cases identified upfront\n- No implementation code yet\n\nDesign the following:\n\n",
		KeyBinding:  "Ctrl+Shift+2",
		PasteOnly:   true,
		Favorite:    false,
	},
	{
		ID:          3,
		Description: "⚡ Execute Command",
		Command:     "Implement the design from our last conversation. Follow these rules exactly:\n\n1. Write tests FIRST (TDD) - failing tests before any implementation\n2. Implement minimal code to pass each test\n3. Production-ready code, not stubs or pseudocode\n4. Handle errors explicitly - no silent failures\n5. One file at a time, complete each before moving on\n\nStart with the first test file now.",
		KeyBinding:  "Ctrl+Shift+3",
		PasteOnly:   true,
		Favorite:    false,
	},
	{
		ID:          4,
		Description: "🛑 F*** THIS!",
		Command:     "STOP. You are stuck in a loop or not following instructions.\n\nTake a breath. Here's what I need you to do:\n\n1. Acknowledge what went wrong (one sentence)\n2. State the ACTUAL goal we're trying to achieve\n3. Propose ONE concrete next step\n4. Wait for my confirmation before proceeding\n\nDo not apologize. Do not repeat previous attempts. Do not continue what you were doing.\n\nThe task is:\n\n",
		KeyBinding:  "Ctrl+Shift+4",
		PasteOnly:   true,
		Favorite:    true,
	},
	{
		ID:          5,
		Description: "📖 Summarize Last Session",
		Command:     "Read and analyze the AM (Artificial Memory) session log located in the ./.forge/am/ directory. Find the most recent session-*.md file and provide a concise 200-word-or-less summary covering:\n\n1. What tasks or commands were being worked on\n2. The last significant action or output\n3. Any errors or issues encountered\n4. What the user should continue with or investigate next\n\nBe direct and actionable. Focus on helping me pick up where I left off.\n\nThe AM log is in: ./.forge/am/\n",
		KeyBinding:  "Ctrl+Shift+5",
		PasteOnly:   false,
		Favorite:    false,
		Icon:        "emoji-eyes",
	},
}

// UserHomeDir is a variable to allow mocking in tests
var UserHomeDir = os.UserHomeDir

// GetConfigDir returns the Forge configuration directory
func GetConfigDir() (string, error) {
	home, err := UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".forge"), nil
}

// GetCommandsPath returns the path to the commands JSON file
func GetCommandsPath() (string, error) {
	configDir, err := GetConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(configDir, "commands.json"), nil
}

// LoadCommands loads commands from the JSON file, creating defaults if needed
func LoadCommands() ([]Command, error) {
	path, err := GetCommandsPath()
	if err != nil {
		return nil, fmt.Errorf("failed to get commands path: %w", err)
	}

	// Create default if doesn't exist
	if _, err := os.Stat(path); os.IsNotExist(err) {
		if err := SaveCommands(DefaultCommands); err != nil {
			return nil, fmt.Errorf("failed to create default commands: %w", err)
		}
		return DefaultCommands, nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read commands file: %w", err)
	}

	var commands []Command
	if err := json.Unmarshal(data, &commands); err != nil {
		return nil, fmt.Errorf("failed to parse commands JSON: %w", err)
	}

	return commands, nil
}

// SaveCommands saves commands to the JSON file
func SaveCommands(commands []Command) error {
	configDir, err := GetConfigDir()
	if err != nil {
		return err
	}

	// Ensure directory exists
	if err := os.MkdirAll(configDir, 0700); err != nil {
		return err
	}

	data, err := json.MarshalIndent(commands, "", "  ")
	if err != nil {
		return err
	}

	path, err := GetCommandsPath()
	if err != nil {
		return err
	}

	return os.WriteFile(path, data, 0600)
}
