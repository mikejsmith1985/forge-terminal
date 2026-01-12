package terminal

import "testing"

func TestStripANSI(t *testing.T) {
    tests := []struct {
        name     string
        input    string
        expected string
    }{
        {"plain text", "plain text", "plain text"},
        {"ESC O sequence", "\x1b[Ocopilot test", "copilot test"},
        {"CSI sequence", "\x1b[1;2;3mcolored\x1b[0m", "colored"},
        {"multiple escapes", "\x1b[Aup\x1b[Bdown", "updown"},
        {"cd command with quotes", "cd \"C:\\test\"", "cd \"C:\\test\""},
        {"copilot command", "copilot --allow-all-tools", "copilot --allow-all-tools"},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := stripANSI(tt.input)
            if result != tt.expected {
                t.Errorf("stripANSI(%q) = %q, want %q", tt.input, result, tt.expected)
            }
        })
    }
}
