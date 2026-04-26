# Code Quality — Naming & Comment Standards

These rules apply to every line of code you write or modify in this repository. They are not suggestions.

---

## Naming Conventions (MANDATORY)

### Variables
- **Never use single-letter names** except: `i`, `j`, `k` (loop iterators), `w`/`r` (HTTP handler params), `_` (intentionally unused), `b` (strings.Builder)
- **Booleans** must be prefixed with `is`, `has`, `can`, `should`, or `was`
  - ✅ `isToolAware`, `hasVariants`, `shouldMigrate`, `wasChanged`
  - ❌ `toolAware`, `variants`, `migrate`, `changed`
- **Names must be self-documenting** — a reader should know purpose without context
  - ✅ `resolvedCommand`, `migrationChanged`, `activeTabId`
  - ❌ `cmd`, `x`, `tmp`, `val`, `data`

### Functions
- **Verb-first naming:** `migrateToolVariants`, `resolveCommand`, `buildDeepLink`
- **Exported functions** must have a doc comment explaining what and why

### Constants
- Use `UPPER_SNAKE_CASE` or descriptive camelCase — never abbreviated

### React Components
- `PascalCase`: `SortableCommandCard`, `ForgeWorkflowCard`, `CliToolSelector`

### CSS classes
- `kebab-case` with component prefix: `cli-tool-selector`, `tool-badge-claude`

---

## Comment Standards (MANDATORY)

### Every file
Must have a top-level comment explaining its purpose in one sentence.

### Every exported/public function
Must have a doc comment. Write for a technical project manager, not a compiler.

### Complex logic blocks
Must have inline comments explaining the **why**, not the what. If the code is removing a workaround for a specific bug, name the bug.

### Do NOT comment obvious code
`// increment counter` above `counter++` is noise. Delete it.

### Write for comprehension
Comments answer: "Why does this exist?" and "What breaks if this is removed?"

---

## Structural Rules

- **No half-finished implementations.** Do not deliver stub functions, `TODO` placeholders, or `// implement later` comments as a final answer.
- **No backwards-compatibility hacks.** If something is unused, delete it. Don't rename to `_old` or wrap in a `// removed` comment.
- **No error swallowing.** If an operation can fail, handle the error explicitly. `if err != nil { return err }` is never wrong. Silent failures are always wrong.
- **No magic numbers.** Any numeric literal that is not 0 or 1 must be assigned to a named constant with a descriptive name.
- **Minimal scope.** Variables should be declared in the tightest scope where they are needed.

---

## Go-Specific Rules

- Use `fmt.Errorf("context: %w", err)` for error wrapping — never `errors.New` on a pre-existing error
- Prefer early returns over deeply nested `if` blocks
- Table-driven tests for any function with more than two input/output variations
- Never use `interface{}` — use concrete types or typed generics

## React/JS-Specific Rules

- Prefer `const` over `let`, never `var`
- Destructure props at the function signature, not inside the body
- `useCallback` on handlers passed as props to avoid unnecessary child re-renders
- Never mutate state directly — always use the setter from `useState`
