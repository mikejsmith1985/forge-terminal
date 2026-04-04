---
name: workflow-enforcer
description: "MANDATORY for all code changes. Enforces enterprise workflow standards. Activates on ANY implementation, refactor, bugfix, feature, build, create, modify, update, fix, add, change, or code modification task."
---

# Workflow Enforcer — Enterprise Standards

> ⚠️ This skill is MANDATORY. It applies to EVERY coding task in this project.

---

## PHASE 0: CO-SKILL CASCADE (Execute Immediately When This Skill Loads)

When this skill loads, your next actions — before reading any code or forming any plan —
are to invoke the following co-skills in order. Do not skip any. Do not proceed to Phase 1
until all co-skills are loaded.

```
invoke skill: enterprise-workflow
invoke skill: code-quality
invoke skill: branching-strategy
invoke skill: code-tutor-workflow
```

For tasks spanning 3+ files, also invoke: `multi-agent`
For test creation/modification, also invoke: `testing-standards`
For PR creation/review, also invoke: `pr-workflow`

**After all co-skills are loaded: confirm a feature branch exists.**

```powershell
git branch --show-current
```

If the output is `main`: create a branch before writing any code.

```powershell
git checkout -b fix/<descriptive-name>      # bug fixes
git checkout -b feature/<descriptive-name>  # new functionality
git checkout -b chore/<descriptive-name>    # maintenance
```

**Only after branch is confirmed: proceed to Phase 1.**

---

## PHASE 1: WHILE CODING (Active Standards)

Apply these as you write, not after.

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

Before delivering any code change, confirm every item:

### ✅ Workflow
- [ ] On a feature branch (not `main`) — `git branch --show-current`
- [ ] CHANGELOG.md updated if behavior changed
- [ ] Tests written for new/changed code
- [ ] Commit message follows format: `type: description`

### ✅ Quality Mode
- [ ] Sub-agents used for parallelizable work (3+ independent files)
- [ ] Task classified and appropriate model tier selected
- [ ] Build passes: `go build ./cmd/forge/`
- [ ] Frontend build passes: `cd frontend && npx vite build`
- [ ] All tests pass: `go test ./...` and `cd frontend && npx vitest run`

## ENFORCEMENT

If you find yourself about to deliver code and any Phase 2 item is unchecked:
1. STOP
2. Fix the violation
3. Re-verify the full checklist
4. Only then deliver

These are not suggestions. They are requirements.

