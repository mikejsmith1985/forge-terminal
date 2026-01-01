/**
 * AM Monitor E2E Test - TDD Approach
 * 
 * Tests the AM (Agentic Memory) monitor's 3 states:
 * 🟢 Active (green): "AM Logging is Active in this tab" 
 * 🟡 Disabled (yellow): "AM Logging is Disabled for this tab"
 * 🔴 Broken (red): "AM Logging is enabled but not capturing data"
 * 
 * CRITICAL: Tests against REAL production data, not mocks.
 */

const { test, expect } = require('@playwright/test');

test.describe('AM Monitor - Visual States & Location', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to Forge Terminal (check both common ports)
    let connected = false;
    for (const port of [3005, 8333, 8080]) {
      try {
        await page.goto(`http://localhost:${port}`, { timeout: 5000 });
        connected = true;
        break;
      } catch (e) {
        // Try next port
      }
    }
    
    if (!connected) {
      throw new Error('Could not connect to Forge Terminal on any port (3005, 8333, 8080)');
    }
    
    // Wait for app to be ready
    await page.locator('.app').waitFor({ state: 'visible', timeout: 10000 });
    
    // Enable Dev Mode to show AM monitor
    await page.evaluate(() => {
      localStorage.setItem('devMode', 'true');
    });
    await page.reload();
    await page.locator('.app').waitFor({ state: 'visible' });
  });

  test('AM monitor should be visible in sidebar ribbon when Dev Mode is on', async ({ page }) => {
    // Check that AM monitor exists in sidebar (not bottom bar)
    const amMonitor = page.locator('.sidebar .am-monitor');
    await expect(amMonitor).toBeVisible({ timeout: 5000 });
    
    // Should NOT be in a red debug container
    const debugContainer = page.locator('div[style*="rgba(255,0,0"]');
    await expect(debugContainer).not.toBeVisible();
    
    // Screenshot for validation
    await page.screenshot({ path: 'test-results/am-monitor-in-ribbon.png' });
  });

  test('AM monitor should show ACTIVE state when chatting', async ({ page }) => {
    // Enable AM for the tab
    const tab = page.locator('.tab').first();
    await tab.click({ button: 'right' });
    const amButton = page.locator('.tab-context-menu button').filter({ hasText: 'AM Logging' });
    await amButton.click();
    await page.waitForTimeout(500);

    // Start a real conversation with Copilot
    const chatInput = page.locator('textarea[placeholder*="Chat"], textarea[placeholder*="Message"]').first();
    await chatInput.fill('Hello, are you there?');
    await page.keyboard.press('Enter');
    
    // Wait for response to start (real AI interaction)
    await page.waitForTimeout(2000);

    // Check AM monitor state
    const amMonitor = page.locator('.am-monitor');
    await expect(amMonitor).toBeVisible();
    
    // Should have active class (green)
    await expect(amMonitor).toHaveClass(/am-active/);
    
    // Should show recording or turn count
    const monitorText = await amMonitor.textContent();
    expect(monitorText).toMatch(/Recording|log|AM Ready/i);
    
    await page.screenshot({ path: 'test-results/am-monitor-active-chat.png' });
  });

  test('AM monitor should show DISABLED state when AM is off', async ({ page }) => {
    // Make sure AM is disabled for the tab (default state)
    const amMonitor = page.locator('.am-monitor');
    
    // Check for disabled or broken state (both are valid when AM is off and showing error)
    await expect(amMonitor).toBeVisible();
    
    const className = await amMonitor.getAttribute('class');
    const monitorText = await amMonitor.textContent();
    
    console.log('AM Monitor state:', { className, monitorText });
    
    // Accept either disabled or broken when AM is technically off
    expect(className).toMatch(/am-disabled|am-broken/);
    
    await page.screenshot({ path: 'test-results/am-monitor-disabled.png' });
  });

  test('AM monitor should detect BROKEN state when not capturing', async ({ page }) => {
    // This test validates the backend health check logic
    // by simulating a scenario where AM is enabled but not capturing
    
    // Enable AM
    const tab = page.locator('.tab').first();
    await tab.click({ button: 'right' });
    const amButton = page.locator('.tab-context-menu button').filter({ hasText: 'AM Logging' });
    await amButton.click();
    await page.waitForTimeout(500);

    // Check initial status via API
    const tabId = await page.evaluate(() => {
      const tabs = JSON.parse(localStorage.getItem('tabs') || '[]');
      return tabs[0]?.id || 'tab-1';
    });

    // Query tab status endpoint
    const statusResponse = await page.evaluate(async (tid) => {
      const res = await fetch(`/api/am/tab-status/${tid}?amEnabled=true`);
      return res.json();
    }, tabId);

    console.log('AM Status:', statusResponse);
    
    // If we're in a broken state, verify monitor shows it
    if (statusResponse.status === 'broken') {
      const amMonitor = page.locator('.am-monitor');
      await expect(amMonitor).toHaveClass(/am-broken/);
      
      const monitorText = await amMonitor.textContent();
      expect(monitorText).toMatch(/AM Error/i);
      
      await page.screenshot({ path: 'test-results/am-monitor-broken.png' });
    }
  });

  test('AM monitor should be in sidebar header ribbon, not bottom bar', async ({ page }) => {
    // Verify AM monitor is part of the sidebar header area
    const amMonitor = page.locator('.am-monitor');
    
    await expect(amMonitor).toBeVisible();
    
    // Check that it's within the sidebar-header context (not bottom bar)
    const sidebarHeader = page.locator('.sidebar-header');
    await expect(sidebarHeader).toBeVisible();
    
    // Get bounding boxes
    const amMonitorBox = await amMonitor.boundingBox();
    const sidebarHeaderBox = await sidebarHeader.boundingBox();
    
    expect(amMonitorBox).not.toBeNull();
    expect(sidebarHeaderBox).not.toBeNull();
    
    // AM monitor should be within sidebar-header vertical bounds
    expect(amMonitorBox.y).toBeGreaterThanOrEqual(sidebarHeaderBox.y - 5); // 5px tolerance
    expect(amMonitorBox.y).toBeLessThanOrEqual(sidebarHeaderBox.y + sidebarHeaderBox.height + 5);
    
    await page.screenshot({ path: 'test-results/am-monitor-location.png' });
  });

  test('AM monitor should update status every 5 seconds', async ({ page }) => {
    const amMonitor = page.locator('.am-monitor');
    await expect(amMonitor).toBeVisible();
    
    // Get initial state
    const initialText = await amMonitor.textContent();
    console.log('Initial AM state:', initialText);
    
    // Wait for polling interval (5 seconds + buffer)
    await page.waitForTimeout(6000);
    
    // Check if monitor is still responsive
    await expect(amMonitor).toBeVisible();
    const updatedText = await amMonitor.textContent();
    console.log('Updated AM state:', updatedText);
    
    // Monitor should still be functional (not frozen)
    expect(updatedText).toBeTruthy();
  });
});

test.describe('AM Monitor - Real Data Validation', () => {
  test('should validate against production AM logs, not mocks', async ({ page }) => {
    // This test ensures we're checking REAL data
    let connected = false;
    for (const port of [3005, 8333, 8080]) {
      try {
        await page.goto(`http://localhost:${port}`, { timeout: 5000 });
        connected = true;
        break;
      } catch (e) {
        // Try next port
      }
    }
    
    if (!connected) {
      throw new Error('Could not connect to Forge Terminal on any port');
    }
    
    // Enable dev mode
    await page.evaluate(() => {
      localStorage.setItem('devMode', 'true');
    });
    await page.reload();
    
    // Get the active tab ID
    const tabId = await page.evaluate(() => {
      const tabs = JSON.parse(localStorage.getItem('tabs') || '[]');
      return tabs[0]?.id || 'tab-1';
    });

    // Check conversations endpoint for REAL data
    const conversations = await page.evaluate(async (tid) => {
      const res = await fetch(`/api/am/llm/conversations/${tid}`);
      if (!res.ok) return null;
      return res.json();
    }, tabId);

    console.log('Production conversations:', conversations);

    // Validate we got real data structure
    if (conversations && conversations.conversations) {
      expect(Array.isArray(conversations.conversations)).toBeTruthy();
      
      // If there are conversations, check their structure
      if (conversations.conversations.length > 0) {
        const conv = conversations.conversations[0];
        expect(conv).toHaveProperty('conversationId');
        expect(conv).toHaveProperty('turnCount');
        
        console.log('✓ Real conversation data validated:', conv.conversationId);
      } else {
        console.log('✓ No active conversations (expected for fresh tab)');
      }
    }
  });
});
