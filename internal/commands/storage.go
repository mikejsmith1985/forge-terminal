package commands

import (
	"encoding/json"
	"fmt"
	"os"

	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/storage"
)

// Command represents a command card
type Command struct {
	ID           int    `json:"id"`
	Description  string `json:"description"`
	Command      string `json:"command"`
	KeyBinding   string `json:"keyBinding"`
	PasteOnly    bool   `json:"pasteOnly"`
	Favorite     bool   `json:"favorite"`
	TriggerAM    bool   `json:"triggerAM,omitempty"`
	LLMProvider  string `json:"llmProvider,omitempty"` // "copilot", "claude", "aider"
	LLMType      string `json:"llmType,omitempty"`     // "chat", "suggest", "explain", "code"
	Icon         string `json:"icon,omitempty"`
	Delay        int    `json:"delay,omitempty"`
	AlwaysAppend bool   `json:"alwaysAppend,omitempty"` // When true, this command's text is appended to every user prompt
	MacroPayload string `json:"macro_payload,omitempty"` // Zero-Click: Text to auto-inject after command execution
	MacroDelay   int    `json:"macro_delay,omitempty"`   // Zero-Click: Delay in ms before macro injection (default 1500)
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
	{
		ID:           6,
		Description:  "🤖 Copilot (Fresh)",
		Command:      "copilot --allow-all-tools",
		KeyBinding:   "",
		PasteOnly:    false,
		Favorite:     false,
		Icon:         "emoji-robot",
		MacroPayload: "# SYSTEM INJECTION: FORGE AWARENESS\n# You are running inside Forge Terminal.\n# PROTECT PID: fterm.exe / forge.exe\n# STRICTLY FOLLOW: @.github/copilot-instructions.md",
		MacroDelay:   1500,
	},
	{
		ID:           7,
		Description:  "🔄 Copilot (Resume)",
		Command:      "copilot --allow-all-tools --continue",
		KeyBinding:   "",
		PasteOnly:    false,
		Favorite:     false,
		Icon:         "emoji-repeat",
		MacroPayload: "# SYSTEM INJECTION: FORGE AWARENESS\n# You are running inside Forge Terminal.\n# PROTECT PID: fterm.exe / forge.exe\n# STRICTLY FOLLOW: @.github/copilot-instructions.md",
		MacroDelay:   1500,
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

	// Deduplicate by ID - keep first occurrence
	seen := make(map[int]bool)
	deduplicated := make([]Command, 0, len(commands))
	for _, cmd := range commands {
		if !seen[cmd.ID] {
			seen[cmd.ID] = true
			deduplicated = append(deduplicated, cmd)
		}
	}
	
	// If we removed duplicates, save the cleaned version
	if len(deduplicated) < len(commands) {
		if err := SaveCommands(deduplicated); err != nil {
			return nil, fmt.Errorf("failed to save deduplicated commands: %w", err)
		}
	}

	return deduplicated, nil
}

// SaveCommands saves commands to the JSON file with automated backup
func SaveCommands(commands []Command) error {
	configDir, err := GetConfigDir()
	if err != nil {
		return err
	}

	// Ensure directory exists
	if err := os.MkdirAll(configDir, 0700); err != nil {
		return err
	}

	// PATH HANDLING
	path, err := GetCommandsPath()
	if err != nil {
		return err
	}

	// AUTOMATED BACKUP
	// Only backup if the file exists and has content
	if info, err := os.Stat(path); err == nil && info.Size() > 0 {
		if err := performBackup(path, configDir); err != nil {
			// Log error but continue with save - don't block user operation due to backup failure
			fmt.Printf("Warning: Failed to create backup: %v\n", err)
		}
	}

	data, err := json.MarshalIndent(commands, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(path, data, 0600)
}

// performBackup creates a timestamped backup and rotates old ones
func performBackup(sourcePath string, configDir string) error {
	// Create backups directory
	backupDir := filepath.Join(configDir, "backups")
	if err := os.MkdirAll(backupDir, 0700); err != nil {
		return fmt.Errorf("failed to create backup dir: %w", err)
	}

	// Read source content
	content, err := os.ReadFile(sourcePath)
	if err != nil {
		return fmt.Errorf("failed to read source for backup: %w", err)
	}

	// Create timestamped backup
	timestamp := time.Now().Format("20060102-150405")
	backupName := fmt.Sprintf("commands-%s.json", timestamp)
	backupPath := filepath.Join(backupDir, backupName)

	if err := os.WriteFile(backupPath, content, 0600); err != nil {
		return fmt.Errorf("failed to write backup file: %w", err)
	}

	// Prune old backups (keep last 20)
	return pruneBackups(backupDir)
}

// pruneBackups keeps only the N most recent backups
func pruneBackups(backupDir string) error {
	entries, err := os.ReadDir(backupDir)
	if err != nil {
		return err
	}

	var backups []os.DirEntry
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasPrefix(entry.Name(), "commands-") && strings.HasSuffix(entry.Name(), ".json") {
			backups = append(backups, entry)
		}
	}

	// If we have more than 20, delete the oldest
	maxBackups := 20
	if len(backups) <= maxBackups {
		return nil
	}

	// Sort by name (timestamp ensures chronological order)
	// command-20260101... comes before command-20260102...
	sort.Slice(backups, func(i, j int) bool {
		return backups[i].Name() < backups[j].Name()
	})

	// Delete oldest (start of slice)
	numToDelete := len(backups) - maxBackups
	for i := 0; i < numToDelete; i++ {
		path := filepath.Join(backupDir, backups[i].Name())
		if err := os.Remove(path); err != nil {
			// Log but continue
			fmt.Printf("Warning: Failed to delete old backup %s: %v\n", path, err)
		}
	}

	return nil
}

// Backup represents a command backup file
type Backup struct {
	Name      string    `json:"name"`
	Timestamp time.Time `json:"timestamp"`
	Count     int       `json:"count"`
}

// GetBackups returns a list of available backups
func GetBackups() ([]Backup, error) {
	configDir, err := GetConfigDir()
	if err != nil {
		return nil, err
	}

	backupDir := filepath.Join(configDir, "backups")
	entries, err := os.ReadDir(backupDir)
	if os.IsNotExist(err) {
		return []Backup{}, nil
	}
	if err != nil {
		return nil, err
	}

	var backups []Backup
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasPrefix(entry.Name(), "commands-") && strings.HasSuffix(entry.Name(), ".json") {
			// Parse timestamp from filename: commands-20260109-141913.json
			tsStr := strings.TrimPrefix(entry.Name(), "commands-")
			tsStr = strings.TrimSuffix(tsStr, ".json")
			
			ts, err := time.Parse("20060102-150405", tsStr)
			if err != nil {
				continue
			}

			// Count items (rough check by reading file)
			count := 0
			if content, err := os.ReadFile(filepath.Join(backupDir, entry.Name())); err == nil {
				var cmds []Command
				if err := json.Unmarshal(content, &cmds); err == nil {
					count = len(cmds)
				}
			}

			backups = append(backups, Backup{
				Name:      entry.Name(),
				Timestamp: ts,
				Count:     count,
			})
		}
	}

	// Sort descending (newest first)
	sort.Slice(backups, func(i, j int) bool {
		return backups[i].Timestamp.After(backups[j].Timestamp)
	})

	return backups, nil
}

// RestoreBackup overwrites the current commands.json with the selected backup
func RestoreBackup(backupName string) error {
	configDir, err := GetConfigDir()
	if err != nil {
		return err
	}

	backupDir := filepath.Join(configDir, "backups")
	backupPath := filepath.Join(backupDir, backupName)

	// Security check: ensure path traversal is not possible
	if filepath.Clean(backupPath) != backupPath {
		return fmt.Errorf("invalid backup path")
	}

	content, err := os.ReadFile(backupPath)
	if err != nil {
		return fmt.Errorf("failed to read backup: %w", err)
	}

	// Validate JSON before restoring
	var cmds []Command
	if err := json.Unmarshal(content, &cmds); err != nil {
		return fmt.Errorf("invalid backup file (corrupt JSON): %w", err)
	}

	// Create a backup of CURRENT state before overwriting (just in case)
	currentPath, _ := GetCommandsPath()
	if info, err := os.Stat(currentPath); err == nil && info.Size() > 0 {
		performBackup(currentPath, configDir)
	}

	// Overwrite
	if err := os.WriteFile(currentPath, content, 0600); err != nil {
		return fmt.Errorf("failed to restore commands: %w", err)
	}

	return nil
}

// GetBackupContent returns the commands from a specific backup file
func GetBackupContent(backupName string) ([]Command, error) {
	configDir, err := GetConfigDir()
	if err != nil {
		return nil, err
	}
	backupDir := filepath.Join(configDir, "backups")
	backupPath := filepath.Join(backupDir, backupName)

	// Security check: ensure path traversal is not possible
	if filepath.Clean(backupPath) != backupPath {
		return nil, fmt.Errorf("invalid backup path")
	}

	content, err := os.ReadFile(backupPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read backup: %w", err)
	}

	var cmds []Command
	if err := json.Unmarshal(content, &cmds); err != nil {
		return nil, fmt.Errorf("invalid backup file (corrupt JSON): %w", err)
	}

	return cmds, nil
}

// ImportBackup restores specific commands from a backup, merging them into current commands
// Commands with matching IDs will be overwritten by the backup version
func ImportBackup(backupName string, selectedIDs []int) error {
	// Get backup commands
	backupCmds, err := GetBackupContent(backupName)
	if err != nil {
		return err
	}

	// Filter for selected IDs
	selectedMap := make(map[int]bool)
	for _, id := range selectedIDs {
		selectedMap[id] = true
	}

	var cmdsToRestore []Command
	for _, cmd := range backupCmds {
		if selectedMap[cmd.ID] {
			cmdsToRestore = append(cmdsToRestore, cmd)
		}
	}

	if len(cmdsToRestore) == 0 {
		return fmt.Errorf("no valid commands found to restore in backup")
	}

	// Load current commands
	currentCmds, err := LoadCommands()
	if err != nil {
		return err
	}

	// Map current commands by ID
	cmdMap := make(map[int]Command)
	for _, cmd := range currentCmds {
		cmdMap[cmd.ID] = cmd
	}

	// Overwrite/Add with restored commands
	for _, cmd := range cmdsToRestore {
		cmdMap[cmd.ID] = cmd
	}

	// Reconstruct slice
	var newCmds []Command
	for _, cmd := range cmdMap {
		newCmds = append(newCmds, cmd)
	}

	// Sort by ID
	sort.Slice(newCmds, func(i, j int) bool {
		return newCmds[i].ID < newCmds[j].ID
	})

	// Save (this will trigger a new backup of the pre-merge state)
	return SaveCommands(newCmds)
}
