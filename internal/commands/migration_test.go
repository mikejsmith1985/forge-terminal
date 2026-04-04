// Package commands — tests for the command card migration system.
// These tests verify that existing users automatically receive the new
// AI enforcement cards (IDs 6, 7, 8) and that stale MacroPayloads are
// upgraded to the real enforcement prompt.
package commands

import (
	"strings"
	"testing"
)

// buildTestCard returns a minimal Command with the given ID and description.
func buildTestCard(id int, description string) Command {
	return Command{ID: id, Description: description, Command: "echo test"}
}

// ─── injectMissingAICards ─────────────────────────────────────────────────────

func TestInjectMissingAICards_AddsAllThreeCardsWhenNonePresent(t *testing.T) {
	// Simulate a user who only has the original 5 default cards
	existingCards := []Command{
		buildTestCard(1, "Run Claude"),
		buildTestCard(2, "Design"),
		buildTestCard(3, "Execute"),
		buildTestCard(4, "F*** THIS"),
		buildTestCard(5, "Summarize"),
	}

	result, wasChanged := injectMissingAICards(existingCards)

	if !wasChanged {
		t.Fatal("expected wasChanged to be true when AI cards are absent")
	}
	if len(result) != 8 {
		t.Fatalf("expected 8 cards after injection, got %d", len(result))
	}

	// Verify all three enforcement card IDs are present
	presentIDs := make(map[int]bool)
	for _, card := range result {
		presentIDs[card.ID] = true
	}
	for _, targetID := range aiEnforcementCardIDs {
		if !presentIDs[targetID] {
			t.Errorf("expected card ID %d to be injected, but it is missing", targetID)
		}
	}
}

func TestInjectMissingAICards_AddsOnlyMissingCards(t *testing.T) {
	// User already has IDs 6 and 7, but not 8
	existingCards := []Command{
		buildTestCard(1, "Claude"),
		buildTestCard(6, "Copilot Fresh (old)"),
		buildTestCard(7, "Copilot Resume (old)"),
	}

	result, wasChanged := injectMissingAICards(existingCards)

	if !wasChanged {
		t.Fatal("expected wasChanged when card 8 is absent")
	}

	presentIDs := make(map[int]bool)
	for _, card := range result {
		presentIDs[card.ID] = true
	}
	if !presentIDs[8] {
		t.Error("expected card ID 8 to be injected")
	}
	if len(result) != 4 {
		t.Fatalf("expected 4 cards, got %d", len(result))
	}
}

func TestInjectMissingAICards_NoChangeWhenAllPresent(t *testing.T) {
	existingCards := []Command{
		buildTestCard(6, "Copilot Fresh"),
		buildTestCard(7, "Copilot Resume"),
		buildTestCard(8, "Copilot Workflow Enforced"),
	}

	result, wasChanged := injectMissingAICards(existingCards)

	if wasChanged {
		t.Error("expected wasChanged to be false when all AI cards are present")
	}
	if len(result) != 3 {
		t.Fatalf("expected 3 cards unchanged, got %d", len(result))
	}
}

func TestInjectMissingAICards_InjectedCardsHaveRealMacroPayload(t *testing.T) {
	// Verify the injected cards carry the real enforcement prompt, not the old comment block
	existingCards := []Command{buildTestCard(1, "Only Claude")}

	result, _ := injectMissingAICards(existingCards)

	for _, card := range result {
		if card.ID == 6 || card.ID == 7 || card.ID == 8 {
			if strings.HasPrefix(card.MacroPayload, "#") {
				t.Errorf("card ID %d still has comment-block MacroPayload; expected real enforcement prompt", card.ID)
			}
			if card.MacroPayload == "" {
				t.Errorf("card ID %d has empty MacroPayload; expected enforcement prompt", card.ID)
			}
			if !strings.Contains(card.MacroPayload, "AGENTS.md") {
				t.Errorf("card ID %d MacroPayload should reference AGENTS.md; got: %s", card.ID, card.MacroPayload)
			}
		}
	}
}

// ─── MigrateCommands — stale MacroPayload upgrade ────────────────────────────

func TestMigrateCommands_UpgradesStaleLegacyMacroPayload(t *testing.T) {
	stalePayload := "# SYSTEM INJECTION: FORGE AWARENESS\n# You are running inside Forge Terminal."
	cardsWithStale := []Command{
		{ID: 6, Description: "Copilot (Fresh)", Command: "copilot --allow-all-tools", MacroPayload: stalePayload, MacroDelay: 1500},
		{ID: 7, Description: "Copilot (Resume)", Command: "copilot --allow-all-tools --continue", MacroPayload: stalePayload, MacroDelay: 1500},
	}

	migrated, wasChanged := MigrateCommands(cardsWithStale)

	if !wasChanged {
		t.Fatal("expected wasChanged to be true when stale MacroPayloads are present")
	}

	for _, card := range migrated {
		if card.ID == 6 || card.ID == 7 {
			if strings.HasPrefix(card.MacroPayload, "#") {
				t.Errorf("card ID %d still has stale comment-block MacroPayload after migration", card.ID)
			}
			if !strings.Contains(card.MacroPayload, "AGENTS.md") {
				t.Errorf("card ID %d upgraded MacroPayload should reference AGENTS.md; got: %s", card.ID, card.MacroPayload)
			}
			if card.MacroDelay != 2000 {
				t.Errorf("card ID %d MacroDelay should be 2000 after upgrade, got %d", card.ID, card.MacroDelay)
			}
		}
	}
}

func TestMigrateCommands_DoesNotTouchNonStalePayloads(t *testing.T) {
	realPayload := "You are operating inside Forge Terminal. Before we begin: read AGENTS.md."
	cardsWithRealPayload := []Command{
		{ID: 6, Description: "Copilot (Fresh)", Command: "copilot --allow-all-tools", MacroPayload: realPayload, MacroDelay: 2000},
	}

	migrated, _ := MigrateCommands(cardsWithRealPayload)

	for _, card := range migrated {
		if card.ID == 6 && card.MacroPayload != realPayload {
			t.Errorf("expected MacroPayload to be unchanged, got: %s", card.MacroPayload)
		}
	}
}

func TestMigrateCommands_InjectsMissingCardsAndReturnsChanged(t *testing.T) {
	// User has only card 1 — all three AI cards should be injected
	onlyCard1 := []Command{buildTestCard(1, "Claude")}

	migrated, wasChanged := MigrateCommands(onlyCard1)

	if !wasChanged {
		t.Fatal("expected wasChanged = true when AI cards are missing")
	}

	presentIDs := make(map[int]bool)
	for _, card := range migrated {
		presentIDs[card.ID] = true
	}
	for _, targetID := range aiEnforcementCardIDs {
		if !presentIDs[targetID] {
			t.Errorf("expected card ID %d to be present after migration", targetID)
		}
	}
}

// ─── findDefaultCardByID ─────────────────────────────────────────────────────

func TestFindDefaultCardByID_ReturnsCardForKnownID(t *testing.T) {
	card := findDefaultCardByID(6)
	if card == nil {
		t.Fatal("expected to find default card with ID 6")
	}
	if card.ID != 6 {
		t.Errorf("expected ID 6, got %d", card.ID)
	}
}

func TestFindDefaultCardByID_ReturnsNilForUnknownID(t *testing.T) {
	card := findDefaultCardByID(9999)
	if card != nil {
		t.Errorf("expected nil for unknown ID 9999, got card: %+v", card)
	}
}

func TestFindDefaultCardByID_ReturnsAllEnforcementCards(t *testing.T) {
	for _, targetID := range aiEnforcementCardIDs {
		card := findDefaultCardByID(targetID)
		if card == nil {
			t.Errorf("expected default card with ID %d to exist in DefaultCommands", targetID)
		}
	}
}
