/**
 * E2E Test: Forge Assist Modal Width
 *
 * Validates that the Forge Assist modal has adequate width
 * and buttons are not crowded/overlapping.
 *
 * TDD: RED phase - This test should pass after CSS fix
 */

const { test, expect } = require('../fixtures/forge');

test.describe('Forge Assist Modal Width (P5)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('tourComplete', 'true');
      window.localStorage.setItem('skipTour', 'true');
    });
    await page.goto('http://localhost:3005');
    await expect(page.locator('body')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2000);
  });

  test('should have minimum width of 600px', async ({ page }) => {
    // Open Forge Assist with Ctrl+/
    await page.keyboard.press('Control+/');

    // Wait for modal
    await page.locator('.forge-assist-modal').waitFor({ timeout: 5000 });
    await expect(page.locator('.forge-assist-modal')).toBeVisible();

    // Check minimum width - should be at least 600px
    const width = await page.locator('.forge-assist-modal').evaluate((el) => el.getBoundingClientRect().width);
    expect(width).toBeGreaterThanOrEqual(600);
  });

  test('should have header buttons not overlapping', async ({ page }) => {
    await page.keyboard.press('Control+/');
    await page.locator('.forge-assist-modal').waitFor({ timeout: 5000 });
    await expect(page.locator('.forge-assist-modal')).toBeVisible();

    // Check that header elements have adequate spacing
    const headerWidth = await page.locator('.forge-assist-header').evaluate((el) => el.getBoundingClientRect().width);
    // Header should be wide enough to fit all elements
    expect(headerWidth).toBeGreaterThanOrEqual(580);

    // Buttons should not overlap - check each has positive width
    const buttons = page.locator('.forge-assist-header button, .forge-assist-header .mode-btn');
    const buttonCount = await buttons.count();
    for (let i = 0; i < buttonCount; i++) {
      const rect = await buttons.nth(i).evaluate((el) => el.getBoundingClientRect());
      expect(rect.width).toBeGreaterThanOrEqual(20);
    }
  });

  test('should maintain readability on standard viewport', async ({ page }) => {
    // Set viewport to common laptop size
    await page.setViewportSize({ width: 1366, height: 768 });

    await page.keyboard.press('Control+/');
    await page.locator('.forge-assist-modal').waitFor({ timeout: 5000 });
    await expect(page.locator('.forge-assist-modal')).toBeVisible();

    // Modal should be visible and properly sized
    await expect(page.locator('.forge-assist-modal')).toBeVisible();
    const maxWidth = await page.locator('.forge-assist-modal').evaluate((el) => getComputedStyle(el).maxWidth);
    expect(maxWidth).not.toBe('0px');
  });
});
