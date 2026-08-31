// Playwright: Theme Change with Console Logging
const { test, expect, visitWithoutTour } = require('../fixtures/forge')
const fs = require('fs')

test.describe('Theme Change with Console Logging', () => {
  let logs = [];

  test.beforeEach(async ({ page }) => {
    logs = [];

    // Capture console messages before navigation
    page.on('console', (msg) => {
      const type = msg.type(); // 'log', 'warn', 'error', etc.
      const args = [msg.text()];
      if (type === 'log' || type === 'warn' || type === 'error') {
        logs.push({ type, args });
      }
    });

    await visitWithoutTour(page, 'http://localhost:8333');
    await page.waitForTimeout(3000);

    // Dismiss tour if present
    const tourBackdropCount = await page.locator('.tour-backdrop').count();
    if (tourBackdropCount > 0) {
      await page.locator('button').filter({ hasText: 'Skip' }).click({ force: true });
      await page.waitForTimeout(500);
    }
  });

  test('should log theme change events', async ({ page }) => {
    // Get the first tab and CLICK IT to make it active
    const firstTab = page.locator('.tab').first();
    await firstTab.click();
    await page.waitForTimeout(1000);

    // Right-click to open context menu
    await firstTab.click({ button: 'right' });
    await page.waitForTimeout(500);

    // Click Theme button
    await page.getByText('Theme').click();
    await page.waitForTimeout(500);

    // Click Molten Dark (different from current theme)
    const themeSubmenu = page.locator('.theme-submenu');
    await themeSubmenu.locator('.theme-name').filter({ hasText: 'Molten' }).locator('..').locator('button').filter({ hasText: 'Dark' }).click();

    await page.waitForTimeout(2000);

    // Print all console logs
    console.log('=== Console Logs ===');
    logs.forEach(log => {
      const msg = log.args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      console.log(`[${log.type}] ${msg}`);
    });

    // Check for specific logs
    const themeChangeLogs = logs.filter(log =>
      log.args.some(arg =>
        String(arg).includes('handleThemeChange') ||
        String(arg).includes('changeTabTheme') ||
        String(arg).includes('Theme useEffect')
      )
    );

    console.log(`Found ${themeChangeLogs.length} theme-related logs`);

    // Write logs to file for inspection
    fs.writeFileSync('theme-change-logs.json', JSON.stringify({ logs, themeChangeLogs }, null, 2));
  });
});
