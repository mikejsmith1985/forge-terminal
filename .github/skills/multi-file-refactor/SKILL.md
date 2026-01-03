---
name: multi-file-refactor
description: Best practices for refactoring across multiple files. Use when restructuring logic across 5+ files.
---

# Multi-File Refactor Protocol

## Planning Phase (CRITICAL - Do NOT Skip)

### 1. Map Dependencies

Use `grep` to find ALL references to what you're changing:

```bash
grep -r "functionName" --include="*.js" --include="*.go"
```

**Critical Questions:**
- What imports this module?
- What calls this function?
- What types/interfaces depend on this?

### 2. Identify Interfaces

**What must stay stable?**
- Public APIs
- Component props
- Database schemas
- Network protocols

**What can change?**
- Internal implementation
- Private functions
- Local state management

### 3. Determine Order of Operations

**Ask:** Which files MUST change first?

```
Example Order:
1. Update types/interfaces (contracts)
2. Update implementations (consumers)
3. Update tests (verification)
4. Update documentation (clarity)
```

### 4. Verify Test Coverage

**Before touching code:**
- Run existing test suite
- Ensure tests pass ✅
- Note which areas lack coverage
- Write missing tests FIRST if needed

---

## Execution Phase

### Rule 1: One Concern at a Time

❌ **DO NOT MIX:**
- Refactoring + feature addition
- Renaming + behavior changes
- Performance optimization + restructuring

✅ **DO:**
- Pure refactor (preserve behavior)
- Then commit
- Then add feature in next commit

### Rule 2: Surgical Edits

**Change ONLY what's necessary:**
- Minimal line modifications
- Preserve formatting where possible
- Keep git diff focused
- Easier to review = fewer bugs

### Rule 3: Preserve Behavior

**Tests should pass throughout:**
- After each logical step
- Before moving to next file
- If tests break → revert → smaller steps

### Rule 4: Commit Atomically

**Each commit should:**
- Compile successfully
- Pass all tests
- Represent one logical change
- Have clear commit message

---

## Validation Phase

### 1. Run Full Test Suite

```bash
# Playwright tests
npm run test:e2e

# Unit tests
go test ./...

# Check for new failures
```

### 2. Check Git Diff

```bash
git diff --stat
git diff
```

**Look for:**
- ❌ Unintended whitespace changes
- ❌ Debug code left in
- ❌ Console.logs forgotten
- ❌ Commented code blocks
- ✅ Only expected changes

### 3. Manual Smoke Test

**Exercise affected workflows:**
- Open UI and click through
- Test edge cases manually
- Verify no console errors
- Check network requests

### 4. Generate Visual Dashboard

**Show before/after:**
- Architecture diagram (Mermaid)
- Test passing screenshot
- UI functioning screenshot
- Diff summary (files changed, lines modified)

---

## Common Pitfalls

### ❌ Pitfall 1: Changing Too Much

**Problem:** "While I'm here, let me also fix..."

**Solution:** Write TODO comments, handle in separate PR

### ❌ Pitfall 2: Breaking Contracts

**Problem:** Changed function signature, forgot to update callers

**Solution:** Use TypeScript/types, compiler catches it

### ❌ Pitfall 3: Skipping Tests

**Problem:** "I'll test later, just want to finish refactoring"

**Solution:** ALWAYS run tests between steps

### ❌ Pitfall 4: Not Checking Indirect Dependencies

**Problem:** Changed internal util, broke code 3 layers up

**Solution:** Use IDE "Find Usages" or grep exhaustively

---

## Refactor Checklist

```markdown
## Planning
- [ ] Mapped all dependencies with grep
- [ ] Identified stable interfaces
- [ ] Determined change order
- [ ] Verified existing tests pass

## Execution
- [ ] Made surgical, minimal changes
- [ ] Preserved existing behavior
- [ ] Tests pass after each step
- [ ] Committed atomically with clear messages

## Validation
- [ ] Full test suite passes
- [ ] Git diff shows only expected changes
- [ ] Manual smoke test completed
- [ ] Visual dashboard generated

## Clean Up
- [ ] Removed debug code
- [ ] Removed commented code
- [ ] Updated documentation
- [ ] Closed related issues
```

---

## Example: Refactoring Router Logic

**Task:** Move routing from CFO to new Router module

**Step 1: Plan**
```bash
grep -r "ResolveModel" --include="*.go"
# Found: handlers_chat.go, cfo.go, tests
```

**Step 2: Create Interface (New Contract)**
```go
// internal/routing/interface.go
type Router interface {
    ResolveModel(prompt, requested string, available []string) string
}
```

**Step 3: Move Implementation**
```go
// internal/routing/router.go
type DefaultRouter struct {}
func (r *DefaultRouter) ResolveModel(...) string {
    // Move CFO logic here
}
```

**Step 4: Update Consumers**
```go
// handlers_chat.go
router := routing.NewDefaultRouter()
model := router.ResolveModel(prompt, requested, available)
```

**Step 5: Run Tests**
```bash
go test ./internal/routing
go test ./cmd/forge/handlers_chat_test.go
```

**Step 6: Commit**
```
git commit -m "refactor: extract routing logic from CFO to Router module

- Created routing.Router interface
- Moved ResolveModel implementation
- Updated handlers_chat.go to use new Router
- All tests pass
"
```

---

## Success Criteria

Refactor is complete when:
1. All tests pass ✅
2. Git diff shows only intended changes ✅
3. Manual testing confirms behavior preserved ✅
4. Code is cleaner/more maintainable than before ✅
