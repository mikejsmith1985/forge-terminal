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

		// Built-in Copilot cards must carry the latest workflow bootstrap prompt so stale
		// user configs do not keep replaying brittle pre-flight instructions forever.
		if isBuiltInCopilotCommand(cmd) && shouldRefreshBuiltInCopilotMacro(cmd.MacroPayload) {
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
	requiredMarkers := []string{
		"create the missing workflow files",
		"Do not stop to ask the user where AGENTS.md",
		"If any named companion skills are unavailable",
	}

	for _, requiredMarker := range requiredMarkers {
		if !strings.Contains(macroPayload, requiredMarker) {
			return false
		}
	}

	return true
}

func shouldRefreshBuiltInCopilotMacro(macroPayload string) bool {
	trimmedMacroPayload := strings.TrimSpace(macroPayload)
	if trimmedMacroPayload == "" {
		return true
	}
	if hasCurrentCopilotMacroPayload(trimmedMacroPayload) {
		return false
	}

	legacyMarkers := []string{
		"AGENTS.md",
		"workflow-enforcer",
		"Load the full skill chain",
	}

	for _, legacyMarker := range legacyMarkers {
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
