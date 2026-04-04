---
name: testing-standards
description: "Enforces TDD workflow and test quality standards. Activates on keywords: test, spec, validate, coverage, TDD, unit test, integration test."
---

# Testing Standards

## TDD Workflow (MANDATORY)

1. **RED:** Write a failing test that describes the expected behavior
2. **GREEN:** Write the minimum code to make the test pass
3. **REFACTOR:** Improve the code while keeping tests green

## Test Layer Separation

| Layer | Scope | Dependencies | Speed |
|-------|-------|-------------|-------|
| Unit | Individual functions, components | ALL mocked | <10ms per test |
| Integration | API handlers, data persistence | Real services (testcontainers) | <5s per test |
| E2E | Full user journeys | Real stack | <30s per test |

## Rules

1. **Every new source file MUST have a corresponding test file**
2. **Never mock what you don't own** — wrap external APIs in interfaces first
3. **Test behavior, not implementation** — tests should survive refactoring
4. **Descriptive test names:** `TestCreateUser_WithDuplicateEmail_ReturnsConflictError`
5. **Arrange / Act / Assert** structure in every test
