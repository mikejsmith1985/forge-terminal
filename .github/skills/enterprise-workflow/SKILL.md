---
name: enterprise-workflow
description: Enforces enterprise workflow standards for Forge Terminal itself. Activates on ANY implementation, refactor, bugfix, feature, build, create, modify, update, fix, add, change, or code modification task.
---

# Enterprise Workflow Standards (Forge Terminal)

This skill enforces production-grade development standards for the Forge Terminal codebase. Every code change MUST comply with these rules.

## Quality Mode: BEST

This project operates in **BEST** mode. You MUST:
- Use sub-agents (`autopilot_fleet`) for parallelizable work
- Use premium models (Opus) for architecture decisions
- Run thorough tests before completing any task
- Never prioritize speed over quality

## Naming Conventions (MANDATORY)

### MUST
- Use descriptive variable names: `sessionManager`, `connectionTimeout`, `isAuthenticated`
- Boolean variables use `is`, `has`, `can`, `should` prefix: `isActive`, `hasPermission`
- Functions start with a verb: `createSession`, `validateToken`, `renderCard`
- Constants use UPPER_SNAKE_CASE: `MAX_RETRY_COUNT`, `DEFAULT_TIMEOUT`
- React components use PascalCase: `WorkflowWizard`, `EnterpriseWorkflowCard`
- CSS classes use kebab-case with component prefix: `ewc-header`, `ww-step-icon`

### MUST NOT
- Single-letter variables (except `i`, `j`, `k` in loops, `w`/`r` for HTTP handlers, `_` for unused)
- Abbreviations that aren't universally understood: `sm` (use `sessionManager`), `cfg` is acceptable
- Magic numbers or strings without constants or comments
- Generic names: `data`, `result`, `temp`, `info` (be specific: `userData`, `complianceResult`)

## Comment Standards (MANDATORY)

- Comments explain WHY, not WHAT (the code shows what, comments explain reasoning)
- Non-obvious logic MUST have a comment readable by non-developers
- Public functions MUST have a doc comment explaining purpose, parameters, and return values
- Complex algorithms get a brief plain-English overview before implementation

## Branching Strategy

- GitHub Flow: feature branches → main (PRs required)
- Branch naming: `feature/*`, `fix/*`, `chore/*`, `docs/*`, `hotfix/*`, `release/*`
- Never commit directly to `main`
- Squash merge for features, regular merge for releases

## CHANGELOG Discipline

- Update `CHANGELOG.md` for every PR that changes behavior
- Use Keep a Changelog format: `## [Unreleased]` section
- One-line summary + optional bullet details
- No auxiliary summary docs — CHANGELOG is the single source of truth

## Testing Standards

- TDD: write test first, then implementation
- Go tests: `go test ./...`
- Frontend tests: `cd frontend && npx vitest run`
- Every new function should have corresponding tests
- Test names describe the scenario: `TestScaffoldProject_SkipsExistingFiles`

## Code Tutor Integration

When modifying files in this project:
1. Consider that Code Tutor may explain your changes
2. Write code that teaches — clear structure, descriptive names, helpful comments
3. If you create a complex function, add a brief overview comment

## Multi-Agent Orchestration

- For tasks spanning 3+ files, use `autopilot_fleet` to parallelize
- Architecture decisions → Opus model
- Feature implementation → Sonnet model
- Documentation/simple tasks → Haiku model
- Always verify agent output before merging

## Self-Check Before Delivering

Before completing any task, verify:
1. ✅ All variable/function names are self-documenting
2. ✅ Non-obvious logic has comments readable by non-developers
3. ✅ Tests are written or updated
4. ✅ CHANGELOG.md updated (if behavior changed)
5. ✅ Branch follows naming convention
6. ✅ `go build ./cmd/forge/` succeeds
7. ✅ `cd frontend && npx vite build` succeeds
