---
name: workflow-enforcer
description: "MANDATORY for all code changes. Enforces enterprise workflow standards. Activates on ANY implementation, refactor, bugfix, feature, build, create, modify, update, fix, add, change, or code modification task."
---

# Workflow Enforcer — Enterprise Standards

> ⚠️ This skill is MANDATORY. It applies to EVERY coding task in this project.
> Read .forge/workflow.json for this project's active configuration.

## SELF-CHECK PROTOCOL

Before delivering ANY code change, verify your output against these rules:

### ✅ Naming Check
- [ ] No single-letter variables (except i/j/k in loops, w/r in HTTP handlers)
- [ ] All booleans prefixed with is/has/can/should/was
- [ ] All functions are verb-first
- [ ] A non-developer can understand every name without context

### ✅ Comment Check
- [ ] Every new file has a top-level purpose comment
- [ ] Every public/exported function has a doc comment
- [ ] Complex logic blocks have "why" comments (not "what" comments)
- [ ] Comments are readable by a technical project manager

### ✅ Structure Check
- [ ] No function exceeds 40 lines (extract helpers if needed)
- [ ] Guard clauses used instead of deep nesting
- [ ] No magic numbers or strings (use named constants)
- [ ] Imports are logically grouped

### ✅ Workflow Check
- [ ] Working on a feature branch (not main)
- [ ] CHANGELOG.md updated if functionality changed
- [ ] Tests written for new/changed code
- [ ] Commit message follows format: type: description

### ✅ Quality Mode Check
- [ ] Sub-agents used for parallelizable work (3+ independent files)
- [ ] Task classified and appropriate model tier selected
- [ ] Code reviewed against quality standards before delivery

## ENFORCEMENT

If you find yourself about to deliver code that violates any of these rules:
1. STOP
2. Fix the violation
3. Re-verify the entire checklist
4. Only then deliver

These are not suggestions. They are requirements.
