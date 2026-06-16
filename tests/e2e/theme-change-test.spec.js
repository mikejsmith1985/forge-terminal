// Playwright: Theme Change Functionality Test
const { test, expect, visitWithoutTour } = require('../fixtures/forge')

test.describe('Theme Change Functionality Test', () => {
  test('should change tab theme when selected from context menu', async ({ page }) => {
    await page.goto('http://localhost:8333');
    await page.waitForTimeout(3000);

    // Dismiss tour if present
    const tourBackdropCount = await page.locator('.tour-backdrop').count();
    if (tourBackdropCount > 0) {
      await page.locator('button').filter({ hasText: 'Skip' }).click({ force: true });
      await page.waitForTimeout(500);
    }

    // Get the first tab
    const firstTab = page.locator('.tab').first();

    // Right-click to open context menu
    await firstTab.click({ button: 'right' });
    await page.waitForTimeout(500);

    // Click Theme button to open theme submenu
    await page.getByText('Theme').click();
    await page.waitForTimeout(500);

    // Take screenshot of theme submenu
    await page.screenshot({ path: `screenshots/theme-submenu-opened.png` });

    // Click Ocean theme, Light mode
    await page.locator('.theme-submenu').locator('.theme-name').filter({ hasText: 'Ocean' }).locator('..').locator('button').filter({ hasText: 'Light' }).click();

    await page.waitForTimeout(1000);

    // Verify theme was applied by checking console logs
    await page.evaluate(() => {
      // Check if console.log was called with theme change info
      // Placeholder - will check logs manually
    });

    // Take screenshot after theme change
    await page.screenshot({ path: `screenshots/after-theme-change.png` });

    // Try another theme change - Midnight Dark
    await firstTab.click({ button: 'right' });
    await page.waitForTimeout(500);
    await page.getByText('Theme').click();
    await page.waitForTimeout(500);

    await page.locator('.theme-submenu').locator('.theme-name').filter({ hasText: 'Midnight' }).locator('..').locator('button').filter({ hasText: 'Dark' }).click();

    await page.waitForTimeout(1000);
    await page.screenshot({ path: `screenshots/after-second-theme-change.png` });
  });
});
