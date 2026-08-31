// Playwright test: Find Settings Button
const { test, expect } = require('../fixtures/forge')

test.describe('Find Settings Button', () => {
  test('should load Forge and find settings button', async ({ page }) => {
    await page.goto('http://localhost:8333');
    await page.waitForTimeout(3000);

    // Take screenshot of the full page
    await page.screenshot({ path: 'screenshots/forge-homepage.png' });

    // Try to find settings button by aria-label
    const ariaBtn = page.locator('[aria-label*="Settings"], [aria-label*="settings"]');
    console.log('Found by aria-label:', ariaBtn);

    // Try to find settings icon
    await expect(page.locator('button').filter({ hasText: 'Settings' })).toBeAttached();
  });
});
