---
name: "code-tutor"
description: "Enforces tutor-friendly code practices when the Code Tutor feature is active. Activates on keywords like 'tutor', 'teach', 'explain', 'walkthrough', 'learn', or when agent detects tutor mode is enabled."
---

# Code Tutor Skill

## Purpose
When Forge's Code Tutor feature is enabled, AI agents should write code that is optimized for learning and understanding. This skill ensures agents document their decisions, use clear naming, and structure code for readability.

## When to Activate
- User mentions "tutor", "teach", "explain code", "walkthrough", "learn"
- When working on a project where the tutor feature is active
- When creating new files or making significant architectural changes

## Architecture Decision Documentation

When making structural decisions (new files, new packages, significant refactors), include an architecture decision block in your response:

ARCHITECTURE_DECISION:
What: [Brief description of what was created/changed]
Why: [Reasoning behind the decision]
Alternative: [What other approach could have been taken and why it wasn't chosen]
Impact: [Which other files/components are affected]

### Examples:
- Creating a new package → explain why it's separate from existing packages
- Choosing a design pattern → explain why this pattern over alternatives
- Adding a dependency → explain why it's needed and what it provides

## Naming Conventions

When writing code, follow these naming principles:

1. **Descriptive over clever** — `sessionManager` not `sm`, `learningPath` not `lp`
2. **No single-letter variables** — except `i`, `j`, `k` in loops, `w` and `r` for HTTP handlers
3. **Consistent terminology** — if the codebase calls it "session", don't introduce "context" for the same concept
4. **Boolean names** — prefix with `is`, `has`, `can`, `should` (e.g., `isActive`, `hasWatcher`)
5. **Function names** — verb-first (e.g., `createSession`, `buildPrompt`, `parseExplanation`)
6. **Error messages** — include context (e.g., `"loading session %s: %w"` not just `"error"`)

## Code Structure for Readability

1. **File-level comments** — Every new file should have a brief package/file doc comment explaining its purpose
2. **Exported function comments** — All exported Go functions and React component props should be documented
3. **Logical grouping** — Group related functions together with section comments
4. **Small functions** — Prefer functions under 40 lines; extract complex logic into helpers
5. **Early returns** — Use guard clauses instead of deep nesting

## Teaching Notes

When creating or modifying code that will be explained by the tutor:

1. **Add brief inline comments** on non-obvious logic (not every line, just the "why" moments)
2. **Structure imports** in logical groups (stdlib, internal, external)
3. **Use meaningful constants** — no magic numbers or strings
4. **Follow the principle of least surprise** — code should do what its name suggests

## Integration with Tutor Panel

The Code Tutor panel shows files in this learning order:
1. Configuration (go.mod, package.json, etc.)
2. Types and models
3. Utilities and helpers
4. Core business logic
5. Handlers and routes
6. UI components
7. Tests
8. Documentation

When creating new files, consider where they'll appear in this learning path and ensure they have appropriate comments for a student reader.
