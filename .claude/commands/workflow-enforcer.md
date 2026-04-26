# Workflow Enforcer — Circuit Breaker

You have invoked the Forge Workflow circuit breaker. This skill is the gatekeeper for ALL code changes in this repository. Read every word before proceeding.

## What you MUST do right now (in this order)

1. **Invoke `forge-workflow`** — loads the 5-Phase execution plan you will follow for this task
2. **Invoke `code-quality`** — loads naming conventions and comment standards that apply to every line you write
3. **Invoke `branching-strategy`** — enforces branch creation before the first file edit
4. **Invoke `code-tutor-workflow`** — user expects a clear walkthrough of every change you make

Do not read any files, write any code, or run any commands until all four companion skills are loaded.

## Hard rules that apply after skills are loaded

- **Branch before code.** If `git branch --show-current` outputs `main`, STOP. You have not created your branch yet.
- **Phase 1 before Phase 3.** You must articulate a plan before touching any source file.
- **No shortcuts.** "It compiles" is not proof. "The test passes" is not proof unless it is a real integration test against real infrastructure.
- **Never kill forge by wildcard.** The production binary is `fterm.exe`. Use `Stop-Process -Id <PID>` with a specific PID only.
- **Phase 5 is mandatory.** Every task ends with: CHANGELOG entry → commit → `gh pr create` → merge → `.\scripts\local-release.ps1`.

## If you skipped this skill

If you are reading this after already writing code:

1. STOP immediately
2. Tell the user you violated pre-flight
3. Ask whether to revert and restart, or course-correct in place
4. Do not rationalize or continue

The pre-flight sequence exists because the failure mode is: analyze → plan → code → *remember skills too late*. This rule breaks that pattern.
