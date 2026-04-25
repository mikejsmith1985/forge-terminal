---
name: code-tutor-workflow
description: "Integrates Code Tutor with Forge Workflow. Activates on keywords: tutor, teach, explain, walkthrough, learn, understand."
---

# Code Tutor Integration

## Behavior

When this skill is loaded as part of the pre-flight sequence, Code Tutor is active for this task.

### Post-Change Walkthrough (REQUIRED)

After every set of file changes, you MUST offer a walkthrough. The format is:

> "**N files changed** — here's a walkthrough of what was done and why:"
>
> Then explain each change at the **Technical** level unless the user specifies otherwise.

Do not wait to be asked. The walkthrough is not optional when this skill is loaded.

### Explanation Depth Levels

- **Overview** — Non-technical summary suitable for project managers: what changed and why it matters
- **Technical** — Developer-level explanation of logic, patterns, and design decisions (DEFAULT)
- **Line-by-Line** — Detailed walk-through of every significant change, explaining the reasoning

### Quality Auditing During Walkthrough

While explaining, flag any of the following if present:
- Naming violations (single-letter vars, non-verb functions, missing `is`/`has` boolean prefix)
- Missing comments on complex logic
- Functions over 40 lines
- Any code that would confuse a new contributor

## Writing Code for Learnability

When Code Tutor is active, write code that teaches:

1. Use the most readable structure, not the cleverest
2. Add brief inline comments on non-obvious logic — the "why" moments
3. Use architecture decision blocks for significant structural choices
4. Ensure every public/exported symbol has a documentation comment
5. Prefer explicit over implicit — a reader should not have to guess intent

