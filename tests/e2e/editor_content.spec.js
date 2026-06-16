// Playwright: Editor Content Loading tests
const { test, expect, visitWithoutTour } = require('../fixtures/forge')

test.describe('Editor Content Loading', () => {
  test.beforeEach(async ({ page }) => {
    await visitWithoutTour(page, '/');
    // Wait for initial load
    await page.locator('.terminal-container').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('opens a file and displays its content', async ({ page }) => {
    // 1. Open File Picker
    await page.locator('button').filter({ hasText: 'Files' }).click();

    // 2. Handle File Access Prompt if it appears
    // We check if the modal exists.
    if (await page.locator('button:has-text("Confirm Selection")').count() > 0) {
      await page.locator('button').filter({ hasText: 'Confirm Selection' }).click();
    }

    // 3. Double click the test file
    await page.locator('.lens-file-name').filter({ hasText: 'README.md' }).scrollIntoViewIfNeeded();
    await page.locator('.lens-file-name').filter({ hasText: 'README.md' }).dblclick({ force: true });

    // 4. Assert Editor is visible
    await expect(page.locator('.monaco-editor-container')).toBeVisible();

    // 5. Assert Content
    // Wait for content to load
    await page.waitForTimeout(2000); // Give it some time to fetch
    // Check if Monaco Editor contains the text.
    // Monaco renders text in lines.
    await expect(page.locator('.monaco-editor').filter({ hasText: 'Forge Terminal' })).toBeAttached();
  });
});
