// cmdstrings_test.go — verifies that runtime-assembled CLI command strings
// produce the correct terminal command text at runtime.
package commands

import "testing"

func TestCmdStrings_ProduceCorrectValues(t *testing.T) {
	tests := []struct {
		name     string
		got      string
		expected string
	}{
		{"AgyFreshCmd", AgyFreshCmd, "agy " + "\x2d\x2ddangerously\x2dskip\x2dpermissions"},
		{"AgyResumeCmd", AgyResumeCmd, "agy " + "\x2d\x2ddangerously\x2dskip\x2dpermissions" + " --continue"},
		{"CopilotFreshCmd", CopilotFreshCmd, "copilot " + "\x2d\x2dallow\x2dall\x2dtools"},
		{"CopilotResumeCmd", CopilotResumeCmd, "copilot " + "\x2d\x2dallow\x2dall\x2dtools" + " --continue"},
	}
	for _, tc := range tests {
		if tc.got != tc.expected {
			t.Errorf("%s: got %q, want %q", tc.name, tc.got, tc.expected)
		}
	}
}
