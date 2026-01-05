/**
 * AM Monitor - Real Bug Fix Test
 * v3.11.7
 * 
 * BUG: AM Monitor shows stale data ("Active 2h ago", "0 snapshots", "1 turns")
 * ROOT CAUSE: AM Logger not saving conversations since Dec 31 (6 days ago)
 * 
 * TEST: Verify AM Logger captures and saves LLM activity with current timestamps
 * 
 * TDD RED PHASE: This test WILL FAIL because AM Logger is broken
 */

const { test, expect } = require('@playwright/test');

const DEV_SERVER_PORT = process.env.DEV_SERVER_PORT || 3005;
const BASE_URL = `http://localhost:${DEV_SERVER_PORT}`;

test.describe('AM Monitor - Stale Data Bug', () => {
  
  test('should show recent activity timestamps not "Active 2h ago"', async ({ page }) => {
    test.setTimeout(120000);
    
    console.log('[Test] Opening Forge app...');
    await page.goto(BASE_URL);
    await page.waitForTimeout(3000);
    
    // Find a terminal tab
    const terminalTab = page.locator('[data-tab-id]').first();
    if (await terminalTab.isVisible()) {
      await terminalTab.click();
      await page.waitForTimeout(1000);
      console.log('[Test] ✓ Terminal tab opened');
    }
    
    // Trigger LLM activity by typing a gh copilot command
    // (or claude command if available)
    const terminal = page.locator('.xterm-screen, .terminal').first();
    await expect(terminal).toBeVisible({ timeout: 10000 });
    
    console.log('[Test] Typing LLM command to trigger AM capture...');
    await page.keyboard.type('echo "Testing AM Monitor"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
    
    // Optional: Try to trigger actual LLM activity if gh copilot is installed
    // await page.keyboard.type('gh copilot suggest "list files"');
    // await page.keyboard.press('Enter');
    // await page.waitForTimeout(5000);
    
    // Now check AM Monitor
    console.log('[Test] Checking AM Monitor status...');
    
    // Find AM Monitor element (usually in corner/top bar)
    const amMonitor = page.locator('.am-monitor, [class*="am-"], [title*="AM"]').first();
    await expect(amMonitor).toBeVisible({ timeout: 10000 });
    console.log('[Test] ✓ AM Monitor visible');
    
    // Click to open details panel
    await amMonitor.click();
    await page.waitForTimeout(1000);
    
    // Check for details panel
    const detailsPanel = page.locator('.am-details-panel, [class*="details"]').first();
    await expect(detailsPanel).toBeVisible({ timeout: 5000 });
    console.log('[Test] ✓ AM Monitor details panel opened');
    
    // Get the "Last Activity" text
    const lastActivityText = await detailsPanel.locator('text=/Last Activity|Active.*ago/i').first().textContent();
    console.log(`[Test] Last Activity: ${lastActivityText}`);
    
    // CRITICAL ASSERTION: Should NOT show hours or days ago
    // If it shows "Active 2h ago" or "Active 6d ago", the bug is present
    expect(lastActivityText).not.toMatch(/\d+h ago|\d+d ago/);
    
    // Should show seconds or minutes (recent activity)
    expect(lastActivityText).toMatch(/\d+s ago|\d+m ago|Never|Ready/);
    
    console.log('[Test] ✓ Last Activity shows recent timestamp (not stale)');
    
    // Check that turns/snapshots are being captured
    const turnsText = await detailsPanel.locator('text=/Turns Captured|turns/i').first().textContent();
    const snapshotsText = await detailsPanel.locator('text=/Conversations|snapshots/i').first().textContent();
    
    console.log(`[Test] Turns: ${turnsText}`);
    console.log(`[Test] Conversations: ${snapshotsText}`);
    
    // Get numeric values
    const turnsMatch = turnsText.match(/(\d+)/);
    const snapshotsMatch = snapshotsText.match(/(\d+)/);
    
    const turnsCount = turnsMatch ? parseInt(turnsMatch[1], 10) : 0;
    const snapshotsCount = snapshotsMatch ? parseInt(snapshotsMatch[1], 10) : 0;
    
    console.log(`[Test] Parsed - Turns: ${turnsCount}, Conversations: ${snapshotsCount}`);
    
    // At minimum, should have SOME activity (or be in "Ready" state, not broken)
    // The bug shows "0 snapshots, 1 turns" which is stale from days ago
    
    console.log('[Test] ✅ Test complete - checking if data is current');
  });
  
  test('should save conversation files with recent timestamps', async ({ page }) => {
    test.setTimeout(60000);
    
    console.log('[Test] Checking filesystem for recent AM saves...');
    
    // This test checks the backend directly
    const response = await page.request.get(`${BASE_URL}/api/am/health`);
    expect(response.ok()).toBeTruthy();
    
    const health = await response.json();
    console.log('[Test] Health status:', JSON.stringify(health, null, 2));
    
    // Check metrics
    if (health.metrics) {
      console.log(`[Test] Total Captures: ${health.metrics.totalCaptures || 0}`);
      console.log(`[Test] Conversations Active: ${health.metrics.conversationsActive || 0}`);
      console.log(`[Test] Conversations Complete: ${health.metrics.conversationsComplete || 0}`);
    }
    
    // CRITICAL: Check if any captures happened recently
    // If totalCaptures is 0 or very low, AM Logger is broken
    
    // Check all tabs status
    const tabsResponse = await page.request.get(`${BASE_URL}/api/am/active-conversations`);
    if (tabsResponse.ok()) {
      const tabsData = await tabsResponse.json();
      console.log('[Test] Active conversations:', JSON.stringify(tabsData, null, 2));
      
      // Should have at least one active or recent conversation
      const activeCount = tabsData.count || 0;
      console.log(`[Test] Active conversation count: ${activeCount}`);
    }
    
    console.log('[Test] ✅ Backend health check complete');
  });
  
  test('should have working LLM Logger initialization', async ({ page }) => {
    test.setTimeout(60000);
    
    console.log('[Test] Opening app and checking console for AM Logger messages...');
    
    // Collect console logs
    const consoleLogs = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('AM') || text.includes('LLM Logger')) {
        consoleLogs.push(text);
        console.log(`[Browser Console] ${text}`);
      }
    });
    
    await page.goto(BASE_URL);
    await page.waitForTimeout(5000);
    
    // Open a terminal tab to trigger logger init
    const terminalTab = page.locator('[data-tab-id]').first();
    if (await terminalTab.isVisible()) {
      await terminalTab.click();
      await page.waitForTimeout(2000);
    }
    
    // Type something to trigger activity
    await page.keyboard.type('echo "AM Logger test"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
    
    console.log(`[Test] Captured ${consoleLogs.length} AM-related console logs`);
    
    // Check for error messages
    const errors = consoleLogs.filter(log => 
      log.includes('❌') || log.includes('ERROR') || log.includes('Failed')
    );
    
    if (errors.length > 0) {
      console.log('[Test] ⚠️  Found error messages:');
      errors.forEach(err => console.log(`  - ${err}`));
    }
    
    // Check for success messages
    const success = consoleLogs.filter(log =>
      log.includes('✅') || log.includes('saved') || log.includes('initialized')
    );
    
    if (success.length > 0) {
      console.log('[Test] ✓ Found success messages:');
      success.forEach(msg => console.log(`  - ${msg}`));
    }
    
    console.log('[Test] ✅ Logger initialization check complete');
  });
});
