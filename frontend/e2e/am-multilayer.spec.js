import { test, expect } from '@playwright/test';

/**
 * AM (Artificial Memory) Multi-Layer System Tests
 * Tests the new AM architecture which is gated behind Dev Mode
 */

async function enableDevMode(page) {
  // Set devMode directly in localStorage and reload
  await page.evaluate(() => {
    localStorage.setItem('devMode', 'true');
  });
  await page.reload();
  await page.waitForSelector('.app', { timeout: 10000 });
  await page.waitForTimeout(500);
}

async function disableDevMode(page) {
  await page.evaluate(() => {
    localStorage.setItem('devMode', 'false');
  });
  await page.reload();
  await page.waitForSelector('.app', { timeout: 10000 });
  await page.waitForTimeout(500);
}

async function dismissToasts(page) {
  await page.waitForTimeout(500);
  const toastCloseButtons = page.locator('.toast .toast-close');
  const count = await toastCloseButtons.count();
  for (let i = 0; i < count; i++) {
    try {
      await toastCloseButtons.nth(i).click({ timeout: 500 });
    } catch (e) {
      // Toast may have already closed
    }
  }
  await page.waitForTimeout(300);
}

test.describe('AM System - Dev Mode Gating', () => {

  test.beforeEach(async ({ page }) => {
    // Clear session
    await page.request.post('/api/sessions', {
      data: { tabs: [], activeTabId: '' }
    });
  });

  test('AM Monitor should be hidden when Dev Mode is off', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await dismissToasts(page);
    await page.waitForTimeout(1000);

    // AM Monitor should NOT be visible
    const amMonitor = page.locator('.am-monitor');
    await expect(amMonitor).not.toBeVisible();
  });

  test('AM Monitor should be visible when Dev Mode is on', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await dismissToasts(page);

    await enableDevMode(page);
    await page.waitForTimeout(500);

    // AM Monitor should now be visible
    const amMonitor = page.locator('.am-monitor');
    await expect(amMonitor).toBeVisible();
  });

  test('AM Logging toggle should be hidden in context menu when Dev Mode is off', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await dismissToasts(page);
    await page.waitForTimeout(1000);

    // Right-click on tab
    const tab = page.locator('.tab-bar .tab').first();
    await tab.click({ button: 'right' });

    // Context menu should be visible
    const contextMenu = page.locator('.tab-context-menu');
    await expect(contextMenu).toBeVisible();

    // AM Logging option should NOT be visible
    const amOption = contextMenu.locator('button:has-text("AM Logging")');
    await expect(amOption).not.toBeVisible();
  });

  test('AM Logging toggle should be visible in context menu when Dev Mode is on', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await dismissToasts(page);

    await enableDevMode(page);
    await page.waitForTimeout(500);

    // Right-click on tab
    const tab = page.locator('.tab-bar .tab').first();
    await tab.click({ button: 'right' });

    // Context menu should have AM Logging option
    const contextMenu = page.locator('.tab-context-menu');
    const amOption = contextMenu.locator('button:has-text("AM Logging")');
    await expect(amOption).toBeVisible();
  });
});

test.describe('AM System - Health API', () => {

  test('GET /api/am/health should return system status', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    const res = await page.request.get('/api/am/health');
    expect(res.ok()).toBe(true);

    const data = await res.json();
    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('layers');
    expect(data).toHaveProperty('metrics');
    expect(Array.isArray(data.layers)).toBe(true);
  });

  test('Health API should show layer statuses', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    const res = await page.request.get('/api/am/health');
    const data = await res.json();

    // Should have 5 layers
    expect(data.layers.length).toBe(5);

    // Check layer structure
    for (const layer of data.layers) {
      expect(layer).toHaveProperty('layerId');
      expect(layer).toHaveProperty('name');
      expect(layer).toHaveProperty('status');
    }
  });

  test('Health API metrics should include conversation counts', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    const res = await page.request.get('/api/am/health');
    const data = await res.json();

    // Match actual API field names
    expect(data.metrics).toHaveProperty('conversationsActive');
    expect(data.metrics).toHaveProperty('conversationsStarted');
    expect(data.metrics).toHaveProperty('conversationsComplete');
    expect(data.metrics).toHaveProperty('layersOperational');
    expect(data.metrics).toHaveProperty('layersTotal');
  });
});

test.describe('AM System - Active Conversations API', () => {

  test('GET /api/am/conversations should return active conversations', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    const res = await page.request.get('/api/am/conversations');
    expect(res.ok()).toBe(true);

    const data = await res.json();
    expect(data).toHaveProperty('active');
    expect(data).toHaveProperty('count');
    expect(typeof data.count).toBe('number');
  });
});

test.describe('AM System - Session Recovery API', () => {

  test('GET /api/am/check should return recovery info', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    const res = await page.request.get('/api/am/check');
    expect(res.ok()).toBe(true);

    const data = await res.json();
    expect(data).toHaveProperty('hasRecoverable');
    expect(data).toHaveProperty('sessions');
    expect(Array.isArray(data.sessions)).toBe(true);
  });
});

test.describe('AM System - LLM Conversations API', () => {

  test('GET /api/am/llm/conversations/:tabId should return conversations for tab', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    const res = await page.request.get('/api/am/llm/conversations/test-tab-123');
    expect(res.ok()).toBe(true);

    const data = await res.json();
    expect(data).toHaveProperty('success');
    expect(data).toHaveProperty('conversations');
    expect(data).toHaveProperty('count');
    expect(data.success).toBe(true);
    expect(Array.isArray(data.conversations)).toBe(true);
  });
});

test.describe('AM System - UI Integration', () => {

  test('AM Monitor should display system status in Dev Mode', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await dismissToasts(page);

    await enableDevMode(page);
    await page.waitForTimeout(1000);

    const amMonitor = page.locator('.am-monitor');
    await expect(amMonitor).toBeVisible();

    // Should have some text content - AM Monitor now shows "Log On/Off" style
    const text = await amMonitor.textContent();
    expect(text).toMatch(/Log|AM/i);
  });

  test('AM toggle should update tab state when enabled', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await dismissToasts(page);

    await enableDevMode(page);
    await page.waitForTimeout(500);

    // Get the tab before enabling AM
    const tab = page.locator('.tab-bar .tab').first();
    
    // Verify tab doesn't have am-enabled class yet
    const classBeforeList = await tab.getAttribute('class');
    const hadAMBefore = classBeforeList?.includes('am-enabled') || false;

    // Right-click on tab
    await tab.click({ button: 'right' });

    // Click AM Logging
    await page.locator('.tab-context-menu button:has-text("AM Logging")').click();
    await page.waitForTimeout(500);

    // Get tab class after toggle
    const classAfterList = await tab.getAttribute('class');
    const hasAMAfter = classAfterList?.includes('am-enabled') || false;

    // State should have changed
    expect(hasAMAfter).not.toBe(hadAMBefore);
  });

  test('Tab should show AM indicator when enabled in Dev Mode', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await dismissToasts(page);

    await enableDevMode(page);
    await page.waitForTimeout(500);

    // Enable AM
    const tab = page.locator('.tab-bar .tab').first();
    await tab.click({ button: 'right' });
    await page.locator('.tab-context-menu button:has-text("AM Logging")').click();
    await dismissToasts(page);
    await page.waitForTimeout(500);

    // Tab should have AM indicator
    const amIndicator = tab.locator('.am-indicator');
    await expect(amIndicator).toBeVisible();
  });
});

test.describe('AM System - Settings Integration', () => {

  test('AM Default toggle should be in settings', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await dismissToasts(page);

    // Open settings
    await page.locator('button[title="Shell Settings"]').click();
    await page.waitForTimeout(300);

    // Should have AM Default toggle
    const amDefaultCheckbox = page.locator('input[name="amDefaultEnabled"]');
    await expect(amDefaultCheckbox).toBeVisible();
  });

  test('Dev Mode toggle should be in settings', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await dismissToasts(page);

    // Open settings
    await page.locator('button[title="Shell Settings"]').click();
    await page.waitForTimeout(300);

    // Should have Dev Mode toggle
    const devModeCheckbox = page.locator('input[name="devMode"]');
    await expect(devModeCheckbox).toBeVisible();
  });
});
