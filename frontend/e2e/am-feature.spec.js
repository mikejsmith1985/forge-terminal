import { test, expect } from '@playwright/test';

// Helper function to dismiss any visible toasts
async function dismissToasts(page) {
  await page.waitForTimeout(500);
  const toastCloseButtons = page.locator('.toast .toast-close');
  const count = await toastCloseButtons.count();
  for (let i = 0; i < count; i++) {
    try {
      await toastCloseButtons.nth(i).click({ timeout: 1000 });
    } catch (e) {
      // Toast may have already closed
    }
  }
  await page.waitForTimeout(300);
}

test.describe('AM (Artificial Memory) Feature', () => {

  // Clear session before each test for isolation
  test.beforeEach(async ({ page }) => {
    await page.request.post('/api/sessions', {
      data: { tabs: [], activeTabId: '' }
    });
  });

  test('should show AM Logging option in tab context menu', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await dismissToasts(page);

    // Wait for terminal
    await page.waitForTimeout(2000);

    // Right-click on the tab to open context menu
    const tab = page.locator('.tab-bar .tab').first();
    await tab.click({ button: 'right' });

    // Context menu should be visible
    const contextMenu = page.locator('.tab-context-menu');
    await expect(contextMenu).toBeVisible();

    // Should have AM Logging option
    const amOption = contextMenu.locator('button:has-text("AM Logging")');
    await expect(amOption).toBeVisible();
  });

  test('should toggle AM Logging via context menu', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await dismissToasts(page);

    // Wait for terminal
    await page.waitForTimeout(2000);

    // Right-click on the tab to open context menu
    const tab = page.locator('.tab-bar .tab').first();
    await tab.click({ button: 'right' });

    // Click AM Logging option
    const amOption = page.locator('.tab-context-menu button:has-text("AM Logging")');
    await amOption.click();

    // Wait for toast
    await page.waitForTimeout(500);

    // Should show success toast
    const toast = page.locator('.toast');
    await expect(toast.first()).toContainText(/AM Logging enabled/i);

    // Tab should now have am-enabled class
    await expect(tab).toHaveClass(/am-enabled/);
  });

  test('should call AM enable API when toggling', async ({ page }) => {
    let amEnableCalled = false;
    
    page.on('request', request => {
      if (request.url().includes('/api/am/enable') && request.method() === 'POST') {
        amEnableCalled = true;
      }
    });

    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await dismissToasts(page);

    // Wait for terminal
    await page.waitForTimeout(2000);

    // Right-click on the tab to open context menu
    const tab = page.locator('.tab-bar .tab').first();
    await tab.click({ button: 'right' });

    // Click AM Logging option
    const amOption = page.locator('.tab-context-menu button:has-text("AM Logging")');
    await amOption.click();

    // Wait for API call
    await page.waitForTimeout(500);

    expect(amEnableCalled).toBe(true);
  });

  test('should persist AM state in session', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await dismissToasts(page);

    // Wait for terminal
    await page.waitForTimeout(2000);

    // Enable AM via context menu
    const tab = page.locator('.tab-bar .tab').first();
    await tab.click({ button: 'right' });
    await page.locator('.tab-context-menu button:has-text("AM Logging")').click();
    await dismissToasts(page);

    // Wait for session save
    await page.waitForTimeout(1500);

    // Check session API
    const sessionRes = await page.request.get('/api/sessions');
    const session = await sessionRes.json();
    
    // Session should have AM enabled for the tab
    if (session.tabs && session.tabs.length > 0) {
      expect(session.tabs[0].amEnabled).toBe(true);
    }
  });

  test('should check for recoverable sessions via API', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });

    // Call the AM check API
    const checkRes = await page.request.get('/api/am/check');
    expect(checkRes.ok()).toBe(true);

    const checkData = await checkRes.json();
    // Should have hasRecoverable field
    expect(checkData).toHaveProperty('hasRecoverable');
    expect(checkData).toHaveProperty('sessions');
    expect(Array.isArray(checkData.sessions)).toBe(true);
  });

  test('should show AM indicator icon when enabled', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await dismissToasts(page);

    // Wait for terminal
    await page.waitForTimeout(2000);

    // Enable AM via context menu
    const tab = page.locator('.tab-bar .tab').first();
    await tab.click({ button: 'right' });
    await page.locator('.tab-context-menu button:has-text("AM Logging")').click();
    await dismissToasts(page);

    // Wait for state update
    await page.waitForTimeout(500);

    // AM indicator should be visible
    const amIndicator = tab.locator('.am-indicator');
    await expect(amIndicator).toBeVisible();
  });

  test('should disable AM Logging when toggled again', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await dismissToasts(page);

    // Wait for terminal
    await page.waitForTimeout(2000);

    // Enable AM first
    const tab = page.locator('.tab-bar .tab').first();
    await tab.click({ button: 'right' });
    await page.locator('.tab-context-menu button:has-text("AM Logging")').click();
    await dismissToasts(page);
    await page.waitForTimeout(500);

    // Tab should have am-enabled class
    await expect(tab).toHaveClass(/am-enabled/);

    // Disable AM
    await tab.click({ button: 'right' });
    await page.locator('.tab-context-menu button:has-text("AM Logging")').click();
    await dismissToasts(page);
    await page.waitForTimeout(500);

    // Tab should no longer have am-enabled class
    await expect(tab).not.toHaveClass(/am-enabled/);
  });

});
