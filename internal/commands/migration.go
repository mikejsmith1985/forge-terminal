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
	if strings.Contains(combined, "google") || strings.Contains(combined, "gemini") || strings.Contains(combined, "agy") {
		return "google"
	}

	return ""
}

// migrateToolVariants upgrades the legacy Copilot-specific cards (IDs 6, 7, 8)
// to tool-agnostic cards with ToolVariants, DescriptionVariants, and
// MacroVariants, and injects the Enforced card (ID 8) if it is missing.
//
// This runs as part of AutoMigrateOnLoad so existing installs are upgraded
// transparently on first boot after the update, without any manual edits.
func migrateToolVariants(commands []Command) ([]Command, bool) {
	changed := false
	hasID8 := false

	for i, cmd := range commands {
		switch cmd.ID {
		case 6:
			if len(cmd.ToolVariants) == 0 {
				commands[i].Description = "🚀 Fresh Session"
				commands[i].Command = "claude"
				commands[i].ToolVariants = map[string]string{
					"claude":  "claude",
					"copilot": "copilot --allow-all-tools",
					"google":  "agy --dangerously-skip-permissions",
				}
				changed = true
				log.Printf("[Commands] Migration: Upgraded ID 6 to tool-agnostic Fresh Session card")
			} else if cmd.ToolVariants["google"] == "" || cmd.ToolVariants["google"] == "gemini" {
				commands[i].ToolVariants["google"] = "agy --dangerously-skip-permissions"
				changed = true
				log.Printf("[Commands] Migration: Upgraded Google ToolVariant in ID 6 to agy")
			}
			if len(commands[i].DescriptionVariants) == 0 {
				commands[i].DescriptionVariants = map[string]string{
					"claude":  "🤖 Claude (Fresh)",
					"copilot": "🤖 Copilot (Fresh)",
					"google":  "🤖 Google (Fresh)",
				}
				changed = true
				log.Printf("[Commands] Migration: Added DescriptionVariants to ID 6")
			} else if _, ok := commands[i].DescriptionVariants["google"]; !ok {
				commands[i].DescriptionVariants["google"] = "🤖 Google (Fresh)"
				changed = true
				log.Printf("[Commands] Migration: Added Google DescriptionVariant to ID 6")
			}
			if len(commands[i].MacroVariants) == 0 {
				copilotMacro := cmd.MacroPayload
				if copilotMacro == "" {
					copilotMacro = CopilotWorkflowMacro
				}
				commands[i].MacroVariants = map[string]string{
					"claude":  ClaudeAwarenessMacro,
					"copilot": copilotMacro,
					"google":  GoogleWorkflowMacro,
				}
				changed = true
				log.Printf("[Commands] Migration: Added MacroVariants to ID 6")
			} else if _, ok := commands[i].MacroVariants["google"]; !ok {
				commands[i].MacroVariants["google"] = GoogleWorkflowMacro
				changed = true
				log.Printf("[Commands] Migration: Added Google MacroVariant to ID 6")
			} else if !strings.Contains(commands[i].MacroVariants["claude"], "framework-first") {
				// Installs from before the framework-first skill (2026-06-05) have a
				// Claude macro that omits the architecture-fidelity gate from the skill
				// cascade. Refresh to the current macro so the gate fires on session start.
				commands[i].MacroVariants["claude"] = ClaudeAwarenessMacro
				changed = true
				log.Printf("[Commands] Migration: Updated Claude MacroVariant in ID 6 to include framework-first skill")
			}

		case 7:
			if len(cmd.ToolVariants) == 0 {
				commands[i].Description = "🔄 Resume"
				commands[i].Command = "claude --resume"
				commands[i].ToolVariants = map[string]string{
					"claude":  "claude --resume",
					"copilot": "copilot --allow-all-tools --continue",
					"google":  "agy --dangerously-skip-permissions --continue",
				}
				changed = true
				log.Printf("[Commands] Migration: Upgraded ID 7 to tool-agnostic Resume card")
			} else if cmd.ToolVariants["google"] == "" || cmd.ToolVariants["google"] == "gemini --resume" || cmd.ToolVariants["google"] == "gemini" {
				commands[i].ToolVariants["google"] = "agy --dangerously-skip-permissions --continue"
				changed = true
				log.Printf("[Commands] Migration: Upgraded Google ToolVariant in ID 7 to agy")
			}
			if len(commands[i].DescriptionVariants) == 0 {
				commands[i].DescriptionVariants = map[string]string{
					"claude":  "🔄 Claude (Resume)",
					"copilot": "🔄 Copilot (Resume)",
					"google":  "🔄 Google (Resume)",
				}
				changed = true
				log.Printf("[Commands] Migration: Added DescriptionVariants to ID 7")
			} else if _, ok := commands[i].DescriptionVariants["google"]; !ok {
				commands[i].DescriptionVariants["google"] = "🔄 Google (Resume)"
				changed = true
				log.Printf("[Commands] Migration: Added Google DescriptionVariant to ID 7")
			}
			if len(commands[i].MacroVariants) == 0 {
				copilotMacro := cmd.MacroPayload
				if copilotMacro == "" {
					copilotMacro = CopilotWorkflowMacro
				}
				commands[i].MacroVariants = map[string]string{
					"claude":  ClaudeAwarenessMacro,
					"copilot": copilotMacro,
					"google":  GoogleWorkflowMacro,
				}
				changed = true
				log.Printf("[Commands] Migration: Added MacroVariants to ID 7")
			} else if _, ok := commands[i].MacroVariants["google"]; !ok {
				commands[i].MacroVariants["google"] = GoogleWorkflowMacro
				changed = true
				log.Printf("[Commands] Migration: Added Google MacroVariant to ID 7")
			} else if !strings.Contains(commands[i].MacroVariants["claude"], "framework-first") {
				// Same gap as ID 6 — resume sessions on pre-2026-06-05 installs need
				// the architecture-fidelity gate added to the Claude session macro.
				commands[i].MacroVariants["claude"] = ClaudeAwarenessMacro
				changed = true
				log.Printf("[Commands] Migration: Updated Claude MacroVariant in ID 7 to include framework-first skill")
			}

		case 8:
			hasID8 = true
			// Fix the silent upgrade gap: ID 8 that already exists but lacks
			// ToolVariants (created before the tool-variant system) must still
			// be upgraded, just like IDs 6 and 7.
			if len(cmd.ToolVariants) == 0 {
				commands[i].Description = "🛡 Enforced"
				commands[i].Command = "claude"
				commands[i].ToolVariants = map[string]string{
					"claude":  "claude",
					"copilot": "copilot --allow-all-tools",
					"google":  "agy --dangerously-skip-permissions",
				}
				changed = true
				log.Printf("[Commands] Migration: Upgraded existing ID 8 to tool-agnostic Enforced card")
			} else if cmd.ToolVariants["google"] == "" || cmd.ToolVariants["google"] == "gemini" {
				commands[i].ToolVariants["google"] = "agy --dangerously-skip-permissions"
				changed = true
				log.Printf("[Commands] Migration: Upgraded Google ToolVariant in ID 8 to agy")
			}
			if len(commands[i].DescriptionVariants) == 0 {
				commands[i].DescriptionVariants = map[string]string{
					"claude":  "🛡 Claude (Enforced)",
					"copilot": "🛡 Copilot (Enforced)",
					"google":  "🛡 Google (Enforced)",
				}
				changed = true
				log.Printf("[Commands] Migration: Added DescriptionVariants to ID 8")
			} else if _, ok := commands[i].DescriptionVariants["google"]; !ok {
				commands[i].DescriptionVariants["google"] = "🛡 Google (Enforced)"
				changed = true
				log.Printf("[Commands] Migration: Added Google DescriptionVariant to ID 8")
			}
			if len(commands[i].MacroVariants) == 0 {
				copilotMacro := cmd.MacroPayload
				if copilotMacro == "" {
					copilotMacro = CopilotWorkflowMacro
				}
				commands[i].MacroVariants = map[string]string{
					"claude":  ClaudeEnforcedMacro,
					"copilot": copilotMacro,
					"google":  GoogleWorkflowMacro,
				}
				changed = true
				log.Printf("[Commands] Migration: Added MacroVariants to ID 8")
			} else if _, ok := commands[i].MacroVariants["google"]; !ok {
				commands[i].MacroVariants["google"] = GoogleWorkflowMacro
				changed = true
				log.Printf("[Commands] Migration: Added Google MacroVariant to ID 8")
			} else if !strings.Contains(commands[i].MacroVariants["claude"], "framework-first") {
				// Enforced card on pre-2026-06-05 installs carries the old ClaudeEnforcedMacro
				// which does not name framework-first. The enforced mode is the strictest gate
				// and must include the architecture-fidelity skill explicitly.
				commands[i].MacroVariants["claude"] = ClaudeEnforcedMacro
				changed = true
				log.Printf("[Commands] Migration: Updated Claude MacroVariant in ID 8 to include framework-first skill")
			}
		}
	}

	if !hasID8 {
		enforced := Command{
			ID:           8,
			Description:  "🛡 Enforced",
			Command:      "claude",
			MacroPayload: CopilotWorkflowMacro,
			MacroDelay:   4500,
			Icon:         "emoji-shield",
			ToolVariants: map[string]string{
				"claude":  "claude",
				"copilot": "copilot --allow-all-tools",
				"google":  "agy --dangerously-skip-permissions",
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
		}
		commands = append(commands, enforced)
		changed = true
		log.Printf("[Commands] Migration: Injected new ID 8 Enforced card")
	}

	return commands, changed
}

// AutoMigrateOnLoad performs automatic migration when commands are loaded
func AutoMigrateOnLoad() error {
	commands, err := LoadCommands()
	if err != nil {
		return err
	}

	migrated, changed := MigrateCommands(commands)

	// Tool-variant migration runs after the general migration so both can
	// mark changed and the final save covers everything in one write.
	migrated, variantChanged := migrateToolVariants(migrated)
	changed = changed || variantChanged

	if changed {
		log.Printf("[Commands] Auto-migration: Updating %d commands with new metadata", len(migrated))
		if err := SaveCommands(migrated); err != nil {
			return err
		}
		log.Printf("[Commands] Auto-migration completed successfully")
	}

	return nil
}
