# AGENTS.md — Forge Terminal Agent Instructions

> This file is read automatically by Copilot CLI at session start.
> It contains the mandatory circuit breaker that governs ALL code changes in this repository.

---

## ⛔ CIRCUIT BREAKER — PRE-FLIGHT REQUIRED

### The Per-Response Rule (MOST IMPORTANT)

**For EVERY response that involves any code change, fix, feature, refactor, or file modification:**

**The FIRST tool call in your response MUST be `skill: workflow-enforcer`.**

> If you are about to call `edit`, `create`, `powershell`, `view`, or any non-skill tool as your
> first action on a code task: STOP. You have not completed pre-flight. Invoke the skills first.

This rule exists because the failure mode is: analyze → plan → code → *then* remember skills.
The rule forces skills to fire BEFORE analysis begins, not after.

---

## Mandatory Skill Invocation Sequence

When `workflow-enforcer` loads, it will instruct you to invoke the following co-skills.
This project uses **Spec-Driven Development (GitHub Spec Kit)**: when `.specify/` is present,
`.specify/memory/constitution.md` holds the binding rules and the `speckit-*` pipeline is the
workflow. The full required sequence is:

| Order | Skill / Step | When Required |
|-------|--------------|---------------|
| 1 | `workflow-enforcer` | **ALL** code tasks — invoke this first, always |
| 2 | read `.specify/memory/constitution.md` | **ALL** code tasks in an SDD project — the authoritative binding rules |
| 3 | `code-quality` | **ALL** code tasks |
| 4 | `framework-first` | **ALL** code tasks — confirm the framework doesn't already provide it before building infrastructure |
| 5 | `branching-strategy` | **ALL** code tasks (branch must exist before code) |
| 6 | `code-tutor-workflow` | **ALL** code tasks — user expects walkthrough of changes |
| — | **speckit pipeline** (`speckit-specify → speckit-plan → speckit-tasks → speckit-implement`) | The workflow itself, in any `.specify/` project |
| 7 | `multi-agent` | Tasks spanning 3+ files |
| 8 | `testing-standards` | Any test creation or modification |
| 9 | `pr-workflow` | Creating or reviewing pull requests |

> The legacy bespoke `forge-workflow` 5-phase skill has been **removed** — its standards now live in
> the constitution (`.specify/memory/constitution.md`) and its orchestration is the speckit pipeline.

---

## Branch Before Code (Non-Negotiable)

After invoking skills, create a branch BEFORE writing a single line of code:

```powershell
git checkout -b fix/<descriptive-name>      # bug fixes
git checkout -b feature/<descriptive-name>  # new functionality
git checkout -b chore/<descriptive-name>    # maintenance / cleanup
git checkout -b docs/<descriptive-name>     # documentation only
```

Confirm the branch exists: `git branch --show-current`

**If the output is `main`: STOP. You skipped the branch step.**

---

## If You Skipped Pre-Flight

If you find yourself having written code without completing the pre-flight sequence above:

1. STOP immediately — do not deliver the code
2. Acknowledge the violation to the user
3. Ask whether to revert and restart, or course-correct
4. Do not rationalize or proceed

---

## Critical Safety Rule (Process Protection)

The production binary is `fterm.exe`. The agent (you) runs inside it.

- **NEVER** use `Get-Process -Name "forge*"` or any wildcard process kill
- **ALWAYS** use `Stop-Process -Id <specific-PID>` with an explicit PID
- Violating this kills your own session and destroys all context

---

## 5-Phase Workflow (Summary)

After pre-flight and branch creation, follow the workflow defined in `.github/copilot-instructions.md`:

- **Phase 1** — Deep understanding, planning, dashboard (`refactor_plan.html`)
- **Phase 2** — Zero-Compromise Audit (safety, testing, no shortcuts)
- **Phase 3** — TDD Execution (failing test first, then implementation)
- **Phase 4** — Deterministic Verification with visual proof (Cypress screenshots)
- **Phase 5** — Delivery: CHANGELOG update, commit, PR

Full details in `.github/copilot-instructions.md`.
