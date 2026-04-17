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

func TestMigrateCommandsUpgradesV2CopilotMacroPayload(t *testing.T) {
	// v2 prompt made AGENTS.md the first filesystem action — agents still got stuck
	v2CopilotCommands := []Command{
		{
			ID:          6,
			Description: "🤖 Copilot (Fresh)",
			Command:     "copilot --allow-all-tools",
			MacroPayload: "You are operating inside Forge Terminal with enterprise workflow enforcement active.\n" +
				"Begin by checking for AGENTS.md at the repository root as your first filesystem action.\n" +
				"If AGENTS.md exists, read it first and then invoke `skill: workflow-enforcer` immediately.\n" +
				"Load the full skill chain before any code analysis or file edits: workflow-enforcer -> enterprise-workflow -> code-quality -> branching-strategy -> code-tutor-workflow.\n" +
				"If any named companion skills are unavailable in the current environment, continue with workflow-enforcer plus any available companion skills instead of blocking on the missing ones.\n" +
				"If AGENTS.md, .github/copilot-instructions.md, or the workflow scaffolding is missing, create the missing workflow files and setup needed for this repository yourself so the workflow can be followed.\n" +
				"Do not stop to ask the user where AGENTS.md is if it is missing from the repo root.\n" +
				"After the workflow path exists, continue with the task and confirm readiness.",
			MacroDelay: 1500,
		},
	}

	migratedCommands, wasChanged := MigrateCommands(v2CopilotCommands)
	if !wasChanged {
		t.Fatal("expected v2 Copilot commands to be upgraded to v3")
	}

	if migratedCommands[0].MacroPayload != defaultCopilotMacroPayload {
		t.Fatal("v2 prompt should be upgraded to the current v3 payload")
	}
}

func TestMigrateCommandsPreservesCustomCopilotMacroPayload(t *testing.T) {
	// Card 42 has random text that happens to mention AGENTS.md — NOT a Forge bootstrap prompt.
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

func TestMigrateCommandsUpgradesUserCreatedCopilotCardWithStaleForgePayload(t *testing.T) {
	// User-created card (ID 8) with a stale Forge bootstrap payload should be upgraded.
	userCreatedCopilotCards := []Command{
		{
			ID:           8,
			Description:  "🛡️ Copilot (Workflow Enforced)",
			Command:      "copilot --allow-all-tools",
			MacroPayload: "You are operating inside Forge Terminal with enterprise workflow enforcement active. Begin by reading AGENTS.md. Invoke skill: workflow-enforcer immediately.",
			MacroDelay:   3500,
		},
	}

	migratedCommands, wasChanged := MigrateCommands(userCreatedCopilotCards)
	if !wasChanged {
		t.Fatal("expected user-created Copilot card with stale Forge payload to be upgraded")
	}

	if migratedCommands[0].MacroPayload != defaultCopilotMacroPayload {
		t.Fatal("stale Forge payload on user-created card should be upgraded to current version")
	}
	if migratedCommands[0].MacroDelay != defaultCopilotMacroDelayMs {
		t.Fatal("macro delay on upgraded user-created card should be reset to default")
	}
}
