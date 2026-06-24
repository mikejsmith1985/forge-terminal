# Specification Quality Checklist: Repeatable SDD — Deterministic Resume + Enforced TDD & Playwright UX Validation

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-06-24
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified (resume fallback, nested-worktree refusal, Playwright unavailable, never-failing test, audited bypass)
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows (deterministic resume, TDD gate, UX gate, honest failure)
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- **US1 / FR-001–FR-005 / SC-001–SC-002** directly address the captured nested-worktree bug
  (`.forge/worktrees/.../.forge/worktrees/...`): provisioning is anchored to the main checkout, at most
  one nesting level is permitted, and a missing worktree falls back to the main checkout rather than
  drifting. This is the root-cause fix for the broken Resume/Continue.
- **US2 / FR-006–FR-010** encode Red→Green TDD as a hard completion gate, with an audited exemption
  path for genuine non-code phases so the gate cannot be dodged silently.
- **US3 / FR-011–FR-016** encode the user's explicit demand: user-facing changes must be proven by real
  Playwright UI exercise (and, for terminal output, the xterm.js buffer model), never grep/curl/200/compiles.
- **US4 / FR-017–FR-020** make failures loud and the pipeline deterministic and repeatable.
- The constitution (Articles V, X) is treated as the standard; this feature makes it *enforced*, not merely
  documented. "Workspace"/"session"/"phase" are kept technology-agnostic in requirements and success criteria.
- **Terminology**: "evidence", "gate", "re-attach" are used consistently; success criteria avoid naming
  frameworks except where the user named the tool (Playwright) as a hard requirement, recorded in Assumptions.
