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

		// Macro payload migrations.
		//
		// Older command-card templates were stored with double-escaped
		// newlines ("\\n") so the value loaded into commands.json was the
		// literal two-character sequence "\n" instead of an actual line
		// break.  When that payload reached the terminal, the bracketed-
		// paste detector saw no real newlines and the AI CLI received a
		// single run-on instruction — frequently truncated or ignored.
		// Heal in place so existing installs benefit without manual edits.
		if strings.Contains(updated.MacroPayload, "\\n") && !strings.Contains(updated.MacroPayload, "\n") {
			updated.MacroPayload = strings.ReplaceAll(updated.MacroPayload, "\\n", "\n")
			anyChanged = true
			log.Printf("[Commands] Migration: Converted literal '\\n' sequences to real newlines in macro payload for '%s'", cmd.Description)
		}

		// Older defaults shipped with too-short macro_delay (1.5s) which
		// fires before `copilot` finishes rendering its first prompt, so
		// the first character of the payload is dropped.  Bump any
		// non-pasteOnly card whose macro_delay is below 4 seconds and
		// whose payload references the workflow pre-flight to a sane
		// minimum.
		if updated.MacroPayload != "" && updated.MacroDelay > 0 && updated.MacroDelay < 4000 &&
			(strings.Contains(updated.MacroPayload, "workflow-enforcer") ||
				strings.Contains(updated.MacroPayload, "Forge Workflow") ||
				strings.Contains(updated.MacroPayload, "enterprise workflow")) {
			updated.MacroDelay = 4500
			anyChanged = true
			log.Printf("[Commands] Migration: Raised macro_delay to 4500ms for workflow card '%s'", cmd.Description)
		}

		// Rename legacy "enterprise workflow" references to "Forge
		// Workflow" so the payload matches the renamed skill suite.
		if strings.Contains(updated.MacroPayload, "enterprise workflow") {
			updated.MacroPayload = strings.ReplaceAll(updated.MacroPayload, "enterprise workflow", "Forge Workflow")
			anyChanged = true
			log.Printf("[Commands] Migration: Renamed 'enterprise workflow' → 'Forge Workflow' in macro payload for '%s'", cmd.Description)
		}
		if strings.Contains(updated.MacroPayload, "enterprise-workflow") {
			updated.MacroPayload = strings.ReplaceAll(updated.MacroPayload, "enterprise-workflow", "forge-workflow")
			anyChanged = true
			log.Printf("[Commands] Migration: Renamed 'enterprise-workflow' → 'forge-workflow' skill reference for '%s'", cmd.Description)
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
