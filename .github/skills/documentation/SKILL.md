---
name: documentation
description: "Enforces documentation discipline. Activates on keywords: document, readme, changelog, docs, documentation."
---

# Documentation Discipline

## The One Rule

**CHANGELOG.md is the single source of truth for what changed.**

## What This Means

1. **DO** update CHANGELOG.md in every PR that changes functionality
2. **DO** maintain README.md with setup instructions and architecture overview
3. **DO NOT** create auxiliary summary documents per task
4. **DO NOT** create markdown files to describe what an AI agent just did
5. **DO NOT** create status files, progress logs, or task tracking documents in the repo

## CHANGELOG Format

```markdown
## [Unreleased]

### Added
- One-line summary of new feature (#PR-number)

### Changed
- One-line summary of behavior change (#PR-number)

### Fixed
- One-line summary of bug fix (#PR-number)

### Removed
- One-line summary of removed feature (#PR-number)

## [v1.2.0] - 2026-04-04

### Added
- ...
```

## Architecture Decisions

Document architecture decisions in **code comments**, not separate files.
Use this format in the relevant source file:

```
// ARCHITECTURE DECISION: [Brief title]
// What: [What was decided]
// Why: [Reasoning]
// Alternative: [What else was considered]
```
