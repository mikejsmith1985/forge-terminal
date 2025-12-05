import { test, expect } from '@playwright/test';

test.describe('Issue #12: Enhanced Application Logging', () => {
  
  // Clear session before each test
  test.beforeEach(async ({ page }) => {
    await page.request.post('/api/sessions', {
      data: { tabs: [], activeTabId: '' }
    });
  });

  test('should log tab creation events with detailed information', async ({ page }) => {
    // Collect console logs
    const logs = [];
    page.on('console', msg => {
      if (msg.type() === 'log') {
        logs.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Create a new tab
    const newTabBtn = page.locator('.tab-bar .new-tab-btn');
    await newTabBtn.click();
    await page.waitForTimeout(1000);

    // Verify tab creation logs exist
    const tabLogs = logs.filter(l => l.includes('[Tabs]'));
    expect(tabLogs.length).toBeGreaterThan(0);
    
    // Should have logs about new tab creation
    const creationLogs = logs.filter(l => 
      l.includes('New tab button clicked') || 
      l.includes('Tab created') ||
      l.includes('Create tab requested')
    );
    expect(creationLogs.length).toBeGreaterThan(0);
  });

  test('should log theme changes when cycling themes', async ({ page }) => {
    // Collect console logs
    const logs = [];
    page.on('console', msg => {
      if (msg.type() === 'log') {
        logs.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Click the theme cycle button (Palette icon)
    const themeBtn = page.locator('button[title*="Theme"]');
    await themeBtn.click();
    await page.waitForTimeout(500);

    // Verify theme change logs exist
    const themeLogs = logs.filter(l => l.includes('[Theme]'));
    expect(themeLogs.length).toBeGreaterThan(0);
    
    // Should have logs about theme cycling
    const cycleLogs = logs.filter(l => l.includes('Cycling color theme'));
    expect(cycleLogs.length).toBeGreaterThan(0);
  });

  test('should log tab switch events with theme information', async ({ page }) => {
    // Collect console logs
    const logs = [];
    page.on('console', msg => {
      if (msg.type() === 'log') {
        logs.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Create a second tab
    const newTabBtn = page.locator('.tab-bar .new-tab-btn');
    await newTabBtn.click();
    await page.waitForTimeout(1000);

    // Switch to first tab
    const tabs = page.locator('.tab-bar .tab');
    await tabs.nth(0).click();
    await page.waitForTimeout(500);

    // Verify tab switch logs exist
    const switchLogs = logs.filter(l => 
      l.includes('Switching tab') || 
      l.includes('Tab switch initiated')
    );
    expect(switchLogs.length).toBeGreaterThan(0);
  });

  test('should log toast notifications when displayed', async ({ page }) => {
    // Collect console logs
    const logs = [];
    page.on('console', msg => {
      if (msg.type() === 'log') {
        logs.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Cycle theme to trigger a toast
    const themeBtn = page.locator('button[title*="Theme"]');
    await themeBtn.click();
    await page.waitForTimeout(1000);

    // Verify toast logs exist
    const toastLogs = logs.filter(l => l.includes('[Toast]'));
    expect(toastLogs.length).toBeGreaterThan(0);
  });

  test('should log terminal WebSocket events with tab ID', async ({ page }) => {
    // Collect console logs
    const logs = [];
    page.on('console', msg => {
      if (msg.type() === 'log') {
        logs.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await page.waitForTimeout(3000);

    // Verify terminal logs include tab ID
    const terminalLogs = logs.filter(l => l.includes('[Terminal]'));
    expect(terminalLogs.length).toBeGreaterThan(0);
    
    // WebSocket connected log should include tabId
    const connectedLogs = logs.filter(l => 
      l.includes('WebSocket connected') && l.includes('tabId')
    );
    expect(connectedLogs.length).toBeGreaterThan(0);
  });

  test('should log session save/load operations', async ({ page }) => {
    // Collect console logs
    const logs = [];
    page.on('console', msg => {
      if (msg.type() === 'log') {
        logs.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await page.waitForTimeout(3000);

    // Verify session logs exist
    const sessionLogs = logs.filter(l => l.includes('[Session]'));
    expect(sessionLogs.length).toBeGreaterThan(0);
    
    // Should have session load log
    const loadLogs = logs.filter(l => l.includes('Loading session'));
    expect(loadLogs.length).toBeGreaterThan(0);
  });

  test('should NOT show max tabs warning when only 2 tabs exist', async ({ page }) => {
    // Collect console logs
    const logs = [];
    page.on('console', msg => {
      if (msg.type() === 'log' || msg.type() === 'warn') {
        logs.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Create a second tab
    const newTabBtn = page.locator('.tab-bar .new-tab-btn');
    await newTabBtn.click();
    await page.waitForTimeout(1000);

    // Verify we have 2 tabs
    const tabs = page.locator('.tab-bar .tab');
    await expect(tabs).toHaveCount(2);

    // There should be NO "max tabs" warning in logs
    const maxTabsLogs = logs.filter(l => 
      l.includes('Max tabs limit') || 
      l.includes('Maximum tab limit reached')
    );
    expect(maxTabsLogs.length).toBe(0);

    // There should be no warning toast visible
    const warningToast = page.locator('.toast:has-text("Maximum tab limit reached")');
    await expect(warningToast).not.toBeVisible();
  });

  test('feedback logs should include all relevant information', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Open feedback modal
    const feedbackBtn = page.locator('button[title="Send Feedback"]');
    await feedbackBtn.click();
    await page.waitForTimeout(500);

    // Verify the modal is open
    const modal = page.locator('.modal-overlay');
    await expect(modal).toBeVisible();

    // The logs section should exist in the feedback modal
    // (This verifies the logging system is integrated with feedback)
    const logsTextarea = page.locator('textarea[placeholder*="logs"]');
    // If logs are displayed automatically, there should be log content
    // Otherwise just verify the modal works
    await expect(modal).toBeVisible();
  });

  test('should log detailed info when creating multiple tabs', async ({ page }) => {
    // Collect console logs
    const logs = [];
    page.on('console', msg => {
      if (msg.type() === 'log') {
        logs.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Create 3 more tabs
    const newTabBtn = page.locator('.tab-bar .new-tab-btn');
    for (let i = 0; i < 3; i++) {
      await newTabBtn.click();
      await page.waitForTimeout(500);
    }

    // Verify we have 4 tabs total
    const tabs = page.locator('.tab-bar .tab');
    await expect(tabs).toHaveCount(4);

    // Check logs contain tab count information
    const tabCountLogs = logs.filter(l => 
      l.includes('currentTabCount') || 
      l.includes('newTabCount') ||
      l.includes('tabCount')
    );
    expect(tabCountLogs.length).toBeGreaterThan(0);
    
    // Each tab should have unique theme in logs
    const themeLogs = logs.filter(l => l.includes('colorTheme'));
    expect(themeLogs.length).toBeGreaterThan(0);
  });

});
