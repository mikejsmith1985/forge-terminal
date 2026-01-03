---
name: task-classification
description: Classifies tasks by complexity pattern for smart routing. Auto-invoked for all implementation requests.
---

# Task Classification Guidelines

## Fast Pattern Detection (No LLM Needed)

Classify tasks based on prompt keywords + file count for smart routing.

## Pattern Definitions

### 1. Architecture (Complexity: 9-10)

**Keywords:** "design", "architecture", "system", "integrate", "plan"

**Indicators:**
- Multiple new components needed
- Cross-cutting changes across layers
- Requires design phase before implementation
- Affects multiple subsystems

**Example:** "Design smart routing system with DB + UI + backend"

**File Count:** Usually 8+ files

---

### 2. Multi-File Refactor (Complexity: 7-8)

**Keywords:** "refactor", "restructure", "reorganize", "rename across"

**Indicators:**
- 5+ files mentioned with `@` syntax
- Moving logic between components
- Changing interfaces/contracts
- Preserving existing behavior

**Example:** "Refactor routing logic across CFO, SLM, and Task Dashboard"

**File Count:** 5-10 files

---

### 3. Feature Implementation (Complexity: 5-7)

**Keywords:** "add", "create", "implement", "build"

**Indicators:**
- New functionality (not refactoring existing)
- 2-5 files involved
- Both backend and frontend changes
- Requires tests

**Example:** "Add model recommendation panel to Task Dashboard"

**File Count:** 2-5 files

---

### 4. Bugfix (Complexity: 4-6)

**Keywords:** "fix", "bug", "broken", "not working", "issue"

**Indicators:**
- Something currently broken
- 1-3 files targeted
- Root cause investigation needed
- Tests should reproduce bug first

**Example:** "Fix tour dismissal not persisting in localStorage"

**File Count:** 1-3 files

---

### 5. Testing (Complexity: 3-5)

**Keywords:** "test", "validate", "spec", "e2e", "playwright"

**Indicators:**
- Writing test coverage only
- No production code changes
- Test files only involved
- May need test fixtures/helpers

**Example:** "Write Playwright tests for routing UI"

**File Count:** 1-3 test files

---

### 6. Documentation (Complexity: 1-3)

**Keywords:** "document", "readme", "guide", "comment"

**Indicators:**
- Markdown files only
- No code changes
- Explaining existing functionality
- Quick turnaround

**Example:** "Update README with smart routing usage"

**File Count:** 1-2 markdown files

---

## Classification Output Format

```json
{
  "pattern": "multi-file-refactor",
  "complexity": 8,
  "file_count": 7,
  "reasoning": "Restructuring routing across CFO + SLM + Dashboard",
  "recommended_model": "opus",
  "estimated_prompts": 2
}
```

## Detection Logic (Pseudocode)

```javascript
function classifyTask(prompt, mentionedFiles) {
  const lower = prompt.toLowerCase();
  const fileCount = mentionedFiles.length;
  
  // Check keywords in order of specificity
  if (containsAny(lower, ['design', 'architecture', 'integrate'])) {
    return { pattern: 'architecture', complexity: 9, fileCount };
  }
  
  if (contains(lower, 'refactor') && fileCount >= 5) {
    return { pattern: 'multi-file-refactor', complexity: 8, fileCount };
  }
  
  if (containsAny(lower, ['fix', 'bug', 'broken'])) {
    return { pattern: 'bugfix', complexity: 5, fileCount };
  }
  
  if (containsAny(lower, ['add', 'create', 'implement'])) {
    return { pattern: 'feature', complexity: 6, fileCount };
  }
  
  if (containsAny(lower, ['test', 'spec', 'playwright'])) {
    return { pattern: 'testing', complexity: 4, fileCount };
  }
  
  if (containsAny(lower, ['document', 'readme'])) {
    return { pattern: 'documentation', complexity: 2, fileCount };
  }
  
  // Default
  return { pattern: 'unknown', complexity: 5, fileCount };
}
```

## Integration with Smart Router

1. User submits prompt
2. **Fast classification** runs (no LLM call needed)
3. Pattern → query effectiveness log
4. Historical data → recommend best model
5. Show recommendation to user

## Model Recommendations by Pattern

Based on typical complexity:

- **Architecture:** Opus (needs creativity + planning)
- **Multi-file refactor:** Opus or Sonnet (depends on complexity)
- **Feature:** Sonnet (balanced speed/quality)
- **Bugfix:** Sonnet or Haiku (depends on investigation needed)
- **Testing:** Sonnet (needs understanding of code)
- **Documentation:** Haiku (fast, straightforward)

These are DEFAULTS - actual recommendations come from effectiveness tracking.
