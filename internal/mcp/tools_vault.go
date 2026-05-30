// tools_vault.go implements the vault_inject MCP tool.
//
// vault_inject is the zero-knowledge injection path for agents that need
// environment secrets: the agent names the vault entries it needs, the tool
// resolves and writes a self-deleting platform script, and returns only the
// script path. Secret values never appear in the tool's response or conversation
// context — the agent sources the script via terminal_execute instead of
// receiving the plaintext.
package mcp

import (
	"encoding/json"
	"fmt"
	"runtime"
)

// VaultSecretInjector is the interface vault_inject requires from the vault layer.
//
// Defined in the mcp package (the consumer) rather than the vault package so
// that the vault package stays independent of the mcp package — there is no
// import cycle because vault does not import mcp. The single-method interface
// makes mocking trivial in unit tests (see tools_vault_test.go).
type VaultSecretInjector interface {
	// BuildInjectionScriptForNames resolves the named vault entries, writes a
	// self-deleting platform script (PowerShell on Windows, POSIX sh elsewhere)
	// containing their env var assignments, and returns only the absolute path
	// to that script. Secret values never appear in the return value.
	BuildInjectionScriptForNames(secretNames []string) (string, error)
}

// ── vault_inject ─────────────────────────────────────────────────────────────

// vaultInjectTool implements the vault_inject MCP tool.
// It holds a VaultSecretInjector so tests can inject a mock without
// touching the real AES-encrypted vault.
type vaultInjectTool struct {
	vaultAccess VaultSecretInjector
}

// newVaultInjectTool creates a new vault_inject tool backed by the given accessor.
// Passing nil is valid — Execute returns a descriptive error rather than panicking.
func newVaultInjectTool(vaultAccess VaultSecretInjector) ToolHandler {
	return &vaultInjectTool{vaultAccess: vaultAccess}
}

// Definition returns the MCP tool schema for vault_inject.
func (t *vaultInjectTool) Definition() ToolDefinition {
	return ToolDefinition{
		Name: "vault_inject",
		Description: "Inject Forge Vault secrets into the current shell environment without " +
			"exposing their values to the agent or conversation context. " +
			"Provide one or more secret names exactly as they appear in the Forge Vault UI. " +
			"The tool writes a self-deleting platform script (PowerShell on Windows, sh elsewhere) " +
			"and returns a ready-to-use source command — call terminal_execute with that command " +
			"to activate the secrets in the running session. " +
			"NEVER ask the user to copy-paste vault values; use this tool instead.",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"secret_names": {
					"type": "array",
					"items": { "type": "string" },
					"description": "Names of the vault entries to inject, exactly as stored in the Forge Vault UI (e.g. [\"DBAI_TESTBOT\", \"OPENAI_KEY\"]). Names are case-sensitive.",
					"minItems": 1
				}
			},
			"required": ["secret_names"]
		}`),
	}
}

// Execute runs the vault_inject tool.
// It resolves the requested secret names to env vars via the vault, builds a
// self-deleting injection script, and returns the source command the agent
// should pass to terminal_execute. The secret values never appear in the result.
func (t *vaultInjectTool) Execute(args map[string]any) (*CallToolResult, error) {
	if t.vaultAccess == nil {
		return errorContent(
			"Forge Vault is not initialised — ensure Forge Terminal has started and the vault is unlocked before calling vault_inject",
		), nil
	}

	secretNames, parseErr := extractSecretNames(args)
	if parseErr != nil {
		return errorContent(parseErr.Error()), nil
	}

	scriptPath, injectErr := t.vaultAccess.BuildInjectionScriptForNames(secretNames)
	if injectErr != nil {
		return errorContent("vault injection failed: " + injectErr.Error()), nil
	}

	sourceCommand := buildVaultSourceCommand(scriptPath)
	return textContent(buildVaultInjectResponse(scriptPath, sourceCommand, secretNames)), nil
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// extractSecretNames parses and validates the secret_names argument from a
// vault_inject tool call. Returns a typed slice or a descriptive error.
func extractSecretNames(args map[string]any) ([]string, error) {
	rawNames, isPresent := args["secret_names"]
	if !isPresent {
		return nil, fmt.Errorf("secret_names is required")
	}

	nameSlice, isSlice := rawNames.([]any)
	if !isSlice {
		return nil, fmt.Errorf("secret_names must be an array of strings")
	}
	if len(nameSlice) == 0 {
		return nil, fmt.Errorf("secret_names must contain at least one entry name")
	}

	secretNames := make([]string, 0, len(nameSlice))
	for sliceIndex, item := range nameSlice {
		nameStr, isString := item.(string)
		if !isString {
			return nil, fmt.Errorf("secret_names[%d] must be a string, got %T", sliceIndex, item)
		}
		if nameStr == "" {
			return nil, fmt.Errorf("secret_names[%d] must not be empty", sliceIndex)
		}
		secretNames = append(secretNames, nameStr)
	}

	return secretNames, nil
}

// buildVaultSourceCommand returns the platform-appropriate command to source
// the injection script in the active shell session.
// On both Windows (PowerShell) and Unix the dot-source syntax is `. '<path>'`.
func buildVaultSourceCommand(scriptPath string) string {
	if runtime.GOOS == "windows" {
		// PowerShell dot-source: single-quoted path handles spaces and special chars.
		return fmt.Sprintf(". '%s'", scriptPath)
	}
	// POSIX sh dot-source: single-quoted path is safe for any characters except
	// literal single quotes, which BuildInjectionScript already escapes in values.
	return fmt.Sprintf(". '%s'", scriptPath)
}

// buildVaultInjectResponse formats the tool's success message.
// The message tells the agent exactly what to do next without leaking
// any secret values — only the script path and source command are included.
func buildVaultInjectResponse(scriptPath, sourceCommand string, secretNames []string) string {
	namesJSON, _ := json.Marshal(secretNames)
	return fmt.Sprintf(
		"Vault injection script created.\n\n"+
			"Injecting secrets: %s\n"+
			"Script path:       %s\n"+
			"Source command:    %s\n\n"+
			"Call terminal_execute with the source command above to activate the environment "+
			"variables in the running session. The script self-deletes after sourcing — "+
			"secret values never appear in logs, terminal output, or this response.",
		string(namesJSON),
		scriptPath,
		sourceCommand,
	)
}
