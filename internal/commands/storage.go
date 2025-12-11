package commands

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/mikejsmith1985/forge-terminal/internal/storage"
)

// Command represents a command card
type Command struct {
	ID          int    `json:"id"`
	Description string `json:"description"`
	Command     string `json:"command"`
	KeyBinding  string `json:"keyBinding"`
	PasteOnly   bool   `json:"pasteOnly"`
	Favorite    bool   `json:"favorite"`
	TriggerAM   bool   `json:"triggerAM,omitempty"`
	LLMProvider string `json:"llmProvider,omitempty"` // "copilot", "claude", "aider"
	LLMType     string `json:"llmType,omitempty"`     // "chat", "suggest", "explain", "code"
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
		Description: "📖 Summarize Last Conversation",
		Command:     "Read and analyze the most recent LLM conversation from the AM (Artificial Memory) system.\n\nFor the conversation JSON logs:\n- Location: ~/.forge/am/llm-conv-*.json\n- Each file contains: conversation turns, screen snapshots, metadata (provider, timestamps)\n\nFor production logs:\n- Location: ~/.forge/forge.log (streaming logs from the running instance)\n- Use: tail -f ~/.forge/forge.log to monitor in real-time\n- Filter: grep -E \"AM API|LLM Logger|StartConversation\" to find relevant entries\n\nProvide a concise summary covering:\n1. What was discussed or worked on\n2. Key insights or outputs from the conversation\n3. Any issues or incomplete tasks\n4. Suggested next steps\n\nKeep it under 200 words. Be direct and actionable.\n",
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
	return storage.GetTerminalDir(), nil
}

// GetCommandsPath returns the path to the commands JSON file
func GetCommandsPath() (string, error) {
	return storage.GetCommandsPath(), nil
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
