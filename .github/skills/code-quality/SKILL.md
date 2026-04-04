---
name: code-quality
description: "Enforces human-readable code standards. Activates on ANY implementation, refactor, feature, bugfix, or code modification task."
---

# Code Quality Standards

## Naming Rules (ZERO TOLERANCE)

These rules are not suggestions. They are hard requirements enforced by pre-commit hooks.

### Variable Names
- ❌ FORBIDDEN: `x`, `y`, `z`, `tmp`, `val`, `data`, `str`, `buf`, `res`, `req` (except HTTP handler params), `ctx` (except Go context.Context)
- ✅ REQUIRED: Self-documenting names that a non-developer can understand
- Examples:
  - `x` → `horizontalPosition` or `customerAge` (depends on context)
  - `tmp` → `temporaryFilePath` or `swapValue`
  - `buf` → `responseBuffer` or `logMessageBuilder`

### Boolean Names
MUST be prefixed: `is`, `has`, `can`, `should`, `was`

### Function Names
MUST be verb-first: `createUser`, `validateEmail`, `calculateTotalRevenue`

### Constants
MUST be descriptive: `MaxRetryAttempts` not `MAX`, `DefaultTimeoutSeconds` not `TIMEOUT`

## Comment Standards

Comments MUST be readable by a non-developer (technical project manager level).

1. Every file: top-level purpose comment
2. Every public function: doc comment explaining WHAT and WHY
3. Complex logic: inline comments explaining the business reasoning
4. NO commenting obvious code (`// increment counter` is noise)

## Structure Rules

1. Functions under 40 lines preferred; extract helpers for complex logic
2. Early returns / guard clauses over deep nesting
3. No magic numbers — use named constants
4. Group related functions with section comments
5. Imports: stdlib → internal → external
