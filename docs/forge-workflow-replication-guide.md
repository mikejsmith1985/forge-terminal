# Forge Workflow Replication Guide

This guide explains how Forge Workflow is enforced in this repository and how to replicate the same model in another application.

## 1. Workflow Process (End-to-End)

1. **Pre-flight (always first)**: invoke `workflow-enforcer`, then companion skills.
2. **Branch gate**: create/use a feature branch (`feature/*`, `fix/*`, `chore/*`, `docs/*`) before edits.
3. **Build with quality rules active**: naming, comments, structure, and testing standards enforced by loaded skills.
4. **Record runtime gates**: write gate evidence into `.forge/workflow-ticket.json`.
5. **Commit-time enforcement**: Git pre-commit checks branch + required gates before allowing commit.

---

## 2. Skills: What is leveraged and how many

### Mandatory pre-flight sequence (5 skills)
1. `workflow-enforcer`
2. `forge-workflow`
3. `code-quality`
4. `branching-strategy`
5. `code-tutor-workflow`

### Conditional skills used by task type
- `multi-agent` for multi-file/parallel work
- `testing-standards` when tests are added/changed
- `pr-workflow` for PR work
- `documentation` for docs/CHANGELOG tasks

### Skill counts in this environment
- **20 project skills** under `.github/skills`
- **21 total available skills** in this Copilot CLI session (project + built-in)

---

## 3. Hooks used and how they are used

## Primary runtime enforcement hook
- **Hook**: `.git/hooks/pre-commit`
- **Install behavior**:
  - Auto-installed on first `workflow_gate_record` for a new ticket (`EnsureHookInstalled`)
  - Also manually installable via:
    - `.\scripts\install-workflow-hooks.ps1` (Windows)
    - `./scripts/install-workflow-hooks.sh` (macOS/Linux)

## What pre-commit enforces
1. **No direct commits to `main`/`master`**
2. Runs `forge workflow preflight`
3. Blocks commit unless required gates exist in `.forge/workflow-ticket.json`:
   - `branch-created`
   - `tests-written`
   - `tests-passed`

## Controlled bypass (audited)
- Set `FORGE_BYPASS=1` and `FORGE_BYPASS_REASON="..."` for an emergency bypass.
- Bypass is logged to `.forge/bypasses.log`.

---

## 4. Gate ledger + tooling contract

Forge uses two MCP tools to keep agent behavior and Git hook behavior aligned:

- `workflow_gate_record`: appends gate evidence to `.forge/workflow-ticket.json`
- `workflow_preflight_check`: returns whether all required gates are satisfied

Because the pre-commit hook calls the same preflight logic, both paths stay in lockstep.

---

## 5. Agent inventory (for replication planning)

In this Copilot CLI environment, the Task system exposes **5 agent types**:

1. `explore`
2. `task`
3. `general-purpose`
4. `code-review`
5. `research`

Recommended mapping:
- `explore` for distributed codebase discovery
- `task` for build/test/lint execution
- `general-purpose` for complex implementation
- `code-review` for high-signal review
- `research` for external/web/repo research

---

## 6. Minimal replication blueprint for your own app

1. Add a mandatory pre-flight skill chain (same 5-skill order).
2. Enforce branch naming + block direct commits to protected branches.
3. Implement a per-task workflow ledger file (Forge uses `.forge/workflow-ticket.json`).
4. Add an MCP/API method to record gates and one to preflight-check gates.
5. Install a pre-commit hook that:
   - rejects protected-branch commits
   - runs preflight
   - blocks if required gates are missing
6. Add audited bypass env vars for break-glass cases.
7. Keep required gates explicit (start with `branch-created`, `tests-written`, `tests-passed`).

---

## 7. Source anchors in this repo

- Skill chain + branch rule: `AGENTS.md`, `.github/copilot-instructions.md`
- Runtime gate ledger: `internal/workflow/ticket.go`
- Hook installer/runtime hook body: `internal/workflow/hooks.go`
- MCP gate tools: `internal/mcp/tools_workflow_gate.go`
- Manual hook installers: `scripts/install-workflow-hooks.ps1`, `scripts/install-workflow-hooks.sh`
