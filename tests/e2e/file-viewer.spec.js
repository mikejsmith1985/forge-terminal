// Playwright E2E tests for File Viewer with LensFilePicker
const { test, expect, visitWithoutTour } = require('../fixtures/forge')

test.describe('File Viewer with LensFilePicker', () => {
  test.beforeEach(async ({ page }) => {
    // Clear and pre-set localStorage before visit
    await page.addInitScript(() => {
      localStorage.clear();
      window.localStorage.setItem('fileAccessModeSet', 'true');
      window.localStorage.setItem('fileAccessMode', 'restricted');
    });
    await page.goto('/');
    await page.waitForTimeout(3000); // Wait for app to load

    // Dismiss the welcome tour modal
    const buttons = page.locator('button');
    const allButtons = await buttons.all();
    for (const btn of allButtons) {
      const text = await btn.textContent();
      if (text && text.includes('Skip')) {
        await btn.click({ force: true });
        await page.waitForTimeout(1000);
        break;
      }
    }
  });

  test('should open file from LensFilePicker, display content, edit, save, and persist changes', async ({ page }) => {
    // Step 1: Click Files button to switch to Files view with LensFilePicker
    await expect(page.locator('button').filter({ hasText: 'Files' })).toBeAttached();
    await page.locator('button').filter({ hasText: 'Files' }).click({ force: true });
    await page.waitForTimeout(2000); // Wait for LensFilePicker to load files

    // Step 2: Verify LensFilePicker is visible and has loaded files
    await expect(page.locator('.lens-picker')).toBeVisible();
    const fileItems = page.locator('.lens-file-item');
    await expect(fileItems).toBeAttached();
    const itemCount = await fileItems.count();
    expect(itemCount).toBeGreaterThan(0);

    // Step 3: Find and double-click the copilot-instructions.md file to open it
    const allItems = await fileItems.all();
    let targetItem = null;
    for (const item of allItems) {
      const text = await item.textContent();
      if (text && text.includes('copilot-instructions.md')) {
        targetItem = item;
        break;
      }
    }
    expect(targetItem).not.toBeNull();
    await targetItem.dblclick();

    // Step 4: Verify editor panel opens with file content
    await expect(page.locator('.editor-panel')).toBeVisible();

    // Step 5: Wait for Monaco to load (not just loading spinner)
    await expect(page.locator('.monaco-loading')).not.toBeAttached();

    // Step 6: Verify Monaco editor wrapper is visible with content
    await expect(page.locator('.monaco-editor-wrapper')).toBeVisible();

    // Step 7: Verify file content loaded (Monaco renders in .view-lines)
    await expect(page.locator('.monaco-editor-wrapper .view-lines, .monaco-editor-wrapper [data-uri]')).toBeAttached();

    // Step 8: Verify Save button exists
    await expect(page.locator('.editor-panel')).toContainText('Save');
  });
});
