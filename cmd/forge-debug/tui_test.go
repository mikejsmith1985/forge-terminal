// tui_test.go — Unit tests for the TUI view rendering and model logic.
package main

import "testing"

func TestTruncateString_Short(t *testing.T) {
	if truncateString("hello", 80) != "hello" {
		t.Error("should not truncate short string")
	}
}

func TestTruncateString_Long(t *testing.T) {
	result := truncateString("this is a very long string that exceeds the limit", 20)
	if len(result) != 20 || result[17:] != "..." {
		t.Errorf("unexpected: %q (len %d)", result, len(result))
	}
}

func TestCreateInitialModel_Defaults(t *testing.T) {
	model := createInitialModel(9119)
	if model.phase != PhaseWelcome {
		t.Error("expected PhaseWelcome")
	}
	if model.port != 9119 {
		t.Errorf("expected port 9119, got %d", model.port)
	}
	if model.hasUserConsented {
		t.Error("should not be consented by default")
	}
}

func TestFormatCheckStatusIcon_AllStatuses(t *testing.T) {
	// Just verify they don't panic and return non-empty
	for _, status := range []string{"pass", "fail", "warn", "unknown"} {
		icon := formatCheckStatusIcon(status)
		if icon == "" {
			t.Errorf("empty icon for status %q", status)
		}
	}
}

func TestFormatBoolStatus_Connected(t *testing.T) {
	result := formatBoolStatus(true)
	if result == "" {
		t.Error("expected non-empty status for true")
	}
}

func TestFormatBoolStatus_Disconnected(t *testing.T) {
	result := formatBoolStatus(false)
	if result == "" {
		t.Error("expected non-empty status for false")
	}
}

func TestRenderKeyHints_AllPhases(t *testing.T) {
	phases := []AppPhase{PhaseWelcome, PhasePreChecks, PhaseReady, PhaseMonitoring, PhaseStopped}
	for _, phase := range phases {
		hints := renderKeyHints(phase)
		if hints == "" {
			t.Errorf("empty hints for phase %d", phase)
		}
	}
}
