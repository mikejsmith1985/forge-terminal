---
name: playwright-testing
description: Enforces Test-Driven Development workflow using Playwright. Use when user requests tests, validation, E2E testing, or implementation tasks.
---

# Playwright Testing Standard

## MANDATORY TDD Workflow

1. **RED:** Write failing test FIRST (never assume success)
2. **GREEN:** Implement minimal code to pass test
3. **REFACTOR:** Improve while tests pass

## Test Requirements

- **Selectors:** Use `data-testid` ONLY (never CSS/XPath)
- **Wait Strategy:** `await page.waitForLoadState('networkidle')` before assertions
- **User Perspective:** Test from user's viewpoint, not internal implementation
- **Visual Evidence:** Include screenshots in test output

## Test Structure Template

```javascript
test('feature description', async ({ page }) => {
  // Arrange
  await page.goto('/');
  
  // Act
  await page.getByTestId('action-button').click();
  await page.waitForLoadState('networkidle');
  
  // Assert
  const result = await page.getByTestId('result');
  await expect(result).toBeVisible();
  await expect(result).toHaveText('expected value');
  
  // Evidence
  await page.screenshot({ path: 'test-evidence.png', fullPage: true });
});
```

## Visual Dashboard (MANDATORY)

After ALL tests pass, generate `task-dashboard.html`:

- **Mermaid diagrams:** Show architecture changes
- **Test screenshot:** Passing test output
- **Outcome screenshot:** Final UI state
- **Max 10 words per text block**
- **Max 20 bullets total**

## Dashboard Template

```html
<!DOCTYPE html>
<html>
<head>
    <title>Task Complete: [Feature Name]</title>
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
</head>
<body>
    <h1>✅ [Feature Name] Complete</h1>
    
    <h2>Architecture</h2>
    <div class="mermaid">
    graph TB
        A[Component A] --> B[Component B]
    </div>
    
    <h2>Test Evidence</h2>
    <img src="test-evidence.png" />
    
    <h2>Final Outcome</h2>
    <img src="final-state.png" />
</body>
</html>
```

## Prohibited Verification Methods

- ❌ `grep` for text matching
- ❌ `curl` for API testing  
- ❌ `wget` for download verification
- ❌ Assumptions without test evidence

## Success Criteria

Task is complete ONLY when:
1. Playwright test passes ✅
2. Visual dashboard generated ✅
3. Screenshots show desired outcome ✅
