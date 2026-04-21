---
name: adaptive-build-environments
description: "Teaches agents to use Forge's environment_detect and environment_run MCP tools when builds fail on Windows. Activates on keywords: build, npm, deploy, compile, OpenNext, Turbopack, next build, chunk, Linux, Docker, WSL, ENAMETOOLONG, Windows path, cross-platform."
---

# Adaptive Build Environments

## ⛔ CIRCUIT BREAKER — READ THIS FIRST

**If any of the following are true, you MUST call `environment_detect` before doing anything else:**

- The build is failing or producing bad output on a Windows machine
- The user mentions chunk filename errors, 404s after deploy, ENAMETOOLONG, or backslash path issues
- The problem involves OpenNext, Turbopack, Cloudflare Workers, or `next build`
- The user asks you to "fix the build", "deploy the site", or "run npm run build"
- You are about to write a GitHub Actions workflow YAML file for a build/deploy problem

**FORBIDDEN — Do NOT do any of the following when this skill is active:**

| Forbidden action | Why |
|-----------------|-----|
| Create or modify `.github/workflows/*.yml` for build/deploy problems | This is exactly what `environment_run` replaces |
| Ask the user for `CLOUDFLARE_API_TOKEN` or other CI secrets | Not needed — `environment_run` runs locally |
| Tell the user to "add secrets" or "configure GitHub Actions" | The local Linux environment handles this |
| Push a deploy workflow and tell the user to trigger it | `environment_run` deploys from the local machine |
| Run the build with `powershell` / `cmd` and accept Windows output | Windows builds produce broken artifacts for Linux targets |

> **If you find yourself writing `name: Deploy` or `on: push:` or `jobs:` YAML — STOP.**
> Close that thought. Call `environment_detect` instead.

---

## Preferred Approach: Run in the Active Forge Tab

**Forge IS a terminal app.** Before using `environment_run`, try the PTY-first approach:

1. Call `terminal_sessions` to list active Forge sessions
2. Pick the session that is already in (or closest to) the project directory
3. Call `terminal_execute` with the WSL command directly — the user sees output live in their tab

```json
// Step 1 — find the active session
{ "tool": "terminal_sessions", "arguments": {} }

// Step 2 — cd and build inside the existing Forge terminal
{
  "tool": "terminal_execute",
  "arguments": {
    "session_id": "<id from step 1>",
    "command": "wsl -e bash -c 'cd /mnt/c/ProjectsWin/RLL/website && npm install && npm run build'",
    "timeout_seconds": 480
  }
}
```

**Why this is better:** Output streams live in the user's terminal tab. No hidden background process. No external window. The user sees progress in real time, exactly as if they ran it themselves.

**Fall back to `environment_run`** only when:
- No active Forge PTY session exists
- The session is on the wrong machine (remote session)
- You need structured JSON output with `exit_code`, `environment_used`, and `duration_seconds`

---

## What This Feature Is

Forge Terminal ships two MCP tools that let AI agents run Linux-compatible builds
**directly from a Windows host** — no GitHub Actions, no CI secrets, no manual WSL setup.

| Tool | What it does |
|------|-------------|
| `environment_detect` | Probes the host for WSL2 and Docker. Returns availability + recommended strategy. Call this first, always. |
| `environment_run` | Runs a shell command in `native`, `linux-wsl`, `linux-docker`, or `auto` environment. Returns `exit_code`, `stdout`, `stderr`, `environment_used`, and `duration_seconds`. |

---

## MANDATORY FIRST STEP

Before running any build or deploy command, you **MUST** call `environment_detect`:

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
  "docker_available": true,
  "docker_installed_but_not_running": false,
  "recommended": "linux-wsl",
  "install_hint": ""
}
```

Use the `recommended` field to choose your strategy. Never skip this step.

---

## MANDATORY SECOND STEP — Run the build

Once you know what's available, call `environment_run` with `environment: "auto"`:

```json
{
  "tool": "environment_run",
  "arguments": {
    "command": "npm install && npm run build",
    "environment": "auto",
    "cwd": "C:\\ProjectsWin\\my-site\\website",
    "timeout_seconds": 480
  }
}
```

**`environment: "auto"`** picks WSL2 first (fastest), Docker second, native last.
This is the correct default for almost every case.

### Strategy reference

| Value | When to use |
|-------|-------------|
| `"auto"` | **Always use this unless the user has a specific preference** |
| `"linux-wsl"` | User confirmed WSL2 is their preference |
| `"linux-docker"` | User confirmed Docker is their preference, or WSL2 is unavailable |
| `"native"` | User is on Linux/macOS, or the build tool handles Windows paths correctly |

### Timeout guidance

| Build type | `timeout_seconds` |
|-----------|-------------------|
| `npm run build` (incremental) | 120 |
| `npm run build` (cold, large project) | 300 |
| `npm install && npm run build` | 480 |
| OpenNext full build | 600 (max) |

---

## When These Tools Apply

Use `environment_run` for:

- `npm run build` producing garbled chunk filenames like `chunks/[hash]_[hash]_[hash].js`
- `next build` or OpenNext failing with Windows path errors (`ENAMETOOLONG`, backslash issues)
- Cloudflare Workers / OpenNext deploy failing with chunk file 404s after a Windows build
- Turbopack or other Linux-first tools producing corrupted output on Windows
- The user says "the build works in CI but not locally" (CI runs Linux; local is Windows)
- Any tool that explicitly requires a POSIX filesystem or Linux `bash`

Do NOT use for:
- Pure Go, Rust, or .NET builds that handle Windows paths correctly
- Database migrations or seed scripts unrelated to the build toolchain
- Tasks where the user has already confirmed they are on Linux or macOS

---

## The RLL / OpenNext Case (Worked Example)

**Symptom:** The RLL website (OpenNext + Cloudflare Workers) deploys but chunk files
have Windows-style `\` path separators embedded in their names, causing 404s at runtime.

**Wrong approach — DO NOT do this:**
```
# Creating .github/workflows/deploy.yml and asking for Cloudflare secrets
```

**Correct approach — do exactly this:**

```json
// Step 1
{ "tool": "environment_detect", "arguments": {} }

// Step 2 — use the path to the website subdirectory, not the repo root
{
  "tool": "environment_run",
  "arguments": {
    "command": "npm install && npm run build",
    "environment": "auto",
    "cwd": "C:\\ProjectsWin\\RLL\\website",
    "timeout_seconds": 480
  }
}
```

After a successful build (`exit_code: 0`), check `environment_used` — it must be
`linux-wsl` or `linux-docker`, **not** `native`. A native build on Windows will
reproduce the original bug.

---

## Connection Requirements

These tools are served by the Forge MCP server (`POST /api/mcp`).

- **Copilot CLI in Forge** — Connected automatically when Forge is running. No setup needed.
- **Other MCP clients** — Require configuration. See the "Adaptive Build Environments" card
  in the Forge command panel sidebar for token path and per-client setup tabs.

MCP token: `~/.forge/mcp-token` — auto-generated on first Forge launch.

---

## Reporting Results

After `environment_run` completes, tell the user:

1. Which environment was used (`environment_used`)
2. The exit code and duration
3. The last relevant lines of `stdout` or `stderr`
4. Next step — if exit code is 0, proceed to deploy; if non-zero, share the error and suggest a retry with `"linux-docker"` if WSL was used

**Example:** "I ran your OpenNext build in WSL2 (exit code 0, 52s). The `.open-next/` output is ready. Want me to run the Cloudflare deploy next?"
