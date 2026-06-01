// tools_vault.go implements the vault_inject and vault_run_script MCP tools.
//
// vault_inject is the zero-knowledge injection path for agents that need
// environment secrets: the agent names the vault entries it needs, the tool
// resolves and writes a self-deleting platform script, and returns only the
// script path. Secret values never appear in the tool's response or conversation
// context — the agent sources the script via terminal_execute instead of
// receiving the plaintext.
//
// vault_run_script sources that same script in a fresh non-interactive subprocess,
// bypassing PTY sessions entirely. This is the correct path when all terminal
// sessions have active users watching (connectedClients > 0).
package mcp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"runtime"
	"strings"
	"time"
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
			"To activate the secrets, choose one of:\n"+
			"  A) Call terminal_execute with the source command above (background sessions only — "+
			"connectedClients must be 0).\n"+
			"  B) Call vault_run_script with the script path to source it in a fresh subprocess "+
			"without needing a terminal session at all.",
		string(namesJSON),
		scriptPath,
		sourceCommand,
	)
}

// ── vault_list ────────────────────────────────────────────────────────────────

// VaultNameLister is the interface vault_list requires from the vault layer.
//
// Defined here (the consumer) rather than in the vault package so the vault
// package stays independent of the mcp package — no import cycle. The
// single-method design makes mocking trivial in unit tests.
type VaultNameLister interface {
	// ListEntryNames returns the SecretName of every vault entry. Only names
	// are returned — secret values and UUIDs are never included.
	ListEntryNames() []string
}

// vaultListTool implements the vault_list MCP tool.
// It holds a VaultNameLister so tests can inject a mock without touching
// the real AES-encrypted vault.
type vaultListTool struct {
	vaultLister VaultNameLister
}

// newVaultListTool creates a new vault_list tool backed by the given lister.
// Passing nil is valid — Execute returns a descriptive error rather than panicking.
func newVaultListTool(vaultLister VaultNameLister) ToolHandler {
	return &vaultListTool{vaultLister: vaultLister}
}

// Definition returns the MCP tool schema for vault_list.
func (t *vaultListTool) Definition() ToolDefinition {
	return ToolDefinition{
		Name: "vault_list",
		Description: "List the names of all secrets currently stored in the Forge Vault. " +
			"Call this FIRST to discover available entry names before calling vault_inject — " +
			"this eliminates guessing and the need for users to screenshot the Vault UI. " +
			"Only secret names are returned; values are never included in the response. " +
			"Use the exact name from this list as the secret_names argument to vault_inject.",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {},
			"required": []
		}`),
	}
}

// Execute runs the vault_list tool.
// It returns a human-readable list of all vault entry names — no secrets, no IDs.
// The agent should use the returned names as arguments to vault_inject.
func (t *vaultListTool) Execute(args map[string]any) (*CallToolResult, error) {
	if t.vaultLister == nil {
		return errorContent(
			"Forge Vault is not initialised — ensure Forge Terminal has started and the vault is unlocked before calling vault_list",
		), nil
	}

	entryNames := t.vaultLister.ListEntryNames()
	return textContent(buildVaultListResponse(entryNames)), nil
}

// buildVaultListResponse formats the vault_list success message.
// The names are presented both as a numbered list (human-readable) and
// as a JSON array (machine-parseable) so agents can use either form.
func buildVaultListResponse(entryNames []string) string {
	namesJSON, _ := json.Marshal(entryNames)

	if len(entryNames) == 0 {
		return "Forge Vault contains no entries. Add secrets via the Vault UI before calling vault_inject."
	}

	var responseBuilder strings.Builder
	responseBuilder.WriteString(fmt.Sprintf("Forge Vault contains %d entr", len(entryNames)))
	if len(entryNames) == 1 {
		responseBuilder.WriteString("y")
	} else {
		responseBuilder.WriteString("ies")
	}
	responseBuilder.WriteString(".\n\nEntry names (use these exactly with vault_inject):\n")

	for listIndex, entryName := range entryNames {
		responseBuilder.WriteString(fmt.Sprintf("  %d. %s\n", listIndex+1, entryName))
	}

	responseBuilder.WriteString(fmt.Sprintf("\nJSON array: %s", string(namesJSON)))
	return responseBuilder.String()
}

// ── vault_run_script ──────────────────────────────────────────────────────────

// VaultScriptRunner executes a Forge Vault injection script in a fresh,
// non-interactive subprocess and returns the combined stdout+stderr.
//
// The interface is defined here (the consumer) rather than in the vault package
// so the vault package stays independent of the mcp package — no import cycle.
// A two-field mock struct covers all test scenarios without real process spawning.
type VaultScriptRunner interface {
	// ExecuteVaultScript sources the injection script at scriptPath in a fresh
	// subprocess. If followUpCommand is non-empty it runs in the same subprocess
	// after the script is sourced — useful for deploying or running tools that
	// need the injected secrets available as environment variables.
	// Returns combined stdout+stderr. Secret values must never appear in the
	// return value — the vault script sets env vars, it does not print them.
	ExecuteVaultScript(scriptPath string, followUpCommand string) (string, error)
}

// vaultRunScriptTool implements the vault_run_script MCP tool.
type vaultRunScriptTool struct {
	scriptRunner VaultScriptRunner
}

// newVaultRunScriptTool creates a vault_run_script tool backed by the given runner.
// Passing nil is valid — Execute returns a descriptive error rather than panicking.
func newVaultRunScriptTool(scriptRunner VaultScriptRunner) ToolHandler {
	return &vaultRunScriptTool{scriptRunner: scriptRunner}
}

// Definition returns the MCP tool schema for vault_run_script.
func (t *vaultRunScriptTool) Definition() ToolDefinition {
	return ToolDefinition{
		Name: "vault_run_script",
		Description: "Execute a Forge Vault injection script in a fresh non-interactive subprocess, " +
			"bypassing the need for a terminal session. " +
			"Use this instead of terminal_execute when all terminal sessions have active users watching " +
			"(connectedClients > 0). " +
			"Provide the script_path returned by vault_inject. " +
			"Optionally provide a follow-up command to run in the same subprocess after the secrets " +
			"are loaded — useful for deployment scripts, database migrations, or any tool that needs " +
			"vault secrets as environment variables. " +
			"Secret values are never returned in the tool response.",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"script_path": {
					"type": "string",
					"description": "Absolute path to the vault injection script returned by vault_inject."
				},
				"command": {
					"type": "string",
					"description": "Optional shell command to run after the vault secrets are loaded into the subprocess environment (e.g. \"npm run deploy\" or \"npx prisma db push\")."
				}
			},
			"required": ["script_path"]
		}`),
	}
}

// Execute runs the vault_run_script tool.
// It sources the vault script in a fresh subprocess and optionally runs a
// follow-up command in the same subprocess. Secret values never appear in
// the result — only process stdout+stderr output is returned.
func (t *vaultRunScriptTool) Execute(args map[string]any) (*CallToolResult, error) {
	if t.scriptRunner == nil {
		return errorContent(
			"vault script runner is not initialised — ensure Forge Terminal has started before calling vault_run_script",
		), nil
	}

	scriptPath, followUpCommand, parseErr := parseRunScriptArgs(args)
	if parseErr != nil {
		return errorContent(parseErr.Error()), nil
	}

	combinedOutput, runErr := t.scriptRunner.ExecuteVaultScript(scriptPath, followUpCommand)
	if runErr != nil {
		return errorContent("vault script execution failed: " + runErr.Error()), nil
	}

	return textContent(buildRunScriptResponse(combinedOutput, followUpCommand)), nil
}

// ── vault_run_script helpers ─────────────────────────────────────────────────

// parseRunScriptArgs extracts and validates the arguments for vault_run_script.
func parseRunScriptArgs(args map[string]any) (scriptPath string, followUpCommand string, err error) {
	rawPath, isPresent := args["script_path"]
	if !isPresent {
		return "", "", fmt.Errorf("script_path is required")
	}
	scriptPath, isString := rawPath.(string)
	if !isString || scriptPath == "" {
		return "", "", fmt.Errorf("script_path must be a non-empty string")
	}

	// "command" is optional — empty string means source-only (no follow-up).
	if rawCmd, hasCmd := args["command"]; hasCmd {
		if cmdStr, isStr := rawCmd.(string); isStr {
			followUpCommand = cmdStr
		}
	}

	return scriptPath, followUpCommand, nil
}

// buildRunScriptResponse formats the vault_run_script success message.
// The combined output from the subprocess is included verbatim; no secret
// values are added by the tool layer (the script itself does not print them).
func buildRunScriptResponse(combinedOutput string, followUpCommand string) string {
	if followUpCommand == "" {
		return fmt.Sprintf(
			"Vault script sourced successfully in a fresh subprocess.\n\n"+
				"Subprocess output:\n%s",
			combinedOutput,
		)
	}
	return fmt.Sprintf(
		"Vault script sourced and follow-up command executed in a fresh subprocess.\n\n"+
			"Command: %s\n\nSubprocess output:\n%s",
		followUpCommand,
		combinedOutput,
	)
}

// ── realVaultScriptRunner ─────────────────────────────────────────────────────

const (
	// vaultScriptDefaultTimeoutSec is the subprocess timeout when no override is given.
	// 120 seconds covers most deployment steps and database migrations.
	vaultScriptDefaultTimeoutSec = 120
)

// realVaultScriptRunner is the production VaultScriptRunner.
// It spawns a platform-appropriate shell to source the vault script and
// optionally run a follow-up command in the same subprocess.
type realVaultScriptRunner struct{}

// ExecuteVaultScript sources the vault injection script at scriptPath in a fresh
// non-interactive subprocess and returns the combined stdout+stderr output.
// The subprocess self-destructs after the script deletes itself (via Remove-Item
// on Windows or rm on Unix). Secret values are never captured — the vault script
// sets $env: variables, it does not echo them.
func (r *realVaultScriptRunner) ExecuteVaultScript(scriptPath string, followUpCommand string) (string, error) {
	ctx, cancelCtx := context.WithTimeout(
		context.Background(),
		vaultScriptDefaultTimeoutSec*time.Second,
	)
	defer cancelCtx()

	shellBinary, shellArgs := buildVaultSubprocessArgs(scriptPath, followUpCommand)

	subproc := exec.CommandContext(ctx, shellBinary, shellArgs...)

	var combinedOutputBuf bytes.Buffer
	subproc.Stdout = &combinedOutputBuf
	subproc.Stderr = &combinedOutputBuf

	if runErr := subproc.Run(); runErr != nil {
		// Include any output produced before the failure — it often contains the
		// error message from the shell or the follow-up command.
		outputSoFar := combinedOutputBuf.String()
		return "", fmt.Errorf("%w\nsubprocess output:\n%s", runErr, outputSoFar)
	}

	return combinedOutputBuf.String(), nil
}

// buildVaultSubprocessArgs returns the binary and argument list for spawning the
// appropriate shell on the current platform.
//
// Windows: pwsh -NonInteractive -Command "& { . 'script'; follow-up }"
// Unix:    sh -c ". 'script' && follow-up" (or just ". 'script'" for source-only)
//
// The & { } invocation block on Windows ensures the dot-source sets $env: vars
// in the same scope as the follow-up command, and $PSCommandPath inside the
// script resolves correctly so the self-delete fires.
func buildVaultSubprocessArgs(scriptPath string, followUpCommand string) (shellBinary string, shellArgs []string) {
	if runtime.GOOS == "windows" {
		return buildWindowsSubprocessArgs(scriptPath, followUpCommand)
	}
	return buildUnixSubprocessArgs(scriptPath, followUpCommand)
}

// buildWindowsSubprocessArgs builds the pwsh invocation for Windows.
func buildWindowsSubprocessArgs(scriptPath string, followUpCommand string) (string, []string) {
	// Single-quote the script path to handle spaces; escape embedded single quotes
	// by doubling them (PowerShell convention).
	safeScriptPath := strings.ReplaceAll(scriptPath, "'", "''")

	var psCommandBuilder strings.Builder
	psCommandBuilder.WriteString(fmt.Sprintf("& { . '%s'", safeScriptPath))
	if followUpCommand != "" {
		psCommandBuilder.WriteString("; ")
		psCommandBuilder.WriteString(followUpCommand)
	}
	psCommandBuilder.WriteString(" }")

	return "pwsh", []string{"-NonInteractive", "-Command", psCommandBuilder.String()}
}

// buildUnixSubprocessArgs builds the sh invocation for Unix-like systems.
func buildUnixSubprocessArgs(scriptPath string, followUpCommand string) (string, []string) {
	// Single-quote the script path; escape embedded single quotes using the
	// POSIX 'before'"'"'after' technique.
	safeScriptPath := strings.ReplaceAll(scriptPath, "'", "'\"'\"'")

	var shCommandBuilder strings.Builder
	shCommandBuilder.WriteString(fmt.Sprintf(". '%s'", safeScriptPath))
	if followUpCommand != "" {
		shCommandBuilder.WriteString(" && ")
		shCommandBuilder.WriteString(followUpCommand)
	}

	return "sh", []string{"-c", shCommandBuilder.String()}
}
