package commands

import (
	"log"
	"strings"
)

// legacyForgeAwarenessPayload is the old comment-block macro payload that was
// seeded in v1 of the enforcement cards. It is useless as a Copilot message
// because the agent ignores comment lines; we upgrade it to the real prompt.
const legacyForgeAwarenessPayload = "# SYSTEM INJECTION: FORGE AWARENESS"

// aiEnforcementCardIDs lists the IDs of the built-in AI workflow enforcement
// command cards (Copilot Fresh, Copilot Resume, Copilot Workflow Enforced).
// Any of these missing from the user's command file are injected automatically.
var aiEnforcementCardIDs = []int{6, 7, 8}

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

		// Upgrade the stale comment-block MacroPayload (IDs 6 and 7) to the real
		// enforcement prompt. The old payload started with "# SYSTEM INJECTION" which
		// Copilot silently ignores — the new prompt is natural language that the agent
		// actually reads and acts on.
		if strings.HasPrefix(cmd.MacroPayload, legacyForgeAwarenessPayload) {
			updatedCard := findDefaultCardByID(cmd.ID)
			if updatedCard != nil && updatedCard.MacroPayload != "" {
				updated.MacroPayload = updatedCard.MacroPayload
				updated.MacroDelay = updatedCard.MacroDelay
				anyChanged = true
				log.Printf("[Commands] Migration: Upgraded stale MacroPayload for card ID %d ('%s')", cmd.ID, cmd.Description)
			}
		}

		migrated = append(migrated, updated)
	}

	// Inject any AI enforcement cards that are entirely absent from the user's
	// command list. This happens for existing users who installed Forge before
	// these cards were added to DefaultCommands.
	withInjected, injectedAny := injectMissingAICards(migrated)
	if injectedAny {
		anyChanged = true
		migrated = withInjected
	}

	return migrated, anyChanged
}

// injectMissingAICards appends any AI enforcement command cards (IDs 6, 7, 8)
// that are absent from the provided command list. Returns the updated list and
// whether any cards were added.
func injectMissingAICards(existingCards []Command) ([]Command, bool) {
	presentIDs := make(map[int]bool, len(existingCards))
	for _, cmd := range existingCards {
		presentIDs[cmd.ID] = true
	}

	result := existingCards
	anyAdded := false

	for _, targetID := range aiEnforcementCardIDs {
		if presentIDs[targetID] {
			continue // Already present — skip
		}
		defaultCard := findDefaultCardByID(targetID)
		if defaultCard == nil {
			continue // Defensive: should never happen while DefaultCommands is correct
		}
		result = append(result, *defaultCard)
		anyAdded = true
		log.Printf("[Commands] Migration: Injected missing AI enforcement card ID %d ('%s')", targetID, defaultCard.Description)
	}

	return result, anyAdded
}

// findDefaultCardByID returns a pointer to the DefaultCommand with the given ID,
// or nil if not found.
func findDefaultCardByID(id int) *Command {
	for i := range DefaultCommands {
		if DefaultCommands[i].ID == id {
			return &DefaultCommands[i]
		}
	}
	return nil
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
