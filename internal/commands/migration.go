package commands

import (
	"log"
	"strings"
)

// MigrateCommands upgrades legacy command cards to include new LLM metadata fields.
// This ensures backward compatibility during updates.
func MigrateCommands(commands []Command) ([]Command, bool) {
	migrated := make([]Command, 0, len(commands))
	anyChanged := false

	for _, cmd := range commands {
		updated := cmd

		// If command has triggerAM but no llmProvider, infer it
		if cmd.TriggerAM && cmd.LLMProvider == "" {
			provider := inferProviderFromCommand(cmd.Command, cmd.Description)
			if provider != "" {
				updated.LLMProvider = provider
				anyChanged = true
				log.Printf("[Commands] Migration: Inferred provider '%s' for command '%s'", provider, cmd.Description)
			}
		}

		// Set default llmType if missing but triggerAM is enabled
		if cmd.TriggerAM && cmd.LLMType == "" {
			updated.LLMType = "chat"
			anyChanged = true
			log.Printf("[Commands] Migration: Set default type 'chat' for command '%s'", cmd.Description)
		}

		migrated = append(migrated, updated)
	}

	return migrated, anyChanged
}

// inferProviderFromCommand attempts to detect LLM provider from command text
func inferProviderFromCommand(command, description string) string {
	combined := strings.ToLower(command + " " + description)

	if strings.Contains(combined, "copilot") || strings.Contains(combined, "gh copilot") {
		return "copilot"
	}
	if strings.Contains(combined, "claude") {
		return "claude"
	}
	if strings.Contains(combined, "aider") {
		return "aider"
	}

	return ""
}

// AutoMigrateOnLoad performs automatic migration when commands are loaded
func AutoMigrateOnLoad() error {
	commands, err := LoadCommands()
	if err != nil {
		return err
	}

	migrated, changed := MigrateCommands(commands)
	if changed {
		log.Printf("[Commands] Auto-migration: Updating %d commands with new metadata", len(migrated))
		if err := SaveCommands(migrated); err != nil {
			return err
		}
		log.Printf("[Commands] Auto-migration completed successfully")
	}

	return nil
}
