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
// claude, copilot, and google description variants injected.
func TestMigrateToolVariants_AddsDescriptionVariantsToID6(t *testing.T) {
	original := []Command{{
		ID:           6,
		Description:  "🤖 Copilot (Fresh)",
		Command:      "copilot --allow-all-tools",
		ToolVariants: map[string]string{"claude": "claude", "copilot": "copilot --allow-all-tools"},
	}}

	migrated, changed := migrateToolVariants(original)
	if !changed {
		t.Fatal("expected migrateToolVariants to report a change for missing DescriptionVariants/Google variant")
	}
	dv := migrated[0].DescriptionVariants
	if dv["claude"] == "" {
		t.Error("claude description variant must not be empty")
	}
	if dv["copilot"] == "" {
		t.Error("copilot description variant must not be empty")
	}
	if dv["google"] == "" {
		t.Error("google description variant must not be empty")
	}
	if dv["claude"] == dv["copilot"] {
		t.Errorf("claude and copilot description variants should differ; both are %q", dv["claude"])
	}
}

// TestMigrateToolVariants_AddsMacroVariantsToID7 confirms that a legacy
// Resume card (ID 7) gets claude, copilot, and google macro variants injected,
// with the claude variant containing "SYSTEM INJECTION" and the copilot/google
// variants retaining workflow-enforcer skill invocation language.
func TestMigrateToolVariants_AddsMacroVariantsToID7(t *testing.T) {
	original := []Command{{
		ID:           7,
		Description:  "🔄 Copilot (Resume)",
		Command:      "copilot --allow-all-tools --continue",
		ToolVariants: map[string]string{"claude": "claude --resume", "copilot": "copilot --allow-all-tools --continue"},
		MacroPayload: "You are operating inside Forge Terminal with Forge Workflow enforcement active.\n\nSTEP 1: skill: workflow-enforcer.",
	}}

	migrated, changed := migrateToolVariants(original)
	if !changed {
		t.Fatal("expected migrateToolVariants to report a change for missing MacroVariants/Google variant")
	}
	mv := migrated[0].MacroVariants
	if !strings.Contains(mv["claude"], "SYSTEM INJECTION") {
		t.Errorf("claude macro variant should contain 'SYSTEM INJECTION'; got %q", mv["claude"])
	}
	if !strings.Contains(mv["copilot"], "workflow") {
		t.Errorf("copilot macro variant should contain 'workflow'; got %q", mv["copilot"])
	}
	if !strings.Contains(mv["google"], "workflow") {
		t.Errorf("google macro variant should contain 'workflow'; got %q", mv["google"])
	}
}

// The stale enforced macro a real install carried: it ALREADY names framework-first
// (so the old `!Contains(..., "framework-first")` guard skipped it) yet still points a
// Claude session at Copilot's instruction file and names the retired forge-workflow
// skill — both FR-011 violations. This is the exact payload that mis-fired in the bug.
const staleEnforcedClaudeMacro = "# SYSTEM INJECTION: FORGE AWARENESS — ENFORCED MODE\n# You are running inside Forge Terminal.\n# PROTECT PID: fterm.exe / forge.exe\n# MANDATORY: Read every rule in @.github/copilot-instructions.md before starting.\n# MANDATORY: Apply the workflow-enforcer rules to EVERY task without exception.\n# MANDATORY skill invocation order: workflow-enforcer → forge-workflow → code-quality → framework-first → branching-strategy → code-tutor-workflow\n# NO SHORTCUTS — quality gates, naming rules, and TDD apply on every change."

const staleAwarenessClaudeMacro = "# SYSTEM INJECTION: FORGE AWARENESS\n# You are running inside Forge Terminal.\n# PROTECT PID: fterm.exe / forge.exe\n# MANDATORY: Read @.github/copilot-instructions.md before starting.\n# MANDATORY skill invocation order: workflow-enforcer → forge-workflow → code-quality → framework-first → branching-strategy → code-tutor-workflow"

// fullyPopulatedVariants returns the variant maps a current card has, so a test can
// isolate the Claude-macro heal from the unrelated empty/Google upgrade branches.
func fullyPopulatedVariants(claudeMacro string) (map[string]string, map[string]string, map[string]string) {
	toolVariants := map[string]string{"claude": "claude", "copilot": CopilotFreshCmd, "google": AgyFreshCmd}
	descriptionVariants := map[string]string{"claude": "🛡 Claude (Enforced)", "copilot": "🛡 Copilot (Enforced)", "google": "🛡 Google (Enforced)"}
	macroVariants := map[string]string{"claude": claudeMacro, "copilot": CopilotWorkflowMacro, "google": GoogleWorkflowMacro}
	return toolVariants, descriptionVariants, macroVariants
}

// TestMigrateToolVariants_HealsStaleEnforcedClaudeMacro is the regression test for the
// reported bug: an Enforced card (ID 8) whose Claude macro still points at Copilot's
// instruction file must be rewritten to the canonical constitution-based macro, even
// though the stale text already contains "framework-first".
func TestMigrateToolVariants_HealsStaleEnforcedClaudeMacro(t *testing.T) {
	toolVariants, descriptionVariants, macroVariants := fullyPopulatedVariants(staleEnforcedClaudeMacro)
	original := []Command{{
		ID:                  8,
		Description:         "🛡 Enforced",
		Command:             "claude",
		ToolVariants:        toolVariants,
		DescriptionVariants: descriptionVariants,
		MacroVariants:       macroVariants,
	}}

	migrated, changed := migrateToolVariants(original)
	if !changed {
		t.Fatal("expected migrateToolVariants to heal a stale Claude enforced macro")
	}
	claudeMacro := migrated[0].MacroVariants["claude"]
	if claudeMacro != ClaudeEnforcedMacro {
		t.Fatalf("Claude macro was not reset to canonical ClaudeEnforcedMacro; got %q", claudeMacro)
	}
	if strings.Contains(claudeMacro, "copilot-instructions") {
		t.Fatalf("FR-011 violation: healed Claude macro still references Copilot's instruction file: %q", claudeMacro)
	}
	if !strings.Contains(claudeMacro, ".specify/memory/constitution.md") {
		t.Fatalf("healed Claude macro must point at the constitution; got %q", claudeMacro)
	}
}

// TestMigrateToolVariants_HealsStaleAwarenessClaudeMacro is the same regression for the
// Fresh (ID 6) and Resume (ID 7) cards, which use the awareness (non-enforced) macro.
func TestMigrateToolVariants_HealsStaleAwarenessClaudeMacro(t *testing.T) {
	for _, id := range []int{6, 7} {
		toolVariants, descriptionVariants, macroVariants := fullyPopulatedVariants(staleAwarenessClaudeMacro)
		original := []Command{{
			ID:                  id,
			Description:         "🤖 Fresh",
			Command:             "claude",
			ToolVariants:        toolVariants,
			DescriptionVariants: descriptionVariants,
			MacroVariants:       macroVariants,
		}}

		migrated, changed := migrateToolVariants(original)
		if !changed {
			t.Fatalf("ID %d: expected migrateToolVariants to heal a stale awareness macro", id)
		}
		claudeMacro := migrated[0].MacroVariants["claude"]
		if claudeMacro != ClaudeAwarenessMacro {
			t.Fatalf("ID %d: Claude macro was not reset to canonical ClaudeAwarenessMacro; got %q", id, claudeMacro)
		}
		if strings.Contains(claudeMacro, "copilot-instructions") {
			t.Fatalf("ID %d: FR-011 violation: healed macro still references Copilot's file: %q", id, claudeMacro)
		}
	}
}

// TestMigrateToolVariants_LeavesCanonicalAndCustomMacrosAlone guards against two false
// positives: a card already carrying the canonical macro must not be rewritten (no
// churn on every boot), and a genuinely user-authored macro (no Forge awareness
// header) must never be clobbered.
func TestMigrateToolVariants_LeavesCanonicalAndCustomMacrosAlone(t *testing.T) {
	toolVariants, descriptionVariants, macroVariants := fullyPopulatedVariants(ClaudeEnforcedMacro)
	canonical := []Command{{
		ID: 8, Description: "🛡 Enforced", Command: "claude",
		ToolVariants: toolVariants, DescriptionVariants: descriptionVariants, MacroVariants: macroVariants,
	}}
	if _, changed := migrateToolVariants(canonical); changed {
		t.Fatal("a card already carrying the canonical Claude macro must not be rewritten")
	}

	customMacro := "My own Claude bootstrap. Read project.md. No Forge header here."
	tv, dv, mv := fullyPopulatedVariants(customMacro)
	custom := []Command{{
		ID: 8, Description: "🛡 Enforced", Command: "claude",
		ToolVariants: tv, DescriptionVariants: dv, MacroVariants: mv,
	}}
	migrated, _ := migrateToolVariants(custom)
	if migrated[0].MacroVariants["claude"] != customMacro {
		t.Fatalf("a user-authored Claude macro must be left untouched; got %q", migrated[0].MacroVariants["claude"])
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
	if card.ToolVariants["claude"] == "" || card.ToolVariants["copilot"] == "" || card.ToolVariants["google"] == "" {
		t.Errorf("ID 8 ToolVariants incomplete: %v", card.ToolVariants)
	}
	if len(card.DescriptionVariants) == 0 {
		t.Error("ID 8 should have DescriptionVariants after migration")
	}
	if len(card.MacroVariants) == 0 {
		t.Error("ID 8 should have MacroVariants after migration")
	}
}
