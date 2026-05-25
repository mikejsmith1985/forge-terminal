# Adaptive Build Environments: MCP Tool Exposure Gap

## Status: PARTIALLY IMPLEMENTED

The `adaptive-build-environments` feature is **fully implemented in Go** but **not exposed** in Copilot CLI sessions outside Forge Terminal itself.

---

## What's Implemented ✅

### 1. Go MCP Tools (Production-Ready)
- **`internal/mcp/tools_environment.go`** — Two complete MCP tool handlers:
  - `environment_detect` — Probes host for WSL2/Docker availability
  - `environment_run` — Executes commands in native/WSL2/Docker/auto environments
- **`internal/mcp/environment_runner.go`** — Platform-specific execution logic
  - Windows: WSL2 and Docker support with path translation
  - Unix: Native execution fallback
- **`internal/mcp/tools_environment_test.go`** — 10+ comprehensive unit tests

### 2. Tool Registration (Production-Ready)
- Registered in `internal/mcp/server.go` lines 326-327 within `buildToolRegistry()`
- Part of the standard MCP tool list exposed by Forge's HTTP server
- Can be called directly via `server.ExecuteTool("environment_detect", args)` in Go code
- Tests verify tool is callable and returns structured JSON

### 3. Skill Documentation (Complete)
- `.github/skills/adaptive-build-environments/SKILL.md` — 215 lines of detailed guidance
- Describes the preferred PTY-first approach using `terminal_sessions`/`terminal_execute`
- Documents fallback to `environment_run` for background execution
- Includes worked examples (RLL/OpenNext case)

---

## What's NOT Exposed ❌

### Problem 1: Copilot CLI Does Not List These Tools

When the user runs Copilot CLI outside of Forge Terminal's active session, these tools are **not** in the available tool list:
- Missing: `forge-vault-environment_detect`
- Missing: `forge-vault-environment_run`

**Why?** The Copilot CLI tool definitions are baked into the CLI binary, not fetched from Forge's MCP server. They are static definitions. The Forge MCP server implements the tools, but there's no mechanism to advertise new tools back to the Copilot CLI.

### Problem 2: No MCP Server Configuration in Copilot CLI Config

The Copilot CLI would need to be configured with:
1. **MCP server URL** for forge-terminal's MCP endpoint
2. **Authentication token** from `~/.forge/mcp-token`
3. **Tool registration** so `environment_detect` and `environment_run` are presented as callable

Currently, Copilot CLI is wired to use only:
- GitHub's native MCP servers (for code search, etc.)
- Tools implemented directly in the CLI binary

### Problem 3: Session Context Lost

When Copilot CLI starts a session:
1. It reads `AGENTS.md` (if present)
2. It loads skills from `.github/skills/`
3. But the skills are **static documentation**, not executable code
4. The `adaptive-build-environments/SKILL.md` file tells agents to call `environment_detect` and `environment_run`
5. But those tools don't exist in the Copilot CLI tool namespace — they're only in the Forge MCP server

---

## The Root Issue

**Skill files are aspirational documentation, not capability declarations.**

A `.github/skills/adaptive-build-environments/SKILL.md` file **reads** like the tools are available:

```
Call `environment_detect` before doing anything else...
Once you know what's available, call `environment_run`...
```

But Copilot CLI has no way to know if those tools actually exist. It doesn't:
- Query the Forge MCP server for available tools
- Auto-discover MCP endpoints from the project
- Dynamically load tools at session start

---

## Solutions (In Order of Feasibility)

### Option A: Expose Forge's MCP Server to Copilot CLI (Recommended)

**What:**
1. Copilot CLI detects that Forge Terminal is running locally
2. Queries Forge's MCP server at startup (using token from `~/.forge/mcp-token`)
3. Dynamically registers `environment_detect` and `environment_run` in the tool list
4. Makes those tools available to agents in all sessions

**Implementation:**
- Add `.forge/mcp-server-address` file (or environment variable) that Copilot CLI reads
- Add an init step in Copilot CLI to query `GET /api/mcp` from Forge
- Dynamically add those tools to the session's available tools

**Pros:**
- One-time wiring; works for all Copilot CLI sessions
- Agents can seamlessly call environment-based tools
- No config needed per-project — it's automatic

**Cons:**
- Requires Copilot CLI changes (outside this repo)
- Depends on Forge running when CLI starts
- Need robust fallback if Forge is not running

### Option B: Create Static Tool Stubs in Copilot CLI Config

**What:**
1. Create a new config file in `.github/` that declares available MCP servers
2. Copilot CLI reads this config and registers tools statically
3. Tools forward requests to the Forge MCP server via HTTP

**Implementation:**
- New file: `.github/copilot-mcp-servers.json`
  ```json
  {
    "servers": [
      {
        "name": "forge-terminal",
        "type": "http",
        "url": "http://localhost:1970/api/mcp",
        "tokenFile": "~/.forge/mcp-token"
      }
    ]
  }
  ```

**Pros:**
- Requires no changes to Copilot CLI
- Can be checked into the repo
- Clear declaration of external dependencies

**Cons:**
- Copilot CLI would still need to *read* this file (and HTTP-bridge the tools)
- Tight coupling to Forge's HTTP server location
- Still requires Forge to be running

### Option C: Inline Tool Implementations in Copilot CLI Tool Definitions

**What:**
1. Ship `environment_detect` and `environment_run` as static tool definitions in Copilot CLI
2. These tools spawn `wsl.exe`, `docker`, or execute native commands directly
3. No dependency on Forge MCP server — the CLI does it itself

**Implementation:**
- Add tool definitions to Copilot CLI's tool registry (not Forge Terminal's responsibility)
- These would be duplicates of what Forge already implements

**Pros:**
- Works everywhere; no Forge dependency
- Can be tested in isolation

**Cons:**
- Code duplication (Forge has these in Go, Copilot CLI in its language)
- Maintenance burden — any fix needs to go to two places
- Doesn't teach Copilot CLI about Forge's MCP server

### Option D: Create a Standalone CLI Tool Wrapper

**What:**
1. Create a new executable: `forge-env-wrapper.exe` or `forge-env`
2. This tool exposes the same interface as `environment_run` (JSON args in, JSON out)
3. Agents call it via shell: `forge-env --command "npm run build" --environment auto`
4. Returns structured JSON

**Implementation:**
- Go binary that wraps the existing `environment_runner.go` logic
- Agents invoke it from the terminal or via a generic "run-command" tool

**Pros:**
- Works without Forge running (if tool is in PATH)
- Self-contained; no CLI changes needed
- Can be called from any environment

**Cons:**
- Agents must invoke it as a shell command, not an MCP tool
- Loses first-class integration with Copilot CLI
- Requires agents to parse JSON from stdout

---

## Recommended Path Forward

### Phase 1: Immediate (This Session)
1. **Document the gap** (you're reading it)
2. **Explain to agents** that `environment_detect` and `environment_run` are not available as MCP tools in Copilot CLI — fall back to using `terminal_sessions` / `terminal_execute` (the PTY-first approach outlined in the SKILL.md)
3. **Update `.github/skills/adaptive-build-environments/SKILL.md`** to clarify:
   - ✅ These tools ARE available when called from **inside Forge Terminal's session**
   - ✅ These tools ARE available when **running Forge's MCP server** (e.g., from other MCP clients)
   - ❌ These tools are NOT available in **standalone Copilot CLI sessions** (outside Forge)
   - ✅ **Workaround**: Use `terminal_sessions` + `terminal_execute` (PTY-first) in standalone sessions

### Phase 2: Medium Term
1. **Implement Option A** — Make Copilot CLI query Forge's MCP server
   - Requires changes to Copilot CLI (may be out of scope for this repo)
   - Would make `environment_detect` / `environment_run` available in all CLI sessions
2. **Test end-to-end**: Copilot CLI session can detect Forge and use environment tools

### Phase 3: Long Term (If Option A is Blocked)
- **Implement Option C** — Ship `environment_detect` / `environment_run` as native Copilot CLI tools
- **Implement Option D** — Create a standalone `forge-env` wrapper CLI for use in any shell

---

## Verification Checklist

- [ ] Confirm Go tools are built and registered: `go test ./internal/mcp/...` ✅ (Already passing)
- [ ] Confirm Forge MCP server exposes tools: `curl http://localhost:1970/api/mcp -H "Authorization: Bearer $(cat ~/.forge/mcp-token)"`
- [ ] Confirm Copilot CLI does NOT list them: Launch new CLI session, ask for tool list
- [ ] Confirm workaround works: Use `terminal_sessions` + `terminal_execute` to run builds in WSL
- [ ] Update SKILL.md with clarifications and workaround path
- [ ] Add test case to `tools_environment_test.go` verifying tool is in the registry

---

## Current Usage (Workaround Until Option A Implemented)

**Inside Forge Terminal sessions:**
```powershell
# These work because Forge's MCP server is running
forge-vault-environment_detect
forge-vault-environment_run --command "npm run build" --environment auto
```

**Outside Forge (in standalone Copilot CLI):**
```powershell
# These tools are NOT available. Use PTY-first approach instead:
# 1. List active Forge sessions
forge-vault-terminal_sessions

# 2. Pick a session
# 3. Execute build command inside that session
forge-vault-terminal_execute --session_id <id> --command "wsl -e bash -c 'cd /mnt/c/ProjectsWin/MyProject && npm run build'"
```

---

## Files Affected

**Implemented but not exposed:**
- `internal/mcp/tools_environment.go` — 213 lines, fully tested
- `internal/mcp/environment_runner.go` — 500+ lines (platform-specific logic)
- `internal/mcp/environment_runner_windows.go` — Windows-specific process creation
- `internal/mcp/environment_runner_unix.go` — Unix stub
- `internal/mcp/tools_environment_test.go` — 321 lines of tests

**Documentation:**
- `.github/skills/adaptive-build-environments/SKILL.md` — Needs updates for clarity

**Will need changes:**
- Copilot CLI tool registry (outside this repo) — Option A
- Or `.github/copilot-mcp-servers.json` — Option B
- Or Copilot CLI implementation of the tools — Option C

---

## Decision Point

**For the user**: Which path would you prefer?

A. **Wait for Copilot CLI integration** — MCP server auto-discovery (best UX, requires CLI changes)
B. **Document the limitation** — Update SKILL.md with clear warnings + PTY-first workaround
C. **Create standalone tool** — `forge-env` CLI wrapper (usable anywhere, less integrated)
D. **Accept partial exposure** — Use tools only inside Forge Terminal, not from CLI

---

## Summary

✅ **The feature works perfectly inside Forge Terminal.**

❌ **The feature is not accessible from standalone Copilot CLI sessions** because:
- Skill files are documentation, not capability declarations
- Copilot CLI doesn't query Forge's MCP server for available tools
- The tools exist in Forge but not in the CLI's tool namespace

**Workaround now**: Use `terminal_sessions` + `terminal_execute` (PTY-first) instead of `environment_run` in standalone sessions.

**Fix later**: Integrate Forge's MCP server discovery into Copilot CLI (Option A) or ship the tools natively in the CLI (Option C).
