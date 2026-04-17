package commands

import "testing"

// migration_test.go verifies that legacy Copilot cards are upgraded to the current workflow bootstrap prompt.

func TestMigrateCommandsUpgradesLegacyCopilotMacroPayload(t *testing.T) {
	legacyCopilotCommands := []Command{
		{
			ID:           6,
			Description:  "🤖 Copilot (Fresh)",
			Command:      "copilot --allow-all-tools",
			MacroPayload: "You are operating inside Forge Terminal with enterprise workflow enforcement active.\nBegin by reading AGENTS.md — do this now as your very first action.\nAfter reading it, invoke `skill: workflow-enforcer` immediately.\nLoad the full skill chain before any code analysis or file edits: workflow-enforcer -> enterprise-workflow -> code-quality -> branching-strategy -> code-tutor-workflow.\nConfirm you have read AGENTS.md and are ready.",
			MacroDelay:   0,
		},
		{
			ID:           7,
			Description:  "🔄 Copilot (Resume)",
			Command:      "copilot --allow-all-tools --continue",
			MacroPayload: "You are operating inside Forge Terminal with enterprise workflow enforcement active.\nBegin by reading AGENTS.md — do this now as your very first action.\nAfter reading it, invoke `skill: workflow-enforcer` immediately.\nLoad the full skill chain before any code analysis or file edits: workflow-enforcer -> enterprise-workflow -> code-quality -> branching-strategy -> code-tutor-workflow.\nConfirm you have read AGENTS.md and are ready.",
			MacroDelay:   250,
		},
	}

	migratedCommands, wasChanged := MigrateCommands(legacyCopilotCommands)
	if !wasChanged {
		t.Fatal("expected legacy Copilot commands to be migrated")
	}

	for _, migratedCommand := range migratedCommands {
		if migratedCommand.MacroPayload != defaultCopilotMacroPayload {
			t.Fatalf("%s should be upgraded to the current Copilot workflow payload", migratedCommand.Description)
		}
		if migratedCommand.MacroDelay != 1500 {
			t.Fatalf("%s should be upgraded to the default Copilot macro delay", migratedCommand.Description)
		}
	}
}

func TestMigrateCommandsPreservesCustomCopilotMacroPayload(t *testing.T) {
	customCopilotCommands := []Command{
		{
			ID:           42,
			Description:  "My Custom Copilot Setup",
			Command:      "copilot --allow-all-tools --sandbox",
			MacroPayload: "AGENTS.md workflow-enforcer Load the full skill chain, but keep my custom repo instructions.",
			MacroDelay:   250,
		},
	}

	migratedCommands, wasChanged := MigrateCommands(customCopilotCommands)
	if wasChanged {
		t.Fatal("expected custom Copilot commands to be left unchanged")
	}

	if migratedCommands[0].MacroPayload != customCopilotCommands[0].MacroPayload {
		t.Fatal("expected custom Copilot macro payload to be preserved")
	}
	if migratedCommands[0].MacroDelay != customCopilotCommands[0].MacroDelay {
		t.Fatal("expected custom Copilot macro delay to be preserved")
	}
}
