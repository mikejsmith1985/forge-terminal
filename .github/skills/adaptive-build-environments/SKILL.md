---
name: adaptive-build-environments
description: "Teaches agents to use Forge's environment_detect and environment_run MCP tools when builds fail on Windows. Activates on keywords: build, npm, deploy, compile, OpenNext, Turbopack, next build, chunk, Linux, Docker, WSL, ENAMETOOLONG, Windows path, cross-platform."
---

# Adaptive Build Environments

## What This Feature Is

Forge Terminal ships two MCP tools that let AI agents run Linux-compatible builds
directly from a Windows host — **without GitHub Actions, CI secrets, or manual WSL setup**.

| Tool | What it does |
|------|-------------|
| `environment_detect` | Probes the host for WSL2 and Docker. Returns availability + recommended strategy. |
| `environment_run` | Runs a shell command in `native`, `linux-wsl`, `linux-docker`, or `auto` environment. Returns `exit_code`, `stdout`, `stderr`, `environment_used`, and `duration_seconds`. |

## When To Use These Tools

Use `environment_run` (with `environment: "auto"`) whenever:

- `npm run build` produces garbled chunk filenames like `chunks/[hash]_[hash]_[hash].js`
- `next build` or OpenNext fails with Windows-specific path errors (`ENAMETOOLONG`, backslash issues)
- Turbopack or other Linux-first tools silently produce corrupted output on Windows
- The user says "the build works in CI but not locally" (CI runs Linux; local is Windows)
- A Cloudflare Workers / OpenNext deploy fails with chunk file 404s after a Windows build
- Any tool explicitly requires a POSIX filesystem or Linux `bash` environment

**Do NOT** use these tools for:
- Pure Go, Rust, or .NET builds that handle Windows correctly
- Database migrations, seed scripts, or anything not related to the build toolchain
- Tasks where the user has already verified they're on Linux / macOS

## How To Call These Tools

### Step 1 — Probe availability first

```json
{
  "tool": "environment_detect",
  "arguments": {}
}
```

Typical response:
```json
{
  "wsl2_available": true,
  "docker_available": false,
  "docker_installed_but_not_running": true,
  "recommended": "linux-wsl",
  "install_hint": ""
}
```

### Step 2 — Run the build in the recommended environment

```json
{
  "tool": "environment_run",
  "arguments": {
    "command": "npm run build",
    "environment": "auto",
    "cwd": "C:\\Users\\mike\\Projects\\my-site",
    "timeout_seconds": 300
  }
}
```

**`environment: "auto"`** picks WSL2 first, Docker second, falls back to native.
Use a specific strategy only if the user has told you which they prefer.

### Strategy reference

| Value | When to use |
|-------|-------------|
| `"auto"` | Almost always — let Forge pick the best option |
| `"linux-wsl"` | User confirmed WSL2 is their preference |
| `"linux-docker"` | User confirmed Docker is their preference, or WSL2 is unavailable |
| `"native"` | User is on Linux/macOS, or the tool handles Windows correctly |

### Timeout guidance

| Build type | Suggested `timeout_seconds` |
|-----------|----------------------------|
| `npm run build` (incremental) | 120 |
| `npm run build` (cold, large project) | 300 |
| `npm install && npm run build` | 480 |
| OpenNext full build | 600 (max) |

## Diagnosing the RLL / OpenNext Case

The user's "RLL directory" website uses OpenNext + Cloudflare Workers. The symptom
is chunk files with Windows-style `\` separators producing 404s at runtime.

**Correct fix — run the build in Linux:**

```json
{
  "tool": "environment_run",
  "arguments": {
    "command": "npm install && npm run build",
    "environment": "auto",
    "cwd": "<path-to-rll-project>",
    "timeout_seconds": 480
  }
}
```

After a successful build, verify `exit_code` is `0` and check `environment_used`
to confirm the build ran in `linux-wsl` or `linux-docker` (not `native`).

## Connection Requirements

These tools are available via the Forge MCP server at `POST /api/mcp`.

- **Copilot CLI (Forge terminal)** — Available automatically when Forge is running.
- **Other clients** — Require MCP configuration. See the Adaptive Build Environments
  card in the Forge command panel for setup instructions.

The MCP token lives at `~/.forge/mcp-token`. It is auto-generated on first Forge launch.

## What To Tell The User

When you successfully run a build via `environment_run`, report:

1. Which environment was used (`environment_used` field)
2. The exit code
3. Any relevant tail of `stdout` or `stderr`
4. If the build failed, whether retrying with a different strategy makes sense

Example: "I ran your OpenNext build in WSL2 (exit code 0, 47s). The output is in `.open-next/`."
