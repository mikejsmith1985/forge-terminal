// Storage tests cover persistence-layer invariants for command cards:
// JSON round-tripping of the on/off toggle card type and change-detection
// (commandsEqual) that gates per-card version history.
package commands

import (
	"encoding/json"
	"testing"
)

// TestToggleCard_JSONRoundTrip verifies that a toggle card's discriminator
// (CardType) and its "off" action config survive a marshal → unmarshal cycle.
// If any field is dropped, a toggle card saved to commands.json would lose its
// teardown behavior on the next load — silently degrading into a one-button card.
func TestToggleCard_JSONRoundTrip(t *testing.T) {
	original := Command{
		ID:           42,
		Description:  "🐳 DBAI POC",
		Command:      "docker compose up -d",
		MacroPayload: "echo started",
		MacroDelay:   2000,
		CardType:     CardTypeToggle,
		Toggle: &ToggleConfig{
			OnLabel:         "Launch",
			OffLabel:        "Tear Down",
			OffCommand:      "docker compose stop",
			OffMacroPayload: "echo stopped",
			OffMacroDelay:   1500,
			OffDelay:        100,
		},
	}

	encoded, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("failed to marshal toggle card: %v", err)
	}

	var decoded Command
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatalf("failed to unmarshal toggle card: %v", err)
	}

	if decoded.CardType != CardTypeToggle {
		t.Errorf("CardType not preserved: got %q, want %q", decoded.CardType, CardTypeToggle)
	}
	if decoded.Toggle == nil {
		t.Fatal("Toggle config was dropped during round-trip")
	}
	if decoded.Toggle.OffCommand != original.Toggle.OffCommand {
		t.Errorf("OffCommand not preserved: got %q, want %q", decoded.Toggle.OffCommand, original.Toggle.OffCommand)
	}
	if decoded.Toggle.OffMacroPayload != original.Toggle.OffMacroPayload {
		t.Errorf("OffMacroPayload not preserved: got %q", decoded.Toggle.OffMacroPayload)
	}
	if decoded.Toggle.OnLabel != "Launch" || decoded.Toggle.OffLabel != "Tear Down" {
		t.Errorf("toggle labels not preserved: on=%q off=%q", decoded.Toggle.OnLabel, decoded.Toggle.OffLabel)
	}
}

// TestNormalCard_OmitsToggleFields confirms a plain command card serializes
// WITHOUT cardType/toggle keys. The omitempty contract is what makes the new
// fields backward-compatible: existing commands.json files stay byte-identical
// and no migration is required to upgrade installs.
func TestNormalCard_OmitsToggleFields(t *testing.T) {
	plainCard := Command{ID: 1, Description: "Run Claude", Command: "claude"}

	encoded, err := json.Marshal(plainCard)
	if err != nil {
		t.Fatalf("failed to marshal plain card: %v", err)
	}

	asText := string(encoded)
	if contains(asText, "cardType") {
		t.Errorf("plain card leaked cardType key: %s", asText)
	}
	if contains(asText, "toggle") {
		t.Errorf("plain card leaked toggle key: %s", asText)
	}
}

// TestCommandsEqual_DetectsToggleChange ensures editing only the toggle config
// (e.g. fixing the stop command) is recognized as a change, so SaveCommands
// records a new version. Without this, toggle edits would skip version history.
func TestCommandsEqual_DetectsToggleChange(t *testing.T) {
	base := Command{
		ID:       7,
		Command:  "docker compose up -d",
		CardType: CardTypeToggle,
		Toggle:   &ToggleConfig{OffCommand: "docker compose stop"},
	}

	// Identical cards must compare equal.
	identical := base
	identical.Toggle = &ToggleConfig{OffCommand: "docker compose stop"}
	if !commandsEqual(base, identical) {
		t.Error("expected identical toggle cards to be equal")
	}

	// A changed stop command must compare unequal.
	editedStop := base
	editedStop.Toggle = &ToggleConfig{OffCommand: "docker compose down"}
	if commandsEqual(base, editedStop) {
		t.Error("expected a changed OffCommand to be detected as a difference")
	}

	// Promoting a plain card to a toggle (CardType change) must compare unequal.
	plain := Command{ID: 7, Command: "docker compose up -d"}
	if commandsEqual(plain, base) {
		t.Error("expected a CardType change to be detected as a difference")
	}
}

// contains is a tiny helper to keep the round-trip assertions readable without
// pulling in strings.Contains at every call site.
func contains(haystack, needle string) bool {
	for i := 0; i+len(needle) <= len(haystack); i++ {
		if haystack[i:i+len(needle)] == needle {
			return true
		}
	}
	return false
}
