---
name: workflow-enforcer
description: "MANDATORY for all code changes. Enforces Forge Workflow standards. Activates on ANY implementation, refactor, bugfix, feature, build, create, modify, update, fix, add, change, or code modification task."
---

# Workflow Enforcer

> ⚠️ This skill is MANDATORY. It applies to EVERY coding task in every project.
> However, it adapts its requirements based on whether the project uses the
> full Forge Forge Workflow or a standard workflow.

---

## PHASE 0A: PROJECT DETECTION (Run First — Before Any Co-Skills)

Before loading any co-skills, determine the **project mode** by checking two things:

**Check 1 — Does `AGENTS.md` exist in the repository root?**
```powershell
Test-Path "AGENTS.md"
```

**Check 2 — Does `.github/skills/forge-workflow/` exist?**
```powershell
Test-Path ".github/skills/forge-workflow"
```

### Mode Decision Table

| AGENTS.md | forge-workflow skill | Detected Mode |
|-----------|----------------------|---------------|
| ✅ Found  | ✅ Found             | **Forge Enterprise** |
| ❌ Missing | ✅ Found             | **Enterprise** |
| ❌ Missing | ❌ Missing           | **Standard** |

Store the detected mode. It controls which co-skills are **required** vs **optional**.

---

## PHASE 0B: CO-SKILL CASCADE

Invoke co-skills in the order listed. Behavior on failure differs by mode:

### Always Required (all modes)
These must load successfully in every project. If missing, report ❌ and stop.
```
invoke skill: code-quality
```

### Forge Terminal Project Only (load when AGENTS.md is present)
These skills are specific to the Forge Terminal codebase. Load them automatically
when `AGENTS.md` exists — they teach the agent about project-specific systems.
If a skill is missing, report ⚠️ and continue.
```
invoke skill: forge-vault
invoke skill: sequential-tasks
```

### Enterprise-Only (required in Forge Enterprise / Enterprise mode; optional in Standard)
Attempt to load these in every project. If the project is in **Standard mode** and
a skill is not found, mark it ⚠️ and continue — do NOT block the task.
If the project is in **Enterprise mode** and a skill is not found, mark it ❌ and stop.
```
invoke skill: forge-workflow
invoke skill: branching-strategy
invoke skill: code-tutor-workflow
```

### Conditionally Required (invoke when the task warrants it)
```
invoke skill: multi-agent             # tasks spanning 3+ files
invoke skill: testing-standards       # test creation or modification
invoke skill: pr-workflow             # PR creation or review
invoke skill: forge-release-process   # release, publish, bump version, create a release
```

---

## PHASE 0C: PRE-FLIGHT STATUS TABLE

After attempting all loads, output the following table. The `AGENTS.md` row
reflects the Check 1 result from Phase 0A.

```
⛳ PRE-FLIGHT COMPLETE

┌─────────────────────────┬────────────────────────────────────────────┐
│ Item                    │ Status                                     │
├─────────────────────────┼────────────────────────────────────────────┤
│ code-quality            │ ✅ Loaded                                  │
│ forge-vault             │ ✅ Loaded  /  ⚠️ Not configured (optional)  │
│ sequential-tasks        │ ✅ Loaded  /  ⚠️ Not configured (optional)  │
│ forge-workflow          │ ✅ Loaded  /  ⚠️ Not configured (optional) /  ❌ Required but missing │
│ branching-strategy      │ ✅ Loaded  /  ⚠️ Not configured (optional) /  ❌ Required but missing │
│ code-tutor-workflow     │ ✅ Loaded  /  ⚠️ Not configured (optional) /  ❌ Required but missing │
│ AGENTS.md               │ ✅ Found   /  ⚠️ Not present (standard mode) │
├─────────────────────────┼────────────────────────────────────────────┤
│ Active mode             │ Forge Enterprise  /  Enterprise  /  Standard │
│ Quality mode            │ BEST (enterprise)  /  FAST (standard)      │
│ Audit focus             │ naming · complexity · comments             │
└─────────────────────────┴────────────────────────────────────────────┘
```

Use only the applicable status value for each row — do not show all three options.

### Status key
- ✅ **Loaded / Found** — skill or file is present and active
- ⚠️ **Not configured (optional)** — skill is absent but the project is in Standard mode; enforcement continues without it
- ❌ **Required but missing** — skill is absent in a project that requires it; STOP and notify the user

---

## PHASE 0D: BRANCH CHECK

After the status table, confirm a feature branch exists:

```powershell
git branch --show-current
```

If the output is `main` or `master`: create a branch before writing any code.

```powershell
git checkout -b fix/<descriptive-name>      # bug fixes
git checkout -b feature/<descriptive-name>  # new functionality
git checkout -b chore/<descriptive-name>    # maintenance / cleanup
git checkout -b docs/<descriptive-name>     # documentation only
```

**Only after the branch is confirmed: proceed to Phase 1.**

---

## PHASE 1: WHILE CODING (Active Standards)

These apply in all modes. Adjust strictness based on quality mode:
- **BEST mode (Enterprise)**: zero tolerance — every rule is enforced
- **FAST mode (Standard)**: best-effort — flag violations but don't block delivery

### Naming
- No single-letter variables (except `i`/`j`/`k` in loops, `w`/`r` in HTTP handlers)
- All booleans prefixed with `is`, `has`, `can`, `should`, or `was`
- All functions are verb-first: `createSession`, `validateToken`
- A non-developer can understand every name without context

### Comments
- New files get a top-level purpose comment
- Exported/public functions get a doc comment
- Complex logic blocks get "why" comments, not "what" comments
- Comments are readable by a technical project manager

### Structure
- No function exceeds 40 lines — extract helpers if needed
- Guard clauses instead of deep nesting
- No magic numbers or strings — use named constants
- Imports are logically grouped

---

## PHASE 2: PRE-DELIVERY CHECKLIST

### ✅ Always check (all modes)
- [ ] On a feature branch (not `main` / `master`) — `git branch --show-current`
- [ ] Tests written or updated for changed code
- [ ] Commit message follows format: `type(scope): description`

### ✅ Check when CHANGELOG.md exists in the project
- [ ] CHANGELOG.md updated if user-visible behavior changed

### ✅ Enterprise mode only
- [ ] Sub-agents used for parallelizable work (3+ independent files)
- [ ] Task classified and appropriate model tier selected

### ✅ Build and test — use the project's own commands
Do NOT hardcode build or test commands. Discover them from:
- `package.json` scripts → use `npm run build`, `npm test`
- `Makefile` → use `make build`, `make test`
- `go.mod` → use `go build ./...`, `go test ./...`
- CI config (`.github/workflows/`) → mirror what CI runs

If this is the **Forge Terminal** project specifically:
- Go build: `go build ./cmd/forge/`
- Frontend build: `cd frontend && npx vite build`
- Go tests: `go test ./...`
- Frontend tests: `cd frontend && npx vitest run`

---

## PHASE 3: RUNTIME GATE LEDGER (HARD ENFORCEMENT)

Skills alone cannot stop a non-compliant commit — only runtime hooks can.
Forge Terminal ships a pre-commit hook that reads `.forge/workflow-ticket.json`
and BLOCKS any commit whose ledger is missing a required gate.

**Required gates the hook checks:**
- `branch-created` — proves a feature branch was created before code
- `tests-written` — proves at least one test was added or updated
- `tests-passed` — proves the test run succeeded

**Record gates as you complete them via the MCP tool:**
```
workflow_gate_record({
  taskId:   "<stable id for this task>",
  gate:     "branch-created" | "tests-written" | "tests-passed" | ...,
  evidence: "<short proof, e.g. 'feature/foo created at HEAD ac04dbc'>",
  branch:   "<branch name, optional>"
})
```

**Verify the hook will allow your commit before running git:**
```
workflow_preflight_check()
```
or shell-equivalent:
```
forge workflow preflight
```

**One-time install of the hook in any new repo:**
The hook is **installed automatically** the first time `workflow_gate_record` is called
in a project (i.e., when the very first ticket is created).  No manual step is required.

If for any reason you need to force-reinstall or install without recording a gate:
```powershell
.\scripts\install-workflow-hooks.ps1   # Windows
./scripts/install-workflow-hooks.sh    # macOS / Linux
```

**Bypass (last resort, audited):** set `FORGE_BYPASS=1` and
`FORGE_BYPASS_REASON="..."` in the environment for one commit.  Bypasses
are appended to `.forge/bypasses.log` so reviewers can spot abuse.

---

## ENFORCEMENT

### Enterprise mode
All Phase 2 items are hard requirements. If any are unchecked before delivery:
1. STOP
2. Fix the violation
3. Re-verify the full checklist
4. Only then deliver

### Standard mode
Phase 2 items are best-practice reminders. Flag any unchecked items in your
delivery summary, but do not block the user from receiving the result.

