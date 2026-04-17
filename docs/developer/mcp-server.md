# Forge Terminal MCP Server

Forge Terminal exposes its terminal, file, and workflow capabilities as an [MCP](https://modelcontextprotocol.io) (Model Context Protocol) server. This lets any MCP-capable AI client — VS Code GitHub Copilot, Cursor, Claude Code, or EZTest — call Forge tools directly.

## Why this matters if you already use Copilot

If Copilot is already your main builder, MCP is not about replacing it. It is about letting a second AI tool work through the **same live Forge workspace** instead of forcing you to copy files and terminal output into another app by hand.

In practice, that means:

- **Copilot can stay your primary implementation partner** inside Forge or VS Code
- **Gemini, Claude, or another MCP client can inspect the same repo** through Forge when you want a second opinion
- **You can split roles across models** — for example, let Copilot drive the fix while Gemini gives an independent debugging pass or architecture review
- **You avoid copy-paste context loss** because both tools are reading the same workspace through Forge

### Concrete example: Copilot + Gemini

**Before MCP**

You ask Copilot to debug a flaky React flow. If the answer is incomplete, your fallback is usually to re-prompt Copilot or manually paste files, logs, and terminal output into Gemini.

**After MCP**

You still use Copilot as the main builder. At the same time, Gemini connects to Forge through MCP, reads the same files, and inspects the same project context. Now you can ask Gemini for a second-pass explanation like:

> "Review the same failing flow Forge is working on. Do you see a root cause or edge case Copilot might be missing?"

This is where the "superpower" shows up: not in magic new features, but in giving multiple models access to the same live workspace so they can complement each other instead of working from stale copy-pasted snippets.

> **When not to bother:** If Copilot already gets you to done quickly and you rarely need a second opinion, adding another AI client may create more setup and context-switching than value.

## Transport

**Streamable HTTP** at `POST /api/mcp`  
Tool discovery at `GET /api/mcp`  
Task status at `GET /api/mcp/tasks/{id}`

## Authentication

Every request must include:

```
Authorization: Bearer <token>
```

The token is auto-generated on first startup and stored at `~/.forge/mcp-token` with `0600` permissions. Read it once to configure your clients:

```bash
cat ~/.forge/mcp-token
```

> **Security:** The token is never stored in `forge.toml` or any project file. Do not commit it to version control.

---

## Available Tools

| Tool | Description |
|------|-------------|
| `terminal_sessions` | List all active PTY sessions (IDs, status, client count) |
| `terminal_execute` | Run a shell command in a session and return output |
| `terminal_read` | Read the scrollback buffer of a session (up to 64 KiB) |
| `file_read` | Read a file inside the project root (1 MiB cap) |
| `file_write` | Write content to a file inside the project root |
| `file_list` | List directory contents |
| `task_submit` | Submit an agent task (replaces `.forge/pending-tasks/` file drop) |
| `workflow_status` | Run a workflow compliance scan and return the report |

> **Not exposed:** Vault secrets, raw PTY WebSocket, internal diagnostics.

---

## VS Code / GitHub Copilot Chat Setup

Add to `.vscode/settings.json` (or User Settings):

```json
{
  "mcp.servers": {
    "forge": {
      "type": "http",
      "url": "http://localhost:3005/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN_HERE"
      }
    }
  }
}
```

Replace `YOUR_TOKEN_HERE` with the contents of `~/.forge/mcp-token`.

---

## Cursor Setup

In Cursor's MCP settings, add:

```json
{
  "forge": {
    "url": "http://localhost:3005/api/mcp",
    "transport": "http",
    "headers": {
      "Authorization": "Bearer YOUR_TOKEN_HERE"
    }
  }
}
```

---

## EZTest Integration

EZTest delivers bug reports to Forge Terminal via MCP (priority 1), falling back to webhook then file drop. Configure via `.env`:

```env
EZTEST_FORGE_MCP_URL=http://localhost:3005/api/mcp
EZTEST_FORGE_MCP_TOKEN=<paste from ~/.forge/mcp-token>
```

When MCP is configured, EZTest calls `task_submit` with `type: "bug-report"` and receives a task ID immediately. The Forge agent loop picks up the task from the in-memory broker — no file polling required.

---

## Tool Reference

### `terminal_execute`

Runs a command in a PTY session and returns the output.

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "terminal_execute",
    "arguments": {
      "session_id": "abc123",
      "command": "npm test",
      "timeout_seconds": 15
    }
  }
}
```

- `timeout_seconds`: 1–30 (default: 3)
- Output is capped at 50 KiB

### `task_submit`

Submits an agent task. Returns a task ID for status polling.

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "task_submit",
    "arguments": {
      "type": "bug-report",
      "payload": "## Bug\n...",
      "source": "eztest-mcp"
    }
  }
}
```

Check status:
```
GET /api/mcp/tasks/{taskId}
Authorization: Bearer <token>
```

### `file_write`

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "file_write",
    "arguments": {
      "path": "src/components/Button.tsx",
      "content": "// fixed version..."
    }
  }
}
```

Paths outside the project root are rejected with an error.

---

## Security Notes

1. **Auth is MCP-specific.** The `Authorization: Bearer` header is checked by the MCP server before any tool is dispatched. The standard Forge auth middleware is NOT applied to `/api/mcp` — they use independent token mechanisms.
2. **Path traversal protection.** `file_read`, `file_write`, and `file_list` reject any path that resolves outside the server's working directory.
3. **Output caps.** `terminal_execute` caps at 50 KiB; `file_read` caps at 1 MiB. Prevents context-window flooding.
4. **No vault access.** Vault secrets are never exposed via MCP. There is no tool for reading or writing vault entries.

---

## Architecture

```
MCP Client (VS Code / Cursor / EZTest)
        │  POST /api/mcp
        │  Authorization: Bearer <token>
        ▼
cmd/forge/handlers_mcp.go
        │  initMCPServer() at startup
        ▼
internal/mcp/server.go (JSON-RPC dispatcher)
        │  tool registry → ToolHandler.Execute()
        ├─→ tools_terminal.go (terminal_sessions, terminal_execute, terminal_read)
        │        └─→ internal/terminal/mcp_bridge.go (Handler.ListActiveSessions etc.)
        ├─→ tools_files.go (file_read, file_write, file_list)
        ├─→ tools_tasks.go (task_submit)
        │        └─→ internal/mcp/tasks.go (TaskBroker channel queue)
        └─→ tools_workflow.go (workflow_status)
                 └─→ internal/workflow/compliance.go (ScanCompliance)
```

The **TaskBroker** in `internal/mcp/tasks.go` is a buffered channel queue. When `task_submit` is called, it assigns a UUID, stores the task in an in-memory map, and sends it on the `incoming` channel. The Forge agent loop reads from `broker.Incoming()` to process tasks.
