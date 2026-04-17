package commands

import (
	"log"
	"strings"
)

const defaultCopilotMacroDelayMs = 1500

var builtInCopilotCommandSignatures = []Command{
	{ID: 6, Description: "🤖 Copilot (Fresh)", Command: "copilot --allow-all-tools"},
	{ID: 7, Description: "🔄 Copilot (Resume)", Command: "copilot --allow-all-tools --continue"},
}

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

		// Any Copilot card (built-in OR user-created) carrying a stale Forge bootstrap
		// prompt must be upgraded. The payload is OUR text regardless of who created the card.
		if shouldRefreshCopilotMacro(cmd.MacroPayload) {
			if updated.MacroPayload != defaultCopilotMacroPayload {
				updated.MacroPayload = defaultCopilotMacroPayload
				anyChanged = true
				log.Printf("[Commands] Migration: Refreshed Copilot workflow macro for command '%s'", cmd.Description)
			}
			if cmd.MacroDelay != defaultCopilotMacroDelayMs {
				updated.MacroDelay = defaultCopilotMacroDelayMs
				anyChanged = true
				log.Printf("[Commands] Migration: Reset Copilot macro delay for command '%s' to %dms", cmd.Description, defaultCopilotMacroDelayMs)
			}
		}

		migrated = append(migrated, updated)
	}

	return migrated, anyChanged
}

func isBuiltInCopilotCommand(commandCard Command) bool {
	for _, builtInCopilotCommand := range builtInCopilotCommandSignatures {
		if commandCard.ID == builtInCopilotCommand.ID {
			return true
		}
		if commandCard.Description == builtInCopilotCommand.Description && commandCard.Command == builtInCopilotCommand.Command {
			return true
		}
	}

	return false
}

func hasCurrentCopilotMacroPayload(macroPayload string) bool {
	currentMarkers := []string{
		"STEP 1:",
		"silently skip any that are not found",
		"this is normal for first-time setup",
	}

	for _, requiredMarker := range currentMarkers {
		if !strings.Contains(macroPayload, requiredMarker) {
			return false
		}
	}

	return true
}

func shouldRefreshCopilotMacro(macroPayload string) bool {
	trimmedMacroPayload := strings.TrimSpace(macroPayload)
	if trimmedMacroPayload == "" {
		return false
	}
	if hasCurrentCopilotMacroPayload(trimmedMacroPayload) {
		return false
	}

	// Any card carrying a previous Forge bootstrap prompt contains both of these markers.
	// This matches built-in cards AND user-created Copilot cards with our legacy text.
	forgeBootstrapMarkers := []string{
		"Forge Terminal",
		"workflow-enforcer",
	}

	for _, legacyMarker := range forgeBootstrapMarkers {
		if !strings.Contains(trimmedMacroPayload, legacyMarker) {
			return false
		}
	}

	return true
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
