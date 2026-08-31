/**
 * Playwright test case for LensFilePicker + File Viewer path resolution bug
 *
 * BUG: When files are opened from LensFilePicker, relative paths from subdirectories
 * are not properly resolved against the rootPath in the backend.
 *
 * Expected: File content should be displayed in MonacoEditor
 * Actual: Blank/empty editor (file fails to load)
 */

const { test, expect } = require('../fixtures/forge');

test.describe('LensFilePicker File Viewer - Path Resolution Bug', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('fileAccessModeSet', 'true');
      window.localStorage.setItem('fileAccessMode', 'restricted');
    });
    await page.goto('/');
    await page.waitForTimeout(3000);

    // Dismiss welcome tour
    const buttons = page.locator('button');
    const allButtons = await buttons.all();
    for (const btn of allButtons) {
      const text = await btn.textContent();
      if (text && text.includes('Skip')) {
        await btn.click({ force: true });
        break;
      }
    }
    await page.waitForTimeout(1000);
  });

  test('should display file content when opening file from subdirectory via LensFilePicker', async ({ page }) => {
    // Step 1: Click Files button
    await page.getByRole('button', { name: 'Files' }).click({ force: true });
    await page.waitForTimeout(2000);

    // Step 2: Verify LensFilePicker loaded
    await expect(page.locator('.lens-picker')).toBeVisible();
    await expect(page.locator('.lens-file-item').first()).toBeAttached();
    // Verify at least one file item is present
    const fileItemCount = await page.locator('.lens-file-item').count();
    expect(fileItemCount).toBeGreaterThan(0);

    // Step 3: Open copilot-instructions.md (in .github subdirectory)
    const fileItems = page.locator('.lens-file-item');
    const allItems = await fileItems.all();
    let targetItem = null;
    for (const item of allItems) {
      const text = await item.textContent();
      if (text && text.includes('copilot-instructions.md')) {
        targetItem = item;
        break;
      }
    }
    expect(targetItem, 'copilot-instructions.md file should be in the list').toBeTruthy();
    await targetItem.dblclick();

    // Step 4: Editor panel should open
    await expect(page.locator('.editor-panel')).toBeVisible();

    // Step 5: CRITICAL TEST - Monaco editor should NOT show loading state forever
    await expect(page.locator('.monaco-loading')).not.toBeAttached();

    // Step 6: CRITICAL TEST - File content must be displayed (not blank)
    // The file contains "NEVER FUCKING KILL THE SESSION" at the top
    const editorWrapper = page.locator('.monaco-editor-wrapper');
    await expect(editorWrapper).toBeVisible();
    // Monaco loads content into a contenteditable div
    const monacoContent = editorWrapper.locator('[data-uri], .view-lines, .monaco-editor');
    await expect(monacoContent.first()).toBeAttached();
    await expect(monacoContent.first()).not.toBeEmpty();

    // Step 7: Verify the actual file content is present (not error message)
    await expect(page.locator('.monaco-editor-wrapper')).toContainText('NEVER');

    // Step 8: Verify toolbar shows filename
    await expect(page.locator('.monaco-filename')).toContainText('copilot-instructions.md');
  });

  test('should log file path information for debugging', async ({ page }) => {
    // Intercept the file read API call to inspect the request
    let capturedRequest = null;
    await page.route('/api/files/read', async (route) => {
      const request = route.request();
      capturedRequest = await request.postDataJSON();
      await route.continue();
    });

    // Click Files and open a file
    await page.getByRole('button', { name: 'Files' }).click({ force: true });
    await page.waitForTimeout(2000);

    const fileItems = page.locator('.lens-file-item');
    const allItems = await fileItems.all();
    let targetItem = null;
    for (const item of allItems) {
      const text = await item.textContent();
      if (text && text.includes('copilot-instructions.md')) {
        targetItem = item;
        break;
      }
    }

    if (targetItem) {
      // Set up a promise to wait for the API call before double-clicking
      const fileReadResponse = page.waitForRequest('/api/files/read', { timeout: 10000 });
      await targetItem.dblclick();

      // Wait for the API call and inspect it
      await fileReadResponse;

      // Log what we captured via the route intercept
      console.log('File Read Request:', JSON.stringify(capturedRequest));

      // Verify the request body has the expected properties
      expect(capturedRequest).toHaveProperty('path');
      expect(capturedRequest).toHaveProperty('rootPath');

      console.log(`Path: ${capturedRequest.path}`);
      console.log(`RootPath: ${capturedRequest.rootPath}`);

      // The bug: path is relative (e.g. "copilot-instructions.md")
      // but backend resolves it against server cwd, not rootPath
    }
  });
});
