package commands

import (
	"strings"
	"testing"
)

// TestDefaultCopilotCommandsIncludeWorkflowBootstrapMacro keeps the seeded
// Copilot cards aligned with the workflow bootstrap instructions used by Forge.
func TestDefaultCopilotCommandsIncludeWorkflowBootstrapMacro(t *testing.T) {
	copilotCardDescriptions := map[string]bool{
		"🤖 Copilot (Fresh)":  false,
		"🔄 Copilot (Resume)": false,
	}

	for _, defaultCommand := range DefaultCommands {
		if _, isTrackedCopilotCard := copilotCardDescriptions[defaultCommand.Description]; !isTrackedCopilotCard {
			continue
		}

		copilotCardDescriptions[defaultCommand.Description] = true

		if strings.TrimSpace(defaultCommand.MacroPayload) == "" {
			t.Fatalf("%s should include a default macro payload", defaultCommand.Description)
		}
		if defaultCommand.MacroDelay != 1500 {
			t.Fatalf("%s should use a 1500ms macro delay, got %d", defaultCommand.Description, defaultCommand.MacroDelay)
		}
		if !strings.Contains(defaultCommand.MacroPayload, "AGENTS.md") {
			t.Fatalf("%s macro payload should mention AGENTS.md", defaultCommand.Description)
		}
		if !strings.Contains(defaultCommand.MacroPayload, "workflow-enforcer") {
			t.Fatalf("%s macro payload should mention workflow-enforcer", defaultCommand.Description)
		}
		if !strings.Contains(defaultCommand.MacroPayload, "create the missing workflow files") {
			t.Fatalf("%s macro payload should instruct Forge to create missing workflow files", defaultCommand.Description)
		}
	}

	for description, wasFound := range copilotCardDescriptions {
		if !wasFound {
			t.Fatalf("expected default command %q to exist", description)
		}
	}
}
