package commands

import (
	"strings"
	"testing"
)

// TestMigrateCommands_ConvertsLiteralBackslashN verifies that command cards
// stored with literal `\n` sequences in their macro_payload (a legacy
// double-escaping bug) are healed in place to real newline characters.
func TestMigrateCommands_ConvertsLiteralBackslashN(t *testing.T) {
	original := []Command{{
		ID:           1,
		Description:  "Copilot Resume",
		MacroPayload: "STEP 1: invoke skill: workflow-enforcer.\\nSTEP 2: load forge-workflow.\\nSTEP 3: confirm.",
		MacroDelay:   1500,
	}}

	migrated, changed := MigrateCommands(original)
	if !changed {
		t.Fatal("expected MigrateCommands to report a change for literal-\\n payloads")
	}
	if strings.Contains(migrated[0].MacroPayload, "\\n") {
		t.Fatalf("literal \\n still present after migration: %q", migrated[0].MacroPayload)
	}
	if !strings.Contains(migrated[0].MacroPayload, "\n") {
		t.Fatalf("migrated payload contains no real newlines: %q", migrated[0].MacroPayload)
	}
}

// TestMigrateCommands_RenamesEnterpriseWorkflow ensures the legacy
// "enterprise workflow" wording is rewritten to the new "Forge Workflow"
// branding so paste payloads stay in sync with the renamed skill suite.
func TestMigrateCommands_RenamesEnterpriseWorkflow(t *testing.T) {
	original := []Command{{
		ID:           2,
		Description:  "Copilot Fresh",
		MacroPayload: "Read AGENTS.md and load enterprise-workflow plus enterprise workflow rules.",
		MacroDelay:   4500,
	}}

	migrated, changed := MigrateCommands(original)
	if !changed {
		t.Fatal("expected MigrateCommands to rename legacy enterprise references")
	}
	if strings.Contains(migrated[0].MacroPayload, "enterprise workflow") {
		t.Fatalf("legacy phrase 'enterprise workflow' was not rewritten: %q", migrated[0].MacroPayload)
	}
	if strings.Contains(migrated[0].MacroPayload, "enterprise-workflow") {
		t.Fatalf("legacy skill ID 'enterprise-workflow' was not rewritten: %q", migrated[0].MacroPayload)
	}
	if !strings.Contains(migrated[0].MacroPayload, "Forge Workflow") {
		t.Fatalf("payload missing new 'Forge Workflow' wording: %q", migrated[0].MacroPayload)
	}
	if !strings.Contains(migrated[0].MacroPayload, "forge-workflow") {
		t.Fatalf("payload missing new 'forge-workflow' skill ID: %q", migrated[0].MacroPayload)
	}
}

// TestMigrateCommands_RaisesShortMacroDelay confirms cards whose
// macro_delay is below 4 seconds are bumped to 4500ms so copilot has
// time to render its initial prompt before the payload is injected.
func TestMigrateCommands_RaisesShortMacroDelay(t *testing.T) {
	original := []Command{{
		ID:           3,
		Description:  "Copilot Workflow Enforced",
		MacroPayload: "Invoke skill: workflow-enforcer immediately.",
		MacroDelay:   1500,
	}}

	migrated, changed := MigrateCommands(original)
	if !changed {
		t.Fatal("expected MigrateCommands to raise short macro_delay")
	}
	if migrated[0].MacroDelay < 4000 {
		t.Fatalf("macro_delay was not raised: got %d", migrated[0].MacroDelay)
	}
}

// TestMigrateCommands_LeavesGoodPayloadsAlone guards against false
// positives — a card already using real newlines, the new wording, and a
// reasonable delay must produce no migration changes.
func TestMigrateCommands_LeavesGoodPayloadsAlone(t *testing.T) {
	original := []Command{{
		ID:           4,
		Description:  "Modern Card",
		MacroPayload: "Forge Workflow active.\nInvoke forge-workflow skill.",
		MacroDelay:   4500,
	}}

	_, changed := MigrateCommands(original)
	if changed {
		t.Fatal("expected MigrateCommands to leave well-formed payloads untouched")
	}
}

// ── migrateToolVariants tests ──────────────────────────────────────────────

// TestMigrateToolVariants_AddsDescriptionVariantsToID6 confirms that a
// legacy "Copilot (Fresh)" card (ID 6) without DescriptionVariants gets
// both the claude and copilot description variants injected.
func TestMigrateToolVariants_AddsDescriptionVariantsToID6(t *testing.T) {
	original := []Command{{
		ID:           6,
		Description:  "🤖 Copilot (Fresh)",
		Command:      "copilot --allow-all-tools",
		ToolVariants: map[string]string{"claude": "claude", "copilot": "copilot --allow-all-tools"},
	}}

	migrated, changed := migrateToolVariants(original)
	if !changed {
		t.Fatal("expected migrateToolVariants to report a change for missing DescriptionVariants")
	}
	dv := migrated[0].DescriptionVariants
	if dv["claude"] == "" {
		t.Error("claude description variant must not be empty")
	}
	if dv["copilot"] == "" {
		t.Error("copilot description variant must not be empty")
	}
	if dv["claude"] == dv["copilot"] {
		t.Errorf("claude and copilot description variants should differ; both are %q", dv["claude"])
	}
}

// TestMigrateToolVariants_AddsMacroVariantsToID7 confirms that a legacy
// Resume card (ID 7) gets toolVariants set to "claude --continue" (not
// "claude --resume") and a populated claude macro variant.
// "claude --continue" is non-interactive and resumes the last session
// automatically, so the enforcement macro fires correctly after macro_delay ms.
func TestMigrateToolVariants_AddsMacroVariantsToID7(t *testing.T) {
	original := []Command{{
		ID:           7,
		Description:  "🔄 Copilot (Resume)",
		Command:      "copilot --allow-all-tools --continue",
		MacroPayload: "You are operating inside Forge Terminal with Forge Workflow enforcement active.\n\nSTEP 1: skill: workflow-enforcer.",
	}}

	migrated, changed := migrateToolVariants(original)
	if !changed {
		t.Fatal("expected migrateToolVariants to report a change for missing MacroVariants")
	}
	tv := migrated[0].ToolVariants
	if tv["claude"] != "claude --continue" {
		t.Errorf("ID 7 claude tool variant must be 'claude --continue'; got %q", tv["claude"])
	}
	mv := migrated[0].MacroVariants
	if !strings.Contains(mv["claude"], "SYSTEM INJECTION") {
		t.Errorf("claude macro variant should contain 'SYSTEM INJECTION'; got %q", mv["claude"])
	}
	if !strings.Contains(mv["copilot"], "workflow") {
		t.Errorf("copilot macro variant should contain 'workflow'; got %q", mv["copilot"])
	}
}

// TestMigrateToolVariants_UpgradesExistingID8 verifies that when ID 8 is
// present but lacks ToolVariants, the migration adds ToolVariants,
// DescriptionVariants, and MacroVariants — fixing the silent upgrade gap
// where the old code only set hasID8=true without actually upgrading it.
func TestMigrateToolVariants_UpgradesExistingID8(t *testing.T) {
	original := []Command{{
		ID:           8,
		Description:  "🛡️ Copilot (Workflow Enforced)",
		Command:      "copilot --allow-all-tools",
		MacroPayload: "You are operating inside Forge Terminal with Forge Workflow enforcement active.\n\nSTEP 1: skill: workflow-enforcer.",
	}}

	migrated, changed := migrateToolVariants(original)
	if !changed {
		t.Fatal("expected migrateToolVariants to upgrade existing ID 8 that lacks ToolVariants")
	}
	card := migrated[0]
	if len(card.ToolVariants) == 0 {
		t.Error("ID 8 should have ToolVariants after migration")
	}
	if card.ToolVariants["claude"] == "" || card.ToolVariants["copilot"] == "" {
		t.Errorf("ID 8 ToolVariants incomplete: %v", card.ToolVariants)
	}
	if len(card.DescriptionVariants) == 0 {
		t.Error("ID 8 should have DescriptionVariants after migration")
	}
	if len(card.MacroVariants) == 0 {
		t.Error("ID 8 should have MacroVariants after migration")
	}
}
