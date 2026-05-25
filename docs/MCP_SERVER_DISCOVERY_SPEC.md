# MCP Server Discovery Specification for Copilot CLI

## Overview

This document specifies how Copilot CLI should discover and integrate with Forge Terminal's MCP server, enabling dynamic tool registration of `environment_detect` and `environment_run` without hardcoding them into the CLI binary.

---

## Use Case

**Today**: Copilot CLI has no knowledge of Forge Terminal's MCP server. Agents cannot use `environment_detect` or `environment_run` even though they're fully implemented and production-ready.

**After Option A**: When Copilot CLI starts a new session:
1. It reads a discovery file from the project
2. Discovers that Forge Terminal is running locally
3. Queries Forge's MCP server for available tools
4. Dynamically registers those tools in the session
5. Agents can seamlessly call `environment_detect`, `environment_run`, etc.

---

## Discovery Protocol

### Step 1: Copilot CLI Detects Forge Terminal is Running (On Windows)

At session startup, Copilot CLI checks:

```powershell
# Windows: Check if Forge Terminal binary is running
Get-Process forge* -ErrorAction SilentlyContinue | Where-Object { $_.Name -match "forge|fterm" }
```

**What we provide**: The Forge MCP server listens on a well-known port (default `1970`) on `localhost`.

**What Copilot CLI must do**: Check if a process matching `forge*` or `fterm*` is running.

### Step 2: Copilot CLI Reads MCP Server Configuration

Copilot CLI checks for a discovery config file in the project:

#### **File: `.forge/mcp-server.json`** (Created by Forge on startup)

```json
{
  "version": "1.0",
  "mcp_server": {
    "type": "http",
    "url": "http://localhost:1970/api/mcp",
    "protocol_version": "2024-11-05",
    "auth": {
      "type": "bearer",
      "token_file": "~/.forge/mcp-token"
    },
    "available_tools": [
      "environment_detect",
      "environment_run",
      "terminal_sessions",
      "terminal_execute",
      "file_read",
      "file_write",
      "file_list",
      "workflow_status",
      "workflow_gate_record",
      "workflow_preflight_check"
    ]
  },
  "discovery": {
    "timestamp": "2026-05-25T06:58:19Z",
    "forge_version": "3.12.16",
    "process_id": 12345
  }
}
```

**What Forge provides**: Writes this file on every startup (or hot-reload).

**What Copilot CLI must do**:
1. Check if `~/.forge/mcp-server.json` exists
2. Parse it to get the MCP server URL and auth token
3. Verify the Forge process is still running (via PID check)

### Step 3: Copilot CLI Queries MCP Server's Tool List

Copilot CLI makes an HTTP GET request:

```http
GET /api/mcp HTTP/1.1
Host: localhost:1970
Authorization: Bearer <token-from-~/.forge/mcp-token>
Accept: application/json
```

Response (standard MCP `tools/list`):

```json
{
  "tools": [
    {
      "name": "environment_detect",
      "description": "Reports which Linux execution environments (WSL2, Docker) are available...",
      "inputSchema": {
        "type": "object",
        "properties": {},
        "required": []
      }
    },
    {
      "name": "environment_run",
      "description": "Run a shell command in the specified environment (native, linux-wsl, linux-docker, or auto)...",
      "inputSchema": {
        "type": "object",
        "properties": {
          "command": { "type": "string" },
          "environment": { "type": "string", "enum": ["auto", "native", "linux-wsl", "linux-docker"] },
          "cwd": { "type": "string" },
          "image": { "type": "string" },
          "timeout_seconds": { "type": "number" }
        },
        "required": ["command"]
      }
    },
    ...
  ]
}
```

**What Forge provides**: Already implemented in `internal/mcp/server.go` — the `GET /api/mcp` endpoint returns this.

**What Copilot CLI must do**:
1. Parse the response
2. Register each tool in the session's available tools
3. Set up an HTTP bridge for each tool (see Step 4)

### Step 4: Copilot CLI Bridges Tool Calls to Forge's MCP Server

When an agent calls `environment_detect`, Copilot CLI:

1. **Intercepts** the tool call
2. **Prepares** the MCP `tools/call` request:
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "tools/call",
     "params": {
       "name": "environment_detect",
       "arguments": {}
     }
   }
   ```
3. **POSTs** to `http://localhost:1970/api/mcp` with Authorization header
4. **Parses** the response and returns it to the agent

**What Forge provides**: The MCP server already implements `tools/call` (line 224 in `server.go`).

**What Copilot CLI must do**: Implement the HTTP bridge for discovered tools.

---

## Files & Configuration

### Forge Terminal (In-Repo Changes)

#### 1. **`.forge/mcp-server.json`** — Auto-Generated on Startup
**Location**: `~/.forge/mcp-server.json` (user's home directory)

**Responsibility**: `cmd/forge/handlers.go` or startup logic writes this file whenever the MCP server starts.

**Schema**:
```json
{
  "version": "1.0",
  "mcp_server": {
    "type": "http",
    "url": "http://localhost:1970/api/mcp",
    "protocol_version": "2024-11-05",
    "auth": {
      "type": "bearer",
      "token_file": "~/.forge/mcp-token"
    },
    "available_tools": [...]
  },
  "discovery": {
    "timestamp": "ISO8601",
    "forge_version": "X.Y.Z",
    "process_id": 12345
  }
}
```

#### 2. **Update SKILL.md** — Document MCP Server Discovery
Update `.github/skills/adaptive-build-environments/SKILL.md` to explain:
- ✅ Tools are auto-discovered when Forge is running
- ✅ Copilot CLI will automatically have access to `environment_detect` and `environment_run`
- ✅ No manual setup required
- ✅ If Forge is not running, fall back to PTY-first approach

#### 3. **Verify HTTP Endpoints**
Ensure these endpoints are working:
- `GET /api/mcp` — Returns tool list (already implemented)
- `POST /api/mcp` — Handles `tools/call` (already implemented)
- Both require bearer token from `~/.forge/mcp-token` (already implemented)

### Copilot CLI (Out-of-Repo Changes)

These changes would be made to the Copilot CLI repository:

#### 1. **Discovery Logic** (Startup Sequence)
```
Session Start
  ↓
Check if Forge process is running (Windows: Get-Process forge*)
  ├─ Yes → Read ~/.forge/mcp-server.json
  │        Validate PID matches running process
  │        Query http://localhost:1970/api/mcp
  │        Register discovered tools
  │        ✅ Tools now available in session
  │
  └─ No → Skip MCP discovery
           ✅ Session continues normally (no Forge tools)
```

#### 2. **HTTP Bridge for Tools**
When agent calls a tool that came from Forge's MCP server:
```
Agent: "Call environment_detect"
  ↓
CLI: Lookup tool → "from Forge MCP server"
  ↓
CLI: POST to http://localhost:1970/api/mcp
     {
       "method": "tools/call",
       "params": { "name": "environment_detect", "arguments": {} }
     }
  ↓
Forge MCP: Process request → Return result
  ↓
CLI: Return result to agent
```

#### 3. **Error Handling**
- **Forge not running**: Silently skip discovery; continue without tools
- **MCP server unreachable**: Log warning, fall back to standard tools
- **Invalid token**: Log error; user can check `~/.forge/mcp-token`
- **Tool call fails**: Return error content to agent (same as any other tool)

#### 4. **Configuration** (Optional Copilot CLI Setting)
```toml
# ~/.copilot/config.toml (hypothetical)
[mcp]
enable_forge_discovery = true    # default: true
forge_port = 1970                # default: 1970
timeout_seconds = 5              # timeout for discovery queries
```

---

## Implementation Checklist

### Forge Terminal (This Repository) ✓ IN-SCOPE

- [ ] Write `~/.forge/mcp-server.json` on MCP server startup
  - File: `cmd/forge/main.go` or new `internal/mcp/discovery.go`
  - Timing: After `auth.LoadOrCreateToken()`
  - Content: Use `internal/mcp/server.go:buildToolList()` to populate available tools

- [ ] Ensure `GET /api/mcp` endpoint works correctly
  - Already implemented: `server.go:handleDiscovery()`
  - Test: Manually curl it

- [ ] Ensure `POST /api/mcp` endpoint handles `tools/call`
  - Already implemented: `server.go:handleToolsCall()`
  - Test: Manually test a tool call

- [ ] Update `.github/skills/adaptive-build-environments/SKILL.md`
  - Document that tools are auto-discovered
  - Explain the discovery flow
  - Mention fallback to PTY-first if Forge not running

- [ ] Update `.github/skills/workflow-enforcer/SKILL.md` (if needed)
  - Note that adaptive-build-environments is now available when Forge is running

- [ ] Create this document (`docs/MCP_SERVER_DISCOVERY_SPEC.md`)
  - ✓ Already done

- [ ] Create integration tests
  - Test file: `internal/mcp/discovery_test.go` (new)
  - Verify config file is written correctly
  - Verify HTTP endpoints respond correctly

### Copilot CLI (External Repository) ❌ OUT-OF-SCOPE FOR THIS SESSION

- [ ] Implement discovery logic at session startup
- [ ] Parse `~/.forge/mcp-server.json`
- [ ] Query `GET /api/mcp` from Forge
- [ ] Implement HTTP bridge for tool calls
- [ ] Add error handling and fallbacks
- [ ] Document in Copilot CLI README/wiki

---

## Testing Discovery Locally

### Manual Test (In Forge Terminal)

1. **Start Forge Terminal** — MCP server starts automatically
2. **Check discovery file exists**:
   ```powershell
   Get-Content ~/.forge/mcp-server.json | ConvertFrom-Json
   ```
3. **Query the MCP server directly**:
   ```powershell
   $token = Get-Content ~/.forge/mcp-token
   $headers = @{ "Authorization" = "Bearer $token" }
   Invoke-WebRequest -Uri "http://localhost:1970/api/mcp" -Headers $headers | ConvertFrom-Json
   ```
4. **Verify tools are in the list**:
   ```powershell
   $response | Select-Object -ExpandProperty tools | Where-Object { $_.name -match "environment" }
   ```

### Integration Test (To Add)

**File**: `internal/mcp/discovery_test.go`

```go
func TestDiscoveryFileIsWritten(t *testing.T) {
  // Start a Forge MCP server
  // Verify ~/.forge/mcp-server.json is created
  // Verify JSON is well-formed
  // Verify tools list includes environment_detect and environment_run
  // Verify auth token is correct
}

func TestMCPServerToolsEndpoint(t *testing.T) {
  // Start server
  // GET /api/mcp
  // Verify response includes environment_detect and environment_run
  // Verify response is valid JSON
}

func TestMCPServerToolsCallEndpoint(t *testing.T) {
  // POST to /api/mcp with tools/call method
  // Verify response is valid MCP JSON-RPC response
}
```

---

## Success Criteria

### Phase 1: Forge Terminal (This Session)
- ✅ MCP server exposes `environment_detect` and `environment_run` (already done)
- ✅ `GET /api/mcp` endpoint works (already done)
- ✅ `POST /api/mcp` endpoint handles `tools/call` (already done)
- [ ] Write `~/.forge/mcp-server.json` on startup
- [ ] Document discovery flow in SKILL.md
- [ ] Verify integration tests pass

### Phase 2: Copilot CLI (Future)
- [ ] Copilot CLI reads `~/.forge/mcp-server.json` on session startup
- [ ] Copilot CLI queries `GET /api/mcp` if Forge is running
- [ ] Tools from Forge appear in the session's available tools
- [ ] Agents can call `environment_detect` and `environment_run`
- [ ] HTTP bridge works correctly for all tool calls

### Phase 3: End-to-End
- [ ] Agent in Copilot CLI session calls `environment_detect`
- [ ] Forge MCP server processes the call
- [ ] Agent receives valid response with WSL/Docker availability
- [ ] Agent calls `environment_run` to build in WSL
- [ ] Build output streams back to agent
- [ ] Agent receives exit code and formatted result

---

## Backward Compatibility

- If Copilot CLI is not updated: Sessions work normally, tools just aren't discovered
- If Forge is not running: Copilot CLI skips discovery, continues without tools
- If `~/.forge/mcp-server.json` doesn't exist: Discovery is skipped
- Existing hardcoded tools remain unaffected

---

## Deployment

### Forge Terminal
1. Merge this spec into `main`
2. Implement discovery file writing in next minor release
3. Update SKILL.md in same release

### Copilot CLI
1. Implement discovery logic in Copilot CLI (separate timeline)
2. Update Copilot CLI release notes
3. No user action required — discovery is automatic

---

## Related Documents

- `.github/skills/adaptive-build-environments/SKILL.md` — User-facing documentation
- `internal/mcp/server.go` — MPC server implementation
- `internal/mcp/environment_runner.go` — Environment detection logic
- `docs/ADAPTIVE_BUILD_ENVIRONMENTS_EXPOSURE_GAP.md` — Problem analysis
