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
	ID           int               `json:"id"`
	Description  string            `json:"description"`
	Command      string            `json:"command"`
	KeyBinding   string            `json:"keyBinding"`
	PasteOnly    bool              `json:"pasteOnly"`
	Favorite     bool              `json:"favorite"`
	TriggerAM    bool              `json:"triggerAM,omitempty"`
	LLMProvider  string            `json:"llmProvider,omitempty"` // "copilot", "claude", "aider"
	LLMType      string            `json:"llmType,omitempty"`     // "chat", "suggest", "explain", "code"
	Icon         string            `json:"icon,omitempty"`
	Delay        int               `json:"delay,omitempty"`
	AlwaysAppend bool              `json:"alwaysAppend,omitempty"` // When true, this command's text is appended to every user prompt
	MacroPayload string            `json:"macro_payload,omitempty"` // Zero-Click: Text to auto-inject after command execution
	MacroDelay   int               `json:"macro_delay,omitempty"`   // Zero-Click: Delay in ms before macro injection (default 4500)
	// ToolVariants maps CLI tool names ("claude", "copilot") to the command
	// string that should run for that tool. When present the frontend uses this
	// map to resolve the effective command based on the user's active CLI tool
	// selection, making a single card work for multiple AI coding tools.
	ToolVariants map[string]string `json:"toolVariants,omitempty"`
	// DescriptionVariants maps CLI tool names to the card label shown in the
	// sidebar (e.g. "🤖 Claude (Fresh)" vs "🤖 Copilot (Fresh)"). When present
	// the frontend swaps the visible description based on the active tool so
	// the card always clearly names which AI is about to run.
	DescriptionVariants map[string]string `json:"descriptionVariants,omitempty"`
	// MacroVariants maps CLI tool names to the macro payload injected after the
	// command starts. Claude and Copilot expect different system-injection
	// formats (Claude uses comment-style SYSTEM INJECTION blocks; Copilot uses
	// \skill: invocation syntax), so each tool can carry its own macro text.
	MacroVariants map[string]string `json:"macroVariants,omitempty"`
}

// CommandVersion represents a versioned snapshot of a command
type CommandVersion struct {
	Command   Command   `json:"command"`
	Timestamp time.Time `json:"timestamp"`
	Version   int       `json:"version"`
}

// CardHistory contains the version history for a single card
type CardHistory struct {
	CardID   int              `json:"card_id"`
	Versions []CommandVersion `json:"versions"` // Newest first
}

// Macro payloads shared across DefaultCommands and migrateToolVariants.
// Defined here so both the initial install and the upgrade path inject
// identical text — no risk of the two drifting apart.
var (
	// ClaudeAwarenessMacro is injected after a fresh or resume Claude session.
	ClaudeAwarenessMacro = "# SYSTEM INJECTION: FORGE AWARENESS\n# You are running inside Forge Terminal.\n# PROTECT PID: fterm.exe / forge.exe\n# STRICTLY FOLLOW: @.github/copilot-instructions.md"

	// ClaudeEnforcedMacro is injected after an enforced Claude session.
	ClaudeEnforcedMacro = "# SYSTEM INJECTION: FORGE AWARENESS — ENFORCED MODE\n# You are running inside Forge Terminal.\n# PROTECT PID: fterm.exe / forge.exe\n# MANDATORY: Read every rule in @.github/copilot-instructions.md before starting.\n# MANDATORY: Apply the workflow-enforcer rules to EVERY task without exception.\n# NO SHORTCUTS — quality gates, naming rules, and TDD apply on every change."

	// CopilotWorkflowMacro is injected after any Copilot session to activate
	// the Forge Workflow skill suite.
	CopilotWorkflowMacro = "You are operating inside Forge Terminal with Forge Workflow enforcement active.\n\nSTEP 1: Your very first tool call MUST be \\skill: workflow-enforcer\\. Do not search for or read any files before invoking this skill. If the skill is unavailable in this environment, proceed to Step 2.\n\nSTEP 2: Invoke each available companion skill in order, silently skip any that are not found: forge-workflow, code-quality, branching-strategy, code-tutor-workflow.\n\nSTEP 3: Check whether AGENTS.md exists at the repo root. If found, read it for project-specific rules. If not found, this is normal for first-time setup — proceed without it. Never ask the user where AGENTS.md is or whether to create it.\n\nSTEP 4: Confirm you are ready and await the user’s task."

	// GoogleWorkflowMacro is injected after any Google session to activate
	// the Forge Workflow skill suite.
	GoogleWorkflowMacro = "You are operating inside Forge Terminal with Forge Workflow enforcement active.\n\nSTEP 1: Your very first tool call MUST be \\skill: workflow-enforcer\\. Do not search for or read any files before invoking this skill. If the skill is unavailable in this environment, proceed to Step 2.\n\nSTEP 2: Invoke each available companion skill in order, silently skip any that are not found: forge-workflow, code-quality, branching-strategy, code-tutor-workflow.\n\nSTEP 3: Check whether AGENTS.md exists at the repo root. If found, read it for project-specific rules. If not found, this is normal for first-time setup — proceed without it. Never ask the user where AGENTS.md is or whether to create it.\n\nSTEP 4: Confirm you are ready and await the user’s task."
)

// Default commands created on first run
var DefaultCommands = []Command{
	{
		ID:          -1,
		Description: "🚀 Release Manager",
		Command:     "SYSTEM_RELEASE_MANAGER",
		PasteOnly:   true,
		Favorite:    false,
	},
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
		Description:  "🚀 Fresh Session",
		Command:      "claude",
		PasteOnly:    false,
		Favorite:     false,
		Icon:         "emoji-robot",
		MacroPayload: CopilotWorkflowMacro,
		MacroDelay:   4500,
		ToolVariants: map[string]string{
			"claude":  "claude",
			"copilot": "copilot --allow-all-tools",
			"google":  "gemini",
		},
		DescriptionVariants: map[string]string{
			"claude":  "🤖 Claude (Fresh)",
			"copilot": "🤖 Copilot (Fresh)",
			"google":  "🤖 Google (Fresh)",
		},
		MacroVariants: map[string]string{
			"claude":  ClaudeAwarenessMacro,
			"copilot": CopilotWorkflowMacro,
			"google":  GoogleWorkflowMacro,
		},
	},
	{
		ID:           7,
		Description:  "🔄 Resume",
		Command:      "claude --resume",
		PasteOnly:    false,
		Favorite:     false,
		Icon:         "emoji-repeat",
		MacroPayload: CopilotWorkflowMacro,
		MacroDelay:   4500,
		ToolVariants: map[string]string{
			"claude":  "claude --resume",
			"copilot": "copilot --allow-all-tools --continue",
			"google":  "gemini --resume",
		},
		DescriptionVariants: map[string]string{
			"claude":  "🔄 Claude (Resume)",
			"copilot": "🔄 Copilot (Resume)",
			"google":  "🔄 Google (Resume)",
		},
		MacroVariants: map[string]string{
			"claude":  ClaudeAwarenessMacro,
			"copilot": CopilotWorkflowMacro,
			"google":  GoogleWorkflowMacro,
		},
	},
	{
		ID:           8,
		Description:  "🛡 Enforced",
		Command:      "claude",
		PasteOnly:    false,
		Favorite:     false,
		Icon:         "emoji-shield",
		MacroPayload: CopilotWorkflowMacro,
		MacroDelay:   4500,
		ToolVariants: map[string]string{
			"claude":  "claude",
			"copilot": "copilot --allow-all-tools",
			"google":  "gemini",
		},
		DescriptionVariants: map[string]string{
			"claude":  "🛡 Claude (Enforced)",
			"copilot": "🛡 Copilot (Enforced)",
			"google":  "🛡 Google (Enforced)",
		},
		MacroVariants: map[string]string{
			"claude":  ClaudeEnforcedMacro,
			"copilot": CopilotWorkflowMacro,
			"google":  GoogleWorkflowMacro,
		},
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

// SaveCommands saves commands to the JSON file with per-card versioning
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

	// Load existing commands to compare for changes
	existingCommands, _ := LoadCommands()
	existingMap := make(map[int]Command)
	for _, cmd := range existingCommands {
		existingMap[cmd.ID] = cmd
	}

	// For each command, check if it changed and save version if needed
	for _, cmd := range commands {
		if existing, found := existingMap[cmd.ID]; found {
			// Check if command actually changed
			if commandsEqual(existing, cmd) {
				// No change detected, skip versioning
				continue
			}
		}
		// New card or changed card - save version
		if err := saveCardVersion(cmd, configDir); err != nil {
			fmt.Printf("Warning: Failed to save version for card %d: %v\n", cmd.ID, err)
		}
	}

	data, err := json.MarshalIndent(commands, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(path, data, 0600)
}

// commandsEqual checks if two commands are identical (ignoring internal state)
func commandsEqual(a, b Command) bool {
	return a.ID == b.ID &&
		a.Description == b.Description &&
		a.Command == b.Command &&
		a.KeyBinding == b.KeyBinding &&
		a.PasteOnly == b.PasteOnly &&
		a.Favorite == b.Favorite &&
		a.TriggerAM == b.TriggerAM &&
		a.LLMProvider == b.LLMProvider &&
		a.LLMType == b.LLMType &&
		a.Icon == b.Icon &&
		a.Delay == b.Delay &&
		a.AlwaysAppend == b.AlwaysAppend &&
		a.MacroPayload == b.MacroPayload &&
		a.MacroDelay == b.MacroDelay
}

// getCardHistoryDir returns the directory for card version history
func getCardHistoryDir(configDir string) string {
	return filepath.Join(configDir, "card-history")
}

// getCardHistoryPath returns the path for a specific card's history file
func getCardHistoryPath(configDir string, cardID int) string {
	return filepath.Join(getCardHistoryDir(configDir), fmt.Sprintf("card-%d.json", cardID))
}

// saveCardVersion saves a new version of a command card
func saveCardVersion(cmd Command, configDir string) error {
	historyDir := getCardHistoryDir(configDir)
	if err := os.MkdirAll(historyDir, 0700); err != nil {
		return fmt.Errorf("failed to create history dir: %w", err)
	}

	historyPath := getCardHistoryPath(configDir, cmd.ID)

	// Load existing history
	var history CardHistory
	if data, err := os.ReadFile(historyPath); err == nil {
		if err := json.Unmarshal(data, &history); err != nil {
			// Corrupt file, start fresh
			history = CardHistory{CardID: cmd.ID, Versions: []CommandVersion{}}
		}
	} else {
		// New card
		history = CardHistory{CardID: cmd.ID, Versions: []CommandVersion{}}
	}

	// Create new version
	newVersion := CommandVersion{
		Command:   cmd,
		Timestamp: time.Now(),
		Version:   len(history.Versions) + 1,
	}

	// Prepend (newest first)
	history.Versions = append([]CommandVersion{newVersion}, history.Versions...)

	// Keep only last 5 versions
	maxVersions := 5
	if len(history.Versions) > maxVersions {
		history.Versions = history.Versions[:maxVersions]
	}

	// Save
	data, err := json.MarshalIndent(history, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(historyPath, data, 0600)
}

// GetCardHistory returns the version history for a specific card
func GetCardHistory(cardID int) (*CardHistory, error) {
	configDir, err := GetConfigDir()
	if err != nil {
		return nil, err
	}

	historyPath := getCardHistoryPath(configDir, cardID)
	data, err := os.ReadFile(historyPath)
	if os.IsNotExist(err) {
		// No history yet
		return &CardHistory{CardID: cardID, Versions: []CommandVersion{}}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to read card history: %w", err)
	}

	var history CardHistory
	if err := json.Unmarshal(data, &history); err != nil {
		return nil, fmt.Errorf("failed to parse card history: %w", err)
	}

	return &history, nil
}

// GetAllCardHistories returns history info for all cards
func GetAllCardHistories() ([]CardHistory, error) {
	configDir, err := GetConfigDir()
	if err != nil {
		return nil, err
	}

	historyDir := getCardHistoryDir(configDir)
	entries, err := os.ReadDir(historyDir)
	if os.IsNotExist(err) {
		return []CardHistory{}, nil
	}
	if err != nil {
		return nil, err
	}

	var histories []CardHistory
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasPrefix(entry.Name(), "card-") || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}

		data, err := os.ReadFile(filepath.Join(historyDir, entry.Name()))
		if err != nil {
			continue
		}

		var history CardHistory
		if err := json.Unmarshal(data, &history); err != nil {
			continue
		}

		histories = append(histories, history)
	}

	// Sort by card ID
	sort.Slice(histories, func(i, j int) bool {
		return histories[i].CardID < histories[j].CardID
	})

	return histories, nil
}

// RestoreCardVersion restores a specific version of a card
func RestoreCardVersion(cardID int, versionNum int) error {
	// Get history
	history, err := GetCardHistory(cardID)
	if err != nil {
		return err
	}

	// Find the version
	var targetVersion *CommandVersion
	for _, v := range history.Versions {
		if v.Version == versionNum {
			targetVersion = &v
			break
		}
	}

	if targetVersion == nil {
		return fmt.Errorf("version %d not found for card %d", versionNum, cardID)
	}

	// Load current commands
	commands, err := LoadCommands()
	if err != nil {
		return err
	}

	// Replace the card
	found := false
	for i, cmd := range commands {
		if cmd.ID == cardID {
			commands[i] = targetVersion.Command
			found = true
			break
		}
	}

	if !found {
		// Card was deleted, re-add it
		commands = append(commands, targetVersion.Command)
	}

	// Save (this will trigger a new version)
	return SaveCommands(commands)
}

// RestoreMultipleCardVersions restores multiple cards to specific versions
func RestoreMultipleCardVersions(restorations map[int]int) error {
	// Load current commands
	commands, err := LoadCommands()
	if err != nil {
		return err
	}

	// Create a map for quick lookup
	cmdMap := make(map[int]int) // cardID -> index in commands slice
	for i, cmd := range commands {
		cmdMap[cmd.ID] = i
	}

	// Restore each card
	for cardID, versionNum := range restorations {
		history, err := GetCardHistory(cardID)
		if err != nil {
			return fmt.Errorf("failed to get history for card %d: %w", cardID, err)
		}

		// Find the version
		var targetVersion *CommandVersion
		for _, v := range history.Versions {
			if v.Version == versionNum {
				targetVersion = &v
				break
			}
		}

		if targetVersion == nil {
			return fmt.Errorf("version %d not found for card %d", versionNum, cardID)
		}

		// Replace or add
		if idx, found := cmdMap[cardID]; found {
			commands[idx] = targetVersion.Command
		} else {
			commands = append(commands, targetVersion.Command)
			cmdMap[cardID] = len(commands) - 1
		}
	}

	// Save
	return SaveCommands(commands)
}

// InitializeCardHistories creates initial version history for all current cards
func InitializeCardHistories() error {
	commands, err := LoadCommands()
	if err != nil {
		return err
	}

	configDir, err := GetConfigDir()
	if err != nil {
		return err
	}

	// Clear old backups directory
	backupDir := filepath.Join(configDir, "backups")
	if err := os.RemoveAll(backupDir); err != nil && !os.IsNotExist(err) {
		fmt.Printf("Warning: Failed to remove old backups: %v\n", err)
	}

	// Create initial version for each card
	for _, cmd := range commands {
		if err := saveCardVersion(cmd, configDir); err != nil {
			return fmt.Errorf("failed to initialize history for card %d: %w", cmd.ID, err)
		}
	}

	return nil
}

// performBackup is deprecated - kept for compatibility
func performBackup(sourcePath string, configDir string) error {
	// No-op - replaced by per-card versioning
	return nil
}

// pruneBackups is deprecated - kept for compatibility
func pruneBackups(backupDir string) error {
	// No-op - replaced by per-card versioning
	return nil
}

// Backup is deprecated - kept for API compatibility
type Backup struct {
	Name      string    `json:"name"`
	Timestamp time.Time `json:"timestamp"`
	Count     int       `json:"count"`
}

// GetBackups is deprecated - returns empty list
func GetBackups() ([]Backup, error) {
	return []Backup{}, nil
}

// RestoreBackup is deprecated
func RestoreBackup(backupName string) error {
	return fmt.Errorf("old backup system is deprecated, use per-card version history")
}

// GetBackupContent is deprecated
func GetBackupContent(backupName string) ([]Command, error) {
	return nil, fmt.Errorf("old backup system is deprecated")
}

// ImportBackup is deprecated
func ImportBackup(backupName string, selectedIDs []int) error {
	return fmt.Errorf("old backup system is deprecated")
}
