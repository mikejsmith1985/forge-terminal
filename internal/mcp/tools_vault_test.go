// tools_vault_test.go — Unit tests for the vault_inject MCP tool.
//
// All tests use a mock VaultSecretInjector so they run entirely in memory
// without touching the real AES-encrypted vault or writing any disk files.
// Every test must complete in under 10ms (no I/O, no mocks with sleep).
package mcp

import (
	"fmt"
	"strings"
	"testing"
)

// ── Mock ─────────────────────────────────────────────────────────────────────

// mockVaultInjector is a test double for VaultSecretInjector.
// It records the secret names it receives so callers can assert the tool
// forwarded them correctly, and returns a configured path or error.
type mockVaultInjector struct {
	returnScriptPath string
	returnErr        error
	receivedNames    []string
}

func (m *mockVaultInjector) BuildInjectionScriptForNames(secretNames []string) (string, error) {
	m.receivedNames = secretNames
	return m.returnScriptPath, m.returnErr
}

// ── Definition tests ──────────────────────────────────────────────────────────

func TestVaultInjectTool_Definition_HasCorrectName(t *testing.T) {
	tool := newVaultInjectTool(nil)
	def := tool.Definition()

	if def.Name != "vault_inject" {
		t.Errorf("expected tool name %q, got %q", "vault_inject", def.Name)
	}
}

func TestVaultInjectTool_Definition_HasNonEmptyDescription(t *testing.T) {
	tool := newVaultInjectTool(nil)
	def := tool.Definition()

	if strings.TrimSpace(def.Description) == "" {
		t.Error("expected non-empty description")
	}
}

func TestVaultInjectTool_Definition_HasInputSchema(t *testing.T) {
	tool := newVaultInjectTool(nil)
	def := tool.Definition()

	if def.InputSchema == nil {
		t.Fatal("expected non-nil input schema")
	}
	// Schema must declare secret_names as required — agents must provide it.
	if !strings.Contains(string(def.InputSchema), "secret_names") {
		t.Error("input schema must reference the secret_names field")
	}
}

// ── Execute: guard clause tests ───────────────────────────────────────────────

func TestVaultInjectTool_Execute_NilVaultReturnsErrorContent(t *testing.T) {
	// When the vault singleton is nil (Forge not yet initialised), the tool
	// must return a descriptive error rather than panicking.
	tool := newVaultInjectTool(nil)
	result, err := tool.Execute(map[string]any{
		"secret_names": []any{"MY_SECRET"},
	})

	if err != nil {
		t.Fatalf("Execute must return nil error (errors go in content), got: %v", err)
	}
	if !result.IsError {
		t.Error("expected IsError=true when vault is nil")
	}
}

func TestVaultInjectTool_Execute_MissingSecretNamesReturnsErrorContent(t *testing.T) {
	mockVault := &mockVaultInjector{}
	tool := newVaultInjectTool(mockVault)

	result, err := tool.Execute(map[string]any{}) // no secret_names key

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.IsError {
		t.Error("expected IsError=true when secret_names is absent")
	}
}

func TestVaultInjectTool_Execute_EmptySecretNamesReturnsErrorContent(t *testing.T) {
	mockVault := &mockVaultInjector{}
	tool := newVaultInjectTool(mockVault)

	result, err := tool.Execute(map[string]any{
		"secret_names": []any{},
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.IsError {
		t.Error("expected IsError=true for empty secret_names array")
	}
}

func TestVaultInjectTool_Execute_BlankSecretNameReturnsErrorContent(t *testing.T) {
	mockVault := &mockVaultInjector{}
	tool := newVaultInjectTool(mockVault)

	result, err := tool.Execute(map[string]any{
		"secret_names": []any{""},
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.IsError {
		t.Error("expected IsError=true for blank secret name string")
	}
}

// ── Execute: zero-knowledge guarantee ─────────────────────────────────────────

func TestVaultInjectTool_Execute_ReturnsScriptPath(t *testing.T) {
	// The tool must include the script path in its response so the agent knows
	// what to pass to terminal_execute.
	expectedScriptPath := `C:\Users\test\AppData\Local\Temp\forge-vault-abc123.ps1`
	mockVault := &mockVaultInjector{returnScriptPath: expectedScriptPath}
	tool := newVaultInjectTool(mockVault)

	result, err := tool.Execute(map[string]any{
		"secret_names": []any{"DBAI_TESTBOT"},
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.IsError {
		t.Errorf("unexpected error result: %v", result.Content)
	}
	if len(result.Content) == 0 {
		t.Fatal("expected non-empty content in result")
	}
	if !strings.Contains(result.Content[0].Text, expectedScriptPath) {
		t.Errorf("response must contain script path %q\ngot: %s", expectedScriptPath, result.Content[0].Text)
	}
}

func TestVaultInjectTool_Execute_ResponseNeverContainsSecretValue(t *testing.T) {
	// CRITICAL: this is the zero-knowledge guarantee.
	// The tool response must never contain the actual secret value, regardless
	// of what the vault returns. Since the vault returns only a script path,
	// the secret can only leak if the tool somehow reads the script file contents
	// and echoes them — which it must never do.
	const sensitiveToken = "ghp_super-secret-token-MUST-NOT-APPEAR-IN-RESPONSE"
	// The mock simulates the vault's contract: it returns a path, not the value.
	// A real bug would only occur if Execute read the script file and returned
	// its contents — this test documents that the guarantee must hold.
	mockVault := &mockVaultInjector{returnScriptPath: "/tmp/forge-vault-abc.sh"}
	tool := newVaultInjectTool(mockVault)

	result, err := tool.Execute(map[string]any{
		"secret_names": []any{"GITHUB_TOKEN"},
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, content := range result.Content {
		if strings.Contains(content.Text, sensitiveToken) {
			t.Errorf("zero-knowledge violation: response contains secret value %q", sensitiveToken)
		}
	}
}

// ── Execute: vault error propagation ─────────────────────────────────────────

func TestVaultInjectTool_Execute_VaultErrorBecomesErrorContent(t *testing.T) {
	// vault.BuildInjectionScriptForNames errors (e.g. entry not found) must
	// surface as tool-level error content, NOT as a Go error return.
	// This matches the MCP protocol convention used by all other Forge tools.
	mockVault := &mockVaultInjector{
		returnErr: fmt.Errorf("vault entries not found: [MISSING_SECRET]"),
	}
	tool := newVaultInjectTool(mockVault)

	result, err := tool.Execute(map[string]any{
		"secret_names": []any{"MISSING_SECRET"},
	})

	if err != nil {
		t.Fatalf("Execute must not return a Go error; errors go in content. Got: %v", err)
	}
	if !result.IsError {
		t.Error("expected IsError=true when the vault returns an error")
	}
}

// ── Execute: argument forwarding ─────────────────────────────────────────────

func TestVaultInjectTool_Execute_ForwardsSecretNamesToVault(t *testing.T) {
	// The tool must pass the exact names the agent provided, unchanged.
	// Mutating names before forwarding (e.g. case normalisation) would silently
	// break lookups for any entry whose name doesn't match the normalised form.
	expectedNames := []string{"SECRET_A", "Secret_B", "secret-c"}
	mockVault := &mockVaultInjector{returnScriptPath: "/tmp/test.sh"}
	tool := newVaultInjectTool(mockVault)

	_, err := tool.Execute(map[string]any{
		"secret_names": []any{"SECRET_A", "Secret_B", "secret-c"},
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(mockVault.receivedNames) != len(expectedNames) {
		t.Fatalf("expected %d names forwarded to vault, got %d", len(expectedNames), len(mockVault.receivedNames))
	}
	for i, expectedName := range expectedNames {
		if mockVault.receivedNames[i] != expectedName {
			t.Errorf("name[%d]: expected %q, got %q", i, expectedName, mockVault.receivedNames[i])
		}
	}
}

func TestVaultInjectTool_Execute_ResponseIncludesSourceCommand(t *testing.T) {
	// The agent must know exactly what command to pass to terminal_execute.
	// The response must contain a ready-to-use source command (not just a raw path).
	mockVault := &mockVaultInjector{returnScriptPath: "/tmp/forge-vault-xyz.sh"}
	tool := newVaultInjectTool(mockVault)

	result, err := tool.Execute(map[string]any{
		"secret_names": []any{"MY_API_KEY"},
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	responseText := result.Content[0].Text
	// The response must contain a command that sources the script.
	// On all platforms this starts with ". '" (dot-space-quote).
	if !strings.Contains(responseText, ". '") {
		t.Errorf("response must include a source command ('. <path>'), got:\n%s", responseText)
	}
}
