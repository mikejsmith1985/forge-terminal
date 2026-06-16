// Playwright E2E test: Visual Theme Change Verification
const { test, expect, visitWithoutTour } = require('../fixtures/forge')

test.describe('Visual Theme Change Verification', () => {
  test('should visually change theme colors', async ({ page }) => {
    await page.goto('http://localhost:8333');
    await page.waitForTimeout(3000);

    // Dismiss tour if present
    const tourBackdropCount = await page.locator('.tour-backdrop').count();
    if (tourBackdropCount > 0) {
      await page.locator('button').filter({ hasText: 'Skip' }).click({ force: true });
      await page.waitForTimeout(500);
    }

    // Click first tab to activate it
    await page.locator('.tab').first().click();
    await page.waitForTimeout(1000);

    // Take screenshot BEFORE theme change
    await page.screenshot({ path: 'screenshots/01-before-theme-change.png' });

    // Right-click to open context menu
    await page.locator('.tab').first().click({ button: 'right' });
    await page.waitForTimeout(500);
    await page.getByText('Theme').click();
    await page.waitForTimeout(500);

    // Change to Forest Dark (green theme)
    await page.locator('.theme-submenu').locator('.theme-name').filter({ hasText: 'Forest' }).locator('..').locator('button', { hasText: 'Dark' }).click();

    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/02-after-forest-dark.png' });

    // Change to Rose Light (pink theme)
    await page.locator('.tab').first().click({ button: 'right' });
    await page.waitForTimeout(500);
    await page.getByText('Theme').click();
    await page.waitForTimeout(500);

    await page.locator('.theme-submenu').locator('.theme-name').filter({ hasText: 'Rose' }).locator('..').locator('button', { hasText: 'Light' }).click();

    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/03-after-rose-light.png' });

    // Change to Midnight Dark (purple theme)
    await page.locator('.tab').first().click({ button: 'right' });
    await page.waitForTimeout(500);
    await page.getByText('Theme').click();
    await page.waitForTimeout(500);

    await page.locator('.theme-submenu').locator('.theme-name').filter({ hasText: 'Midnight' }).locator('..').locator('button', { hasText: 'Dark' }).click();

    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/04-after-midnight-dark.png' });
  });
});
