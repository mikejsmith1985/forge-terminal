package llm

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDefaultConfig(t *testing.T) {
	config := DefaultConfig()

	if config.Tier1.Name != "Copilot" {
		t.Errorf("Expected Tier1 name 'Copilot', got '%s'", config.Tier1.Name)
	}
	// Task 3: Default Tier3 changed to Claude with opus model
	if config.Tier3.Name != "Claude" {
		t.Errorf("Expected Tier3 name 'Claude', got '%s'", config.Tier3.Name)
	}
	if !config.IncludeVision {
		t.Error("Expected IncludeVision to be true by default")
	}
}

func TestConfigLoader_LoadFromFile_NotFound(t *testing.T) {
	cl := NewConfigLoader()
	err := cl.LoadFromFile("/nonexistent/path/forge.toml")

	// Should not error, just use defaults
	if err != nil {
		t.Errorf("Expected no error for missing file, got: %v", err)
	}

	config := cl.GetConfig()
	if config.Tier1.Name != "Copilot" {
		t.Errorf("Expected default Tier1 name 'Copilot', got '%s'", config.Tier1.Name)
	}
}

func TestConfigLoader_LoadFromFile_Valid(t *testing.T) {
	// Create a temporary config file
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "forge.toml")

	content := `
[routing]
tier1_name = "CustomTool1"
tier1_cmd = "custom1 {prompt}"
tier2_name = "CustomTool2"
tier2_cmd = "custom2 {prompt}"
tier3_name = "CustomTool3"
tier3_cmd = "custom3 {prompt}"

[context]
include_cwd = false
include_git_branch = true
include_vision = false
`
	if err := os.WriteFile(configPath, []byte(content), 0644); err != nil {
		t.Fatalf("Failed to write test config: %v", err)
	}

	cl := NewConfigLoader()
	err := cl.LoadFromFile(configPath)
	if err != nil {
		t.Fatalf("Failed to load config: %v", err)
	}

	config := cl.GetConfig()
	if config.Tier1.Name != "CustomTool1" {
		t.Errorf("Expected Tier1 name 'CustomTool1', got '%s'", config.Tier1.Name)
	}
	if config.Tier3.Name != "CustomTool3" {
		t.Errorf("Expected Tier3 name 'CustomTool3', got '%s'", config.Tier3.Name)
	}
	if config.IncludeCwd != false {
		t.Error("Expected IncludeCwd to be false")
	}
	if config.IncludeVision != false {
		t.Error("Expected IncludeVision to be false")
	}
}

func TestConfigLoader_GetTierConfig(t *testing.T) {
	cl := NewConfigLoader()

	tier1 := cl.GetTierConfig(TierHaiku)
	if tier1.Name != "Copilot" {
		t.Errorf("Expected Tier1 (Haiku) name 'Copilot', got '%s'", tier1.Name)
	}

	// Task 3: Default Tier3 changed to Claude with opus model
	tier3 := cl.GetTierConfig(TierOpus)
	if tier3.Name != "Claude" {
		t.Errorf("Expected Tier3 (Opus) name 'Claude', got '%s'", tier3.Name)
	}
}

func TestConfigLoader_BuildCommand(t *testing.T) {
	cl := NewConfigLoader()
	ctx := &ExecutionContext{
		Prompt:    "explain this code",
		Cwd:       "/home/user/project",
		GitBranch: "main",
	}

	cmd := cl.BuildCommand(TierHaiku, ctx)

	if !containsString(cmd, "explain this code") {
		t.Errorf("Command should contain prompt, got: %s", cmd)
	}
	if containsString(cmd, "{prompt}") {
		t.Errorf("Command should not contain {prompt} placeholder, got: %s", cmd)
	}
}

func TestConfigLoader_BuildCommand_EscapesQuotes(t *testing.T) {
	cl := NewConfigLoader()
	ctx := &ExecutionContext{
		Prompt: `fix the "bug" in main.go`,
	}

	cmd := cl.BuildCommand(TierHaiku, ctx)

	if containsString(cmd, `"bug"`) && !containsString(cmd, `\"bug\"`) {
		t.Errorf("Command should escape quotes, got: %s", cmd)
	}
}

func TestConfigLoader_BuildCommand_EscapesBackticks(t *testing.T) {
	cl := NewConfigLoader()
	ctx := &ExecutionContext{
		Prompt: "fix `main.go`",
	}

	cmd := cl.BuildCommand(TierHaiku, ctx)

	if containsString(cmd, "`main.go`") && !containsString(cmd, "\\`main.go\\`") {
		t.Errorf("Command should escape backticks, got: %s", cmd)
	}
}

func TestConfigLoader_BuildCommand_PlaceholdersReplaced(t *testing.T) {
	// Create a config with all placeholders
	cl := NewConfigLoader()
	cl.config = &RoutingConfig{
		Tier1: TierConfig{
			Name:    "Test",
			Command: "tool --prompt \"{prompt}\" --cwd {cwd} --branch {branch}",
		},
	}

	ctx := &ExecutionContext{
		Prompt:    "test prompt",
		Cwd:       "/test/path",
		GitBranch: "feature-branch",
	}

	cmd := cl.BuildCommand(TierHaiku, ctx)

	if containsString(cmd, "{prompt}") {
		t.Errorf("Command should not contain {prompt}, got: %s", cmd)
	}
	if containsString(cmd, "{cwd}") {
		t.Errorf("Command should not contain {cwd}, got: %s", cmd)
	}
	if containsString(cmd, "{branch}") {
		t.Errorf("Command should not contain {branch}, got: %s", cmd)
	}
	if !containsString(cmd, "/test/path") {
		t.Errorf("Command should contain cwd, got: %s", cmd)
	}
	if !containsString(cmd, "feature-branch") {
		t.Errorf("Command should contain branch, got: %s", cmd)
	}
}

func TestStripANSI(t *testing.T) {
	testCases := []struct {
		input    string
		expected string
	}{
		{"plain text", "plain text"},
		{"\x1b[31mred text\x1b[0m", "red text"},
		{"\x1b[1;32mbold green\x1b[0m", "bold green"},
		{"no escape codes", "no escape codes"},
	}

	for _, tc := range testCases {
		result := stripANSI([]byte(tc.input))
		if result != tc.expected {
			t.Errorf("stripANSI(%q) = %q, expected %q", tc.input, result, tc.expected)
		}
	}
}

func containsString(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(substr) == 0 ||
		(len(s) > 0 && len(substr) > 0 && findSubstring(s, substr)))
}

func findSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
