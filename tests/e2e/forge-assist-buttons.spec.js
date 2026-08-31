/**
 * E2E Test: Forge Assist Button Layout
 *
 * Validates that buttons in Forge Assist header do not overlap
 */

const { test, expect, visitWithoutTour, waitForTerminal } = require('../fixtures/forge')

test.describe('Forge Assist Button Layout', () => {
  test.beforeEach(async ({ page }) => {
    // Start Forge Terminal
    await visitWithoutTour(page, 'http://localhost:3005');
    await expect(page.locator('.terminal-container')).toBeVisible();
  });

  test('buttons should not overlap in Forge Assist header', async ({ page }) => {
    // Open Forge Assist with Ctrl+/
    await page.keyboard.press('Control+/');

    // Wait for modal to appear
    await expect(page.locator('.forge-assist-modal')).toBeVisible();

    // Get button positions
    const persistentRect = await page.locator('[data-testid="persistent-instructions-btn"]').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { right: r.right, left: r.left, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    });
    const filesRect = await page.locator('.forge-assist-instruction-toggle').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { right: r.right, left: r.left, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    });

    // Persistent button's right edge should not extend past Files button's left edge
    expect(persistentRect.right).toBeLessThanOrEqual(filesRect.left);

    console.log(`Persistent right: ${persistentRect.right}, Files left: ${filesRect.left}`);

    // Take screenshot
    await page.screenshot({ path: 'screenshots/forge-assist-buttons-no-overlap.png', clip: { x: 200, y: 50, width: 900, height: 150 } });
  });

  test('header should have reasonable button sizes', async ({ page }) => {
    // Open Forge Assist with Ctrl+/
    await page.keyboard.press('Control+/');
    await expect(page.locator('.forge-assist-modal')).toBeVisible();

    const rect = await page.locator('[data-testid="persistent-instructions-btn"]').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { width: r.width, height: r.height };
    });

    // Button should not be excessively wide
    expect(rect.width).toBeLessThan(150);

    // Button should not be excessively tall
    expect(rect.height).toBeLessThan(50);

    console.log(`Button dimensions: ${rect.width}x${rect.height}`);
  });
});
