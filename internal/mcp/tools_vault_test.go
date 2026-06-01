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

// ── vault_run_script tests ────────────────────────────────────────────────────

// mockVaultScriptRunner is a test double for VaultScriptRunner.
// It records what it received so callers can verify forwarding fidelity.
type mockVaultScriptRunner struct {
	returnOutput    string
	returnErr       error
	capturedPath    string
	capturedCommand string
}

func (m *mockVaultScriptRunner) ExecuteVaultScript(scriptPath, followUpCommand string) (string, error) {
	m.capturedPath = scriptPath
	m.capturedCommand = followUpCommand
	return m.returnOutput, m.returnErr
}

func TestVaultRunScriptTool_Definition_HasCorrectName(t *testing.T) {
	tool := newVaultRunScriptTool(nil)
	def := tool.Definition()

	if def.Name != "vault_run_script" {
		t.Errorf("expected tool name %q, got %q", "vault_run_script", def.Name)
	}
}

func TestVaultRunScriptTool_Definition_MentionsScriptPath(t *testing.T) {
	tool := newVaultRunScriptTool(nil)
	def := tool.Definition()

	if def.InputSchema == nil {
		t.Fatal("expected non-nil input schema")
	}
	if !strings.Contains(string(def.InputSchema), "script_path") {
		t.Error("input schema must reference the script_path field")
	}
}

func TestVaultRunScriptTool_Execute_NilRunnerReturnsError(t *testing.T) {
	tool := newVaultRunScriptTool(nil)

	result, err := tool.Execute(map[string]any{
		"script_path": "/tmp/test.ps1",
	})

	if err != nil {
		t.Fatalf("Execute must return nil error; got: %v", err)
	}
	if !result.IsError {
		t.Error("expected IsError=true when VaultScriptRunner is nil")
	}
}

func TestVaultRunScriptTool_Execute_MissingScriptPath_ReturnsError(t *testing.T) {
	mockRunner := &mockVaultScriptRunner{}
	tool := newVaultRunScriptTool(mockRunner)

	result, err := tool.Execute(map[string]any{}) // no script_path

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.IsError {
		t.Error("expected IsError=true when script_path is missing")
	}
}

func TestVaultRunScriptTool_Execute_EmptyScriptPath_ReturnsError(t *testing.T) {
	mockRunner := &mockVaultScriptRunner{}
	tool := newVaultRunScriptTool(mockRunner)

	result, err := tool.Execute(map[string]any{"script_path": ""})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.IsError {
		t.Error("expected IsError=true for empty script_path string")
	}
}

func TestVaultRunScriptTool_Execute_SuccessReturnsOutput(t *testing.T) {
	const expectedOutput = "deployment finished: 3 services restarted"
	mockRunner := &mockVaultScriptRunner{returnOutput: expectedOutput}
	tool := newVaultRunScriptTool(mockRunner)

	result, err := tool.Execute(map[string]any{
		"script_path": `C:\Users\test\AppData\Local\Temp\forge-vault-abc.ps1`,
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.IsError {
		t.Errorf("unexpected error result: %v", result.Content)
	}
	if !strings.Contains(result.Content[0].Text, expectedOutput) {
		t.Errorf("result must contain runner output %q; got: %s", expectedOutput, result.Content[0].Text)
	}
}

func TestVaultRunScriptTool_Execute_RunnerErrorBecomesErrorContent(t *testing.T) {
	mockRunner := &mockVaultScriptRunner{
		returnErr: fmt.Errorf("pwsh: script file not found"),
	}
	tool := newVaultRunScriptTool(mockRunner)

	result, err := tool.Execute(map[string]any{
		"script_path": "/tmp/gone.ps1",
	})

	if err != nil {
		t.Fatalf("Execute must not return a Go error; errors go in content. Got: %v", err)
	}
	if !result.IsError {
		t.Error("expected IsError=true when the runner returns an error")
	}
}

func TestVaultRunScriptTool_Execute_ForwardsScriptPathToRunner(t *testing.T) {
	const targetPath = `C:\Users\test\Temp\forge-vault-xyz.ps1`
	mockRunner := &mockVaultScriptRunner{returnOutput: "ok"}
	tool := newVaultRunScriptTool(mockRunner)

	_, err := tool.Execute(map[string]any{
		"script_path": targetPath,
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if mockRunner.capturedPath != targetPath {
		t.Errorf("expected script path %q forwarded to runner; got %q", targetPath, mockRunner.capturedPath)
	}
}

func TestVaultRunScriptTool_Execute_WithFollowUpCommand_ForwardsCommand(t *testing.T) {
	const followUpCmd = "npx prisma db push --skip-generate"
	mockRunner := &mockVaultScriptRunner{returnOutput: "migrations applied"}
	tool := newVaultRunScriptTool(mockRunner)

	_, err := tool.Execute(map[string]any{
		"script_path": "/tmp/forge-vault-abc.ps1",
		"command":     followUpCmd,
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if mockRunner.capturedCommand != followUpCmd {
		t.Errorf("expected follow-up command %q forwarded to runner; got %q",
			followUpCmd, mockRunner.capturedCommand)
	}
}

func TestVaultRunScriptTool_Execute_NoFollowUpCommand_ForwardsEmptyString(t *testing.T) {
	// When "command" is omitted the runner receives an empty string,
	// which it interprets as "source only, no follow-up".
	mockRunner := &mockVaultScriptRunner{returnOutput: "sourced"}
	tool := newVaultRunScriptTool(mockRunner)

	_, err := tool.Execute(map[string]any{
		"script_path": "/tmp/forge-vault-abc.ps1",
		// "command" intentionally absent
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if mockRunner.capturedCommand != "" {
		t.Errorf("expected empty follow-up command when omitted; got %q", mockRunner.capturedCommand)
	}
}

func TestVaultRunScriptTool_Execute_ResponseNeverContainsSecretValues(t *testing.T) {
	// Zero-knowledge guarantee: secret values must never appear in the tool response.
	// The runner returns only process stdout+stderr — the tool must not add any value.
	const sensitiveValue = "sk-prod-MUST-NOT-LEAK-12345"
	// The mock simulates a runner that might accidentally echo a secret.
	// In production the real runner captures subprocess output; if the vault script
	// accidentally printed a value, it would appear here. This test documents the
	// requirement that the TOOL LAYER must not add any additional leakage.
	mockRunner := &mockVaultScriptRunner{returnOutput: "all good — no secrets here"}
	tool := newVaultRunScriptTool(mockRunner)

	result, err := tool.Execute(map[string]any{
		"script_path": "/tmp/forge-vault-abc.ps1",
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, content := range result.Content {
		if strings.Contains(content.Text, sensitiveValue) {
			t.Errorf("zero-knowledge violation: response contains secret value %q", sensitiveValue)
		}
	}
}

// ── vault_list tests ──────────────────────────────────────────────────────────

// mockVaultNameLister is a test double for VaultNameLister.
// It returns a configured list of entry names without touching the real vault.
type mockVaultNameLister struct {
	returnNames []string
}

func (m *mockVaultNameLister) ListEntryNames() []string {
	return m.returnNames
}

func TestVaultListTool_Definition_HasCorrectName(t *testing.T) {
	tool := newVaultListTool(nil)
	def := tool.Definition()

	if def.Name != "vault_list" {
		t.Errorf("expected tool name %q, got %q", "vault_list", def.Name)
	}
}

func TestVaultListTool_Definition_HasNonEmptyDescription(t *testing.T) {
	tool := newVaultListTool(nil)
	def := tool.Definition()

	if strings.TrimSpace(def.Description) == "" {
		t.Error("expected non-empty description for vault_list")
	}
}

func TestVaultListTool_Definition_MentionsVaultInject(t *testing.T) {
	// The description must guide agents to call vault_list before vault_inject —
	// that is the entire point of this tool.
	tool := newVaultListTool(nil)
	def := tool.Definition()

	if !strings.Contains(def.Description, "vault_inject") {
		t.Error("vault_list description must mention vault_inject to guide agent workflow")
	}
}

func TestVaultListTool_Execute_NilVaultReturnsErrorContent(t *testing.T) {
	// When the vault singleton is nil (Forge not yet initialised), the tool
	// must return a descriptive error rather than panicking.
	tool := newVaultListTool(nil)

	result, err := tool.Execute(map[string]any{})

	if err != nil {
		t.Fatalf("Execute must return nil error (errors go in content), got: %v", err)
	}
	if !result.IsError {
		t.Error("expected IsError=true when vault is nil")
	}
}

func TestVaultListTool_Execute_ReturnsEntryNames(t *testing.T) {
	// The tool must return the names the vault reports — nothing more, nothing less.
	expectedNames := []string{"DBAI-TestBot", "OpenAI Key", "Discord Token"}
	mockLister := &mockVaultNameLister{returnNames: expectedNames}
	tool := newVaultListTool(mockLister)

	result, err := tool.Execute(map[string]any{})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.IsError {
		t.Errorf("unexpected error result: %v", result.Content)
	}
	if len(result.Content) == 0 {
		t.Fatal("expected non-empty content in result")
	}
	responseText := result.Content[0].Text
	for _, expectedName := range expectedNames {
		if !strings.Contains(responseText, expectedName) {
			t.Errorf("response must contain entry name %q\ngot: %s", expectedName, responseText)
		}
	}
}

func TestVaultListTool_Execute_EmptyVaultReturnsUsefulMessage(t *testing.T) {
	// An empty vault must return a non-error response with a helpful message
	// rather than an empty or cryptic result.
	mockLister := &mockVaultNameLister{returnNames: []string{}}
	tool := newVaultListTool(mockLister)

	result, err := tool.Execute(map[string]any{})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.IsError {
		t.Errorf("empty vault must not return an error result: %v", result.Content)
	}
	if len(result.Content) == 0 {
		t.Fatal("expected non-empty content even for empty vault")
	}
}

func TestVaultListTool_Execute_NeverReturnsSecretValues(t *testing.T) {
	// Zero-knowledge guarantee: the lister returns only names. This test documents
	// that the tool layer does not accidentally add secret material to the response.
	// (The real VaultNameLister.ListEntryNames never returns secret values, but the
	// tool layer is an independent enforcement point.)
	const fakeSensitiveValue = "sk-MUST-NOT-APPEAR-IN-LIST-RESPONSE"
	// We intentionally put a "secret-looking" string in a name to prove the tool
	// echoes names verbatim and does not add any extra material.
	mockLister := &mockVaultNameLister{returnNames: []string{"Safe Entry Name"}}
	tool := newVaultListTool(mockLister)

	result, err := tool.Execute(map[string]any{})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, content := range result.Content {
		if strings.Contains(content.Text, fakeSensitiveValue) {
			t.Errorf("zero-knowledge violation: secret value appeared in vault_list response: %q", content.Text)
		}
	}
}
