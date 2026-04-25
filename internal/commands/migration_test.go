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
