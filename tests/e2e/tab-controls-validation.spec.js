// Playwright E2E — Tab Controls Settings Panel - Manual Validation

const { test, expect, visitWithoutTour } = require('../fixtures/forge');

test.describe('Tab Controls Settings Panel - Manual Validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8333');
    await page.waitForTimeout(2000);

    // Dismiss tour if present
    const tourBackdropCount = await page.locator('.tour-backdrop').count();
    if (tourBackdropCount > 0) {
      await page.getByRole('button', { name: 'Skip' }).click({ force: true });
      await page.waitForTimeout(500);
    }
  });

  test('should load Tab Controls panel without errors', async ({ page }) => {
    // Open Settings (button has title="Shell Settings")
    await page.locator('button[title="Shell Settings"]').click();
    await page.waitForTimeout(1000);

    // Click Tab Controls tab
    await page.getByText('Tab Controls').click();
    await page.waitForTimeout(2000);

    // Screenshot full modal
    await page.screenshot({ path: 'screenshots/tab-controls-full-panel.png' });

    // Verify no error message
    await expect(page.getByText('Failed to load settings')).not.toBeAttached();

    // Verify Global Presets section
    await expect(page.getByText('Global Presets')).toBeVisible();
    await expect(page.locator('label').filter({ hasText: 'Auto-cycle' }).first()).toBeVisible();
    await expect(page.locator('label').filter({ hasText: 'Auto-cycle dark-only' })).toBeVisible();
    await expect(page.locator('label').filter({ hasText: 'Auto-cycle light-only' })).toBeVisible();

    // Verify visual diagram
    await expect(page.getByText('Visual Preview')).toBeVisible();

    // Verify per-tab defaults grid
    await expect(page.getByText('Tab 1')).toBeVisible();
    await expect(page.getByText('Tab 20')).toBeVisible();

    // Verify split themes section
    await expect(page.getByText('Terminal Theme')).toBeVisible();
    await expect(page.getByText('Control Ribbon')).toBeVisible();

    // Verify Save button
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();

    console.log('All sections validated successfully');
  });
});
