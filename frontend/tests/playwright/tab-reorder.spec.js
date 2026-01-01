import { test, expect } from '@playwright/test';

test('drag and drop to reorder tabs', async ({ page }) => {
  // 1. Open the application
  await page.goto('/');

  // 2. Create multiple tabs
  // Initial tab is already there. Create 2 more.
  await page.click('button[aria-label="New tab"]');
  await page.click('button[aria-label="New tab"]');

  // Wait for tabs to appear
  await expect(page.locator('.tab')).toHaveCount(3);

  // 3. Rename tabs to identify them easily
  const tabs = page.locator('.tab');
  
  // Rename Tab 1
  await tabs.nth(0).dblclick();
  await page.keyboard.type('Tab One');
  await page.keyboard.press('Enter');

  // Rename Tab 2
  await tabs.nth(1).dblclick();
  await page.keyboard.type('Tab Two');
  await page.keyboard.press('Enter');

  // Rename Tab 3
  await tabs.nth(2).dblclick();
  await page.keyboard.type('Tab Three');
  await page.keyboard.press('Enter');

  // Verify initial order
  await expect(tabs.nth(0)).toContainText('Tab One');
  await expect(tabs.nth(1)).toContainText('Tab Two');
  await expect(tabs.nth(2)).toContainText('Tab Three');

  // Take screenshot before drag
  await page.screenshot({ path: 'test-results/tab-reorder-before.png' });

  // 4. Drag Tab 1 to position of Tab 3
  const source = tabs.nth(0);
  const target = tabs.nth(2);

  // Perform drag and drop
  await source.dragTo(target);

  // 5. Verify new order
  // Expected: Tab Two, Tab Three, Tab One (or similar depending on exact drop logic)
  // If drag and drop is NOT implemented, order will remain the same.
  
  // We expect the order to CHANGE. If it stays the same, the test should fail (or we assert it fails for TDD).
  // For TDD "Red" step, we assert that the order HAS changed, which will fail currently.
  
  // Take screenshot after drag
  await page.screenshot({ path: 'test-results/tab-reorder-after.png' });

  // Check if order changed. 
  // If drag/drop works, the first tab should NO LONGER be 'Tab One'
  await expect(tabs.nth(0)).not.toContainText('Tab One');
});
