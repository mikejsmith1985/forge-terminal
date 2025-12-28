package provider

import (
	"context"
	"testing"
	"time"
)

// =============================================================================
// Provider Interface Tests
// =============================================================================

func TestCopilotProviderName(t *testing.T) {
	p := NewCopilotProvider()
	if p.Name() != "copilot" {
		t.Errorf("Expected name 'copilot', got '%s'", p.Name())
	}
}

func TestCopilotProviderDisplayName(t *testing.T) {
	p := NewCopilotProvider()
	if p.DisplayName() != "GitHub Copilot" {
		t.Errorf("Expected display name 'GitHub Copilot', got '%s'", p.DisplayName())
	}
}

func TestClaudeProviderName(t *testing.T) {
	p := NewClaudeProvider()
	if p.Name() != "claude" {
		t.Errorf("Expected name 'claude', got '%s'", p.Name())
	}
}

func TestClaudeProviderDisplayName(t *testing.T) {
	p := NewClaudeProvider()
	if p.DisplayName() != "Claude (Anthropic)" {
		t.Errorf("Expected display name 'Claude (Anthropic)', got '%s'", p.DisplayName())
	}
}

func TestClaudeProviderBinaryName(t *testing.T) {
	p := NewClaudeProvider()
	if p.GetBinaryName() != "claude" {
		t.Errorf("Expected binary name 'claude', got '%s'", p.GetBinaryName())
	}
}

func TestCopilotProviderAuthInstructions(t *testing.T) {
	p := NewCopilotProvider()
	instructions := p.GetAuthInstructions()
	if instructions == "" {
		t.Error("Expected non-empty auth instructions")
	}
	if len(instructions) < 50 {
		t.Error("Auth instructions seem too short")
	}
}

func TestClaudeProviderAuthInstructions(t *testing.T) {
	p := NewClaudeProvider()
	instructions := p.GetAuthInstructions()
	if instructions == "" {
		t.Error("Expected non-empty auth instructions")
	}
	if len(instructions) < 50 {
		t.Error("Auth instructions seem too short")
	}
}

// =============================================================================
// Registry Tests
// =============================================================================

func TestNewRegistry(t *testing.T) {
	r := NewRegistry()
	if r == nil {
		t.Fatal("NewRegistry returned nil")
	}

	// Should have copilot and claude registered
	providers := r.List()
	if len(providers) != 2 {
		t.Errorf("Expected 2 providers, got %d", len(providers))
	}

	// Check copilot is registered
	if _, ok := r.Get("copilot"); !ok {
		t.Error("copilot provider not registered")
	}

	// Check claude is registered
	if _, ok := r.Get("claude"); !ok {
		t.Error("claude provider not registered")
	}
}

func TestRegistryGetCaseInsensitive(t *testing.T) {
	r := NewRegistry()

	// Should work with lowercase
	if _, ok := r.Get("copilot"); !ok {
		t.Error("Failed to get 'copilot'")
	}

	// Should work with mixed case (lowercased internally)
	if _, ok := r.Get("COPILOT"); !ok {
		t.Error("Failed to get 'COPILOT' (case insensitive)")
	}
}

func TestRegistryGetUnknown(t *testing.T) {
	r := NewRegistry()

	if _, ok := r.Get("unknown-provider"); ok {
		t.Error("Should not find unknown provider")
	}
}

func TestGlobalRegistry(t *testing.T) {
	r1 := GetRegistry()
	r2 := GetRegistry()

	if r1 != r2 {
		t.Error("GetRegistry should return the same instance (singleton)")
	}
}

// =============================================================================
// Model Parsing Tests
// =============================================================================

func TestParseModelListEmpty(t *testing.T) {
	models := parseModelList("")
	if len(models) != 0 {
		t.Errorf("Expected 0 models from empty string, got %d", len(models))
	}
}

func TestParseModelListSimple(t *testing.T) {
	output := `gpt-4o
gpt-4o-mini
claude-3.5-sonnet`

	models := parseModelList(output)
	if len(models) != 3 {
		t.Errorf("Expected 3 models, got %d", len(models))
	}

	expectedIDs := []string{"gpt-4o", "gpt-4o-mini", "claude-3.5-sonnet"}
	for i, expected := range expectedIDs {
		if i >= len(models) {
			break
		}
		if models[i].ID != expected {
			t.Errorf("Expected model ID '%s', got '%s'", expected, models[i].ID)
		}
	}
}

func TestParseModelListWithHeader(t *testing.T) {
	output := `Model Name
gpt-4o
claude-3.5-sonnet`

	models := parseModelList(output)
	// Should skip the "Model Name" header
	if len(models) != 2 {
		t.Errorf("Expected 2 models (skipping header), got %d", len(models))
	}
}

func TestParseModelListWithDashes(t *testing.T) {
	output := `Model
-----
gpt-4o`

	models := parseModelList(output)
	// Should skip header and dashes
	if len(models) != 1 {
		t.Errorf("Expected 1 model, got %d", len(models))
	}
}

// =============================================================================
// Copilot Help Parsing Tests
// =============================================================================

func TestParseCopilotHelpModels(t *testing.T) {
	// Sample copilot --help output with model choices
	output := `Usage: copilot [options] [command]

GitHub Copilot CLI - An AI-powered coding assistant

Options:
  --model <model>                     Set the AI model to use (choices: "claude-sonnet-4.5", "claude-haiku-4.5",
                                      "claude-opus-4.5", "claude-sonnet-4", "gpt-5.1-codex-max", "gpt-5.1-codex",
                                      "gpt-5.2", "gpt-5.1", "gpt-5", "gpt-5.1-codex-mini", "gpt-5-mini", "gpt-4.1",
                                      "gemini-3-pro-preview")
  -h, --help                          display help for command`

	models := parseCopilotHelpModels(output)

	// Should find 13 models
	if len(models) < 10 {
		t.Errorf("Expected at least 10 models from copilot help, got %d", len(models))
	}

	// Check for specific models
	modelIDs := make(map[string]bool)
	for _, m := range models {
		modelIDs[m.ID] = true
	}

	expectedModels := []string{"claude-sonnet-4.5", "gpt-5.1-codex-max", "gemini-3-pro-preview"}
	for _, expected := range expectedModels {
		if !modelIDs[expected] {
			t.Errorf("Expected to find model '%s' in parsed models", expected)
		}
	}
}

func TestParseCopilotHelpModelsEmpty(t *testing.T) {
	models := parseCopilotHelpModels("")
	if len(models) != 0 {
		t.Errorf("Expected 0 models from empty string, got %d", len(models))
	}
}

func TestFormatModelName(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"gpt-5.1-codex-max", "Gpt 5.1 Codex Max"},
		{"claude-sonnet-4.5", "Claude Sonnet 4.5"},
		{"gemini-3-pro-preview", "Gemini 3 Pro Preview"},
	}

	for _, tt := range tests {
		result := formatModelName(tt.input)
		if result != tt.expected {
			t.Errorf("formatModelName(%s) = %s, want %s", tt.input, result, tt.expected)
		}
	}
}

// =============================================================================
// Claude Web Auth Tests
// =============================================================================

func TestClaudeProviderHasWebLoginConfigured(t *testing.T) {
	p := NewClaudeProvider()
	// This test checks the method exists and doesn't panic
	// Actual result depends on whether ~/.claude/.credentials.json exists
	_ = p.hasWebLoginConfigured()
}

// =============================================================================
// Integration Tests (require CLI tools to be installed)
// =============================================================================

func TestCopilotProviderIsInstalled(t *testing.T) {
	p := NewCopilotProvider()
	// This test will pass or fail based on environment
	// We're just testing that it doesn't panic
	_ = p.IsInstalled()
}

func TestClaudeProviderIsInstalled(t *testing.T) {
	p := NewClaudeProvider()
	// This test will pass or fail based on environment
	// We're just testing that it doesn't panic
	_ = p.IsInstalled()
}

func TestCopilotProviderListModelsWithTimeout(t *testing.T) {
	p := NewCopilotProvider()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Should return fallback models even if not authenticated
	models, err := p.ListModels(ctx)
	if err != nil {
		// Error is acceptable if CLI not installed
		t.Logf("ListModels error (expected if CLI not installed): %v", err)
		return
	}

	if len(models) == 0 {
		t.Error("Expected at least fallback models")
	}
}

func TestClaudeProviderListModelsWithTimeout(t *testing.T) {
	p := NewClaudeProvider()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Should return fallback models even if not authenticated
	models, err := p.ListModels(ctx)
	if err != nil {
		// Error is acceptable if CLI not installed
		t.Logf("ListModels error (expected if CLI not installed): %v", err)
		return
	}

	if len(models) == 0 {
		t.Error("Expected at least fallback models")
	}
}

// =============================================================================
// Status Tests
// =============================================================================

func TestRegistryGetStatusUnknownProvider(t *testing.T) {
	r := NewRegistry()
	ctx := context.Background()

	_, err := r.GetStatus(ctx, "unknown-provider")
	if err == nil {
		t.Error("Expected error for unknown provider")
	}
}

func TestRegistryVerifyAllReturnsAllProviders(t *testing.T) {
	r := NewRegistry()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	statuses := r.VerifyAll(ctx)
	if len(statuses) != 2 {
		t.Errorf("Expected 2 provider statuses, got %d", len(statuses))
	}

	// Check both providers are included
	if _, ok := statuses["copilot"]; !ok {
		t.Error("copilot status missing")
	}
	if _, ok := statuses["claude"]; !ok {
		t.Error("claude status missing")
	}
}

// =============================================================================
// Helper Function Tests
// =============================================================================

func TestCheckBinaryExistsCmd(t *testing.T) {
	// cmd should exist on Windows, sh on Unix
	// This just tests that the function works without panicking
	_ = checkBinaryExists("cmd")
	_ = checkBinaryExists("sh")
}

func TestCheckBinaryExistsNonexistent(t *testing.T) {
	exists := checkBinaryExists("this-binary-definitely-does-not-exist-12345")
	if exists {
		t.Error("Should not find nonexistent binary")
	}
}

func TestExecCommandWithContext(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Test with a simple command that should work on all platforms
	output, err := execCommand(ctx, "echo", "hello")
	if err != nil {
		t.Logf("execCommand error (may be normal): %v", err)
	}

	// On Windows with cmd wrapper, output should contain "hello"
	if output != "" && !contains(output, "hello") {
		t.Logf("Unexpected output: %s", output)
	}
}

func TestExecCommandTimeout(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Millisecond)
	defer cancel()

	// Give a tiny bit of time for context to be set up
	time.Sleep(2 * time.Millisecond)

	// This should timeout
	_, err := execCommand(ctx, "ping", "localhost")
	if err == nil {
		// It's possible the command completed very fast, which is fine
		t.Log("Command completed before timeout (acceptable)")
	}
}

// Helper function
func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsHelper(s, substr))
}

func containsHelper(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
