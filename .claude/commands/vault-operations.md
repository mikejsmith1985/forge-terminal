# Vault Operations — Zero-Knowledge Agent Secret Injection

This skill governs how agents interact with the Forge Vault. Read every section
before writing any code that involves secrets, credentials, tokens, or API keys.

---

## The Prime Directive

**An agent is a director, not a courier.**

The agent tells the vault WHERE to put a secret. The vault resolves, decrypts,
and delivers the secret directly to the destination. The agent never reads the
plaintext value. The secret never enters the conversation context.

---

## The Three Safe Paths

### Path 1 — vault_inject → terminal_execute (background sessions only)

Use this path when a background terminal session exists (`connectedClients: 0`).

Call the `vault_inject` MCP tool with the vault entry names you need:

```json
{
  "tool": "vault_inject",
  "arguments": {
    "secret_names": ["DBAI_TESTBOT", "OPENAI_KEY"]
  }
}
```

The tool:
1. Resolves names → decrypts values → writes a self-deleting platform script
2. Returns **only the script path and source command** — no plaintext values
3. Script self-deletes after being sourced (< 1 second lifetime)

Follow up with `terminal_execute` to source the script:

```json
{
  "tool": "terminal_execute",
  "arguments": {
    "session_id": "<background-session-id>",
    "command": ". 'C:\\Users\\...\\forge-vault-abc123.ps1'"
  }
}
```

**Critical:** `terminal_execute` requires a background session (`connectedClients: 0`).
If the session has active users watching (`connectedClients > 0`), the tool refuses
with an error — injecting keystrokes into a live terminal is alarming and incorrect.
Call `terminal_sessions` first to find a session where `connectedClients` is 0.

The secrets are now live in the terminal session. The agent never saw their values.

### Path 2 — vault_inject → vault_run_script (no terminal session required)

Use this path when all terminal sessions have active users watching, or when no
terminal session exists at all. This is the safer default for automated agents.

Call `vault_inject` to get the script path (same as Path 1), then call
`vault_run_script` with that path:

```json
{
  "tool": "vault_run_script",
  "arguments": {
    "script_path": "C:\\Users\\...\\forge-vault-abc123.ps1",
    "command": "npx prisma db push"
  }
}
```

The tool:
1. Sources the vault script in a **fresh non-interactive subprocess** (no PTY needed)
2. Optionally runs the `command` in the same subprocess after secrets are loaded
3. Returns combined stdout+stderr — never secret values
4. The vault script self-deletes exactly as it does in Path 1

The `command` field is optional — omit it for "source only" when you just need
the environment variables available to a subsequent tool call in the same session.

### Path 3 — Auto-inject (zero agent involvement, for persistent sessions)

The user opens the Forge Vault UI, finds the entry, and enables "Auto-Inject".
On the next PTY session spawn, Forge injects the values directly into `cmd.Env`
before the shell process starts. No agent action required. Values never appear
in any output or log.

**Use this path for secrets needed in every terminal session** (e.g. a default
API key). Use Path 1 or Path 2 when an agent needs a secret for a one-off task.

---

## What Agents Must NEVER Do

| Forbidden action | Why it is dangerous |
|---|---|
| Ask the user to copy-paste a vault value into the conversation | Secret enters conversation context — logged, potentially cached |
| Call `vault_inject` and then try to read the script file contents | Defeats zero-knowledge guarantee; script is 0600 and self-deletes |
| Call `terminal_execute` on a session with `connectedClients > 0` | Keystrokes appear on screen as typed text — tool now refuses with an error |
| Write a secret received from the user into a file via `file_write` | Secret transits agent context and lands on disk without self-delete |
| Store a secret value in a task description or note | Task descriptions are stored in plaintext in `.forge` state |
| Infer or guess what a secret value might be | Never. If the vault doesn't have it, tell the user to add it. |

---

## Agent Decision Tree for "I need a secret"

```
Need a secret in this task?
    │
    ├── Is the secret already in the Forge Vault UI?
    │       ├── YES → call vault_inject to get the script path
    │       │          │
    │       │          ├── Is there a background session available?
    │       │          │   (terminal_sessions returns a session with connectedClients: 0)
    │       │          │       ├── YES → terminal_execute with the source command
    │       │          │       │          → done (Path 1)
    │       │          │       │
    │       │          │       └── NO  → call vault_run_script with the script path
    │       │          │                  → optionally pass "command" to run after inject
    │       │          │                  → done (Path 2)
    │       │          │
    │       │          └── Is the secret needed in every session long-term?
    │       │                  └── Recommend the user enable Auto-Inject (Path 3)
    │       │
    │       └── NO → tell the user:
    │                  "Please add <SECRET_NAME> to the Forge Vault UI,
    │                   then I will inject it via vault_inject."
    │                  Do NOT ask the user to paste the value here.
    │
    └── Is this a one-off task or a recurring need?
            ├── One-off → use Path 1 or Path 2
            └── Every session → recommend Path 3 (Auto-Inject)
```

---

## vault_inject Tool Reference

| Field | Type | Description |
|---|---|---|
| `secret_names` | `string[]` | Names exactly as shown in the Forge Vault UI. Case-sensitive. |

**Returns:**
- `scriptPath` — absolute path to the self-deleting injection script
- `sourceCommand` — the exact `. '<path>'` command to pass to `terminal_execute`
- Error message (IsError=true) if any name is not found in the vault

**Error cases:**
- `vault is not initialised` — Forge Terminal is not running or vault is locked
- `vault entries not found: [NAME]` — the secret name is not in the vault; ask the user to add it

---

## vault_run_script Tool Reference

| Field | Type | Required | Description |
|---|---|---|---|
| `script_path` | `string` | ✅ | Absolute path to the vault injection script returned by `vault_inject`. |
| `command` | `string` | ❌ | Shell command to run after secrets are loaded into the subprocess environment. |

**Returns:**
- Combined stdout+stderr from the subprocess — never secret values
- Error message (IsError=true) if the subprocess fails to start or exits non-zero

**Platform behaviour:**
- **Windows:** runs `pwsh -NonInteractive -Command "& { . 'script_path'; command }"`
- **Unix/macOS:** runs `sh -c ". 'script_path' && command"`

**Error cases:**
- `vault script runner is not initialised` — Forge Terminal is not running
- `vault script execution failed: ...` — subprocess error; check the included output for details

**Example — inject then migrate:**
```json
{
  "tool": "vault_run_script",
  "arguments": {
    "script_path": "C:\\Users\\...\\forge-vault-abc123.ps1",
    "command": "npx prisma migrate deploy"
  }
}
```

---

## Implementation Notes (for Forge developers)

Both tools are registered in `internal/mcp/server.go`.

**vault_inject** is backed by the `VaultSecretInjector` interface
(`internal/mcp/tools_vault.go`) which `*vault.Vault` satisfies via the
`BuildInjectionScriptForNames` method (`internal/vault/vault.go`).

**vault_run_script** is backed by the `VaultScriptRunner` interface
(`internal/mcp/tools_vault.go`). The production implementation is
`realVaultScriptRunner` (defined in the same file), which shells out to
`pwsh` or `sh` depending on the platform. Tests inject a `mockVaultScriptRunner`
struct — no real subprocess is spawned during unit tests.

Both interfaces are defined in the `mcp` package (the consumer) rather than the
`vault` package so the vault package stays independent of the mcp package — no
import cycle. The single-method interface design makes mock injection trivial.

**The active-session guard** lives in `terminalExecuteTool.Execute`
(`internal/mcp/tools_terminal.go`). It calls
`Handler.GetSessionConnectedClientCount` (`internal/terminal/mcp_bridge.go`)
before writing to the PTY. Sessions where `connectedClients > 0` receive a
descriptive error directing the agent to use `vault_run_script` instead.

The vault injection script is written by `internal/vault/inject.go::BuildInjectionScript`,
which is shared between the MCP path and the existing "Inject Now" UI button.

---

## Standards That Apply

All code written for vault operations is subject to:
- `code-quality` — naming conventions, comment standards
- `forge-workflow` — Phase 3 TDD: write the failing test before implementation
- `branching-strategy` — on a feature branch before the first file edit
- Never expose secret values in MCP tool responses, logs, or `refactor_plan.html`
