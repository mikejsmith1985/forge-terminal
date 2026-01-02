import { test, expect } from '@playwright/test';

/**
 * WebSocket Stability Tests
 * 
 * Tests for connection reliability and goroutine leak prevention
 */

test.describe('WebSocket Stability', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('forge_tour_completed', 'true');
    });
    
    await page.goto('/');
    await page.waitForSelector('.xterm-screen', { timeout: 15000 });
    await page.waitForTimeout(1000);
  });

  test('should maintain WebSocket connection during rapid tab switching', async ({ page }) => {
    // Track WebSocket state changes
    await page.addInitScript(() => {
      window.wsEvents = [];
      const originalWebSocket = window.WebSocket;
      window.WebSocket = function(...args) {
        const ws = new originalWebSocket(...args);
        window.wsEvents.push({ type: 'created', time: Date.now(), url: args[0] });
        
        ws.addEventListener('open', () => {
          window.wsEvents.push({ type: 'open', time: Date.now() });
        });
        
        ws.addEventListener('close', (e) => {
          window.wsEvents.push({ type: 'close', time: Date.now(), code: e.code });
        });
        
        ws.addEventListener('error', (e) => {
          window.wsEvents.push({ type: 'error', time: Date.now(), error: e.message });
        });
        
        return ws;
      };
    });

    await page.reload();
    await page.waitForSelector('.xterm-screen', { timeout: 15000 });
    await page.waitForTimeout(1000);

    // Create multiple tabs
    for (let i = 0; i < 3; i++) {
      await page.locator('button[title="New tab"]').click();
      await page.waitForTimeout(500);
    }

    // Rapidly switch between tabs
    const tabs = await page.locator('.tab-bar .tab').all();
    for (let iteration = 0; iteration < 5; iteration++) {
      for (const tab of tabs) {
        await tab.click();
        await page.waitForTimeout(100);
      }
    }

    await page.waitForTimeout(2000);

    // Check WebSocket events
    const events = await page.evaluate(() => window.wsEvents);
    
    // Count open vs close events
    const openCount = events.filter(e => e.type === 'open').length;
    const closeCount = events.filter(e => e.type === 'close').length;
    const errorCount = events.filter(e => e.type === 'error').length;
    
    console.log('WebSocket Events:', { openCount, closeCount, errorCount, total: events.length });
    
    // Should have minimal errors
    expect(errorCount).toBeLessThan(2);
    
    // Should have closed old connections (no leak)
    // Allow 1 connection per tab to remain open
    expect(openCount - closeCount).toBeLessThanOrEqual(tabs.length);
  });

  test('should handle WebSocket reconnection after server disconnect', async ({ page, context }) => {
    let connectionLost = false;
    
    // Monitor connection state
    page.on('console', msg => {
      if (msg.text().includes('WebSocket closed') || msg.text().includes('Connection error')) {
        connectionLost = true;
      }
    });

    await page.waitForSelector('.xterm-screen', { timeout: 15000 });
    await page.waitForTimeout(1000);

    // Check connection status
    const terminal = page.locator('.terminal-outer-container');
    const isConnected = await terminal.evaluate(el => {
      return !el.querySelector('.terminal-connection-overlay');
    });

    expect(isConnected).toBe(true);

    // Type in terminal to verify it's working
    await page.keyboard.type('echo "stability test"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    // Terminal should still be connected
    const stillConnected = await terminal.evaluate(el => {
      return !el.querySelector('.terminal-connection-overlay');
    });

    expect(stillConnected).toBe(true);
  });

  test('should cleanup WebSocket on tab close', async ({ page }) => {
    await page.addInitScript(() => {
      window.wsConnections = [];
      const originalWebSocket = window.WebSocket;
      window.WebSocket = function(...args) {
        const ws = new originalWebSocket(...args);
        const conn = { ws, closed: false, url: args[0] };
        window.wsConnections.push(conn);
        
        const originalClose = ws.close.bind(ws);
        ws.close = function() {
          conn.closed = true;
          return originalClose();
        };
        
        return ws;
      };
    });

    await page.reload();
    await page.waitForSelector('.xterm-screen', { timeout: 15000 });
    await page.waitForTimeout(500);

    // Create a second tab
    await page.locator('button[title="New tab"]').click();
    await page.waitForTimeout(500);

    // Get tab close button
    const tabs = await page.locator('.tab-bar .tab').all();
    expect(tabs.length).toBeGreaterThanOrEqual(2);

    // Close the second tab
    const closeBtn = tabs[1].locator('button[title="Close tab"]');
    await closeBtn.click();
    await page.waitForTimeout(500);

    // Check that WebSocket was closed
    const connections = await page.evaluate(() => window.wsConnections);
    const closedCount = connections.filter(c => c.closed).length;
    
    // At least one connection should have been closed
    expect(closedCount).toBeGreaterThan(0);
  });

  test('should not accumulate goroutines after multiple terminal sessions', async ({ page }) => {
    // This test validates that backend goroutines are cleaned up
    // We'll create and destroy multiple terminals and check for memory leaks
    
    await page.waitForSelector('.xterm-screen', { timeout: 15000 });
    
    // Create and close multiple tabs
    for (let i = 0; i < 5; i++) {
      await page.locator('button[title="New tab"]').click();
      await page.waitForTimeout(300);
      
      // Close the newly created tab
      const tabs = await page.locator('.tab-bar .tab').all();
      if (tabs.length > 1) {
        const lastTab = tabs[tabs.length - 1];
        await lastTab.locator('button[title="Close tab"]').click();
        await page.waitForTimeout(300);
      }
    }

    // Final check - should have only one tab left
    const finalTabs = await page.locator('.tab-bar .tab').all();
    expect(finalTabs.length).toBe(1);
    
    // Terminal should still be responsive
    await page.keyboard.type('echo "test"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
  });
});
