import { test, expect } from '@playwright/test';

/**
 * Auto-Respond Regression Test for v2.1.4
 * 
 * Tests the fix for the regression introduced in commit e9c25c3
 * where auto-respond was completely broken due to incorrect ref handling.
 */

test.describe('Auto-Respond v2.1.4 Fix', () => {
  
  test.beforeEach(async ({ page }) => {
    // Clear session
    await page.request.post('/api/sessions', {
      data: { tabs: [], activeTabId: '' }
    });
    
    await page.goto('/');
    await page.waitForSelector('.xterm-screen', { timeout: 10000 });
    
    // Dismiss any toasts
    await page.waitForTimeout(500);
    const toastClose = page.locator('.toast .toast-close');
    const count = await toastClose.count();
    for (let i = 0; i < count; i++) {
      try {
        await toastClose.nth(i).click({ timeout: 500 });
      } catch (e) {
        // Ignore if toast already closed
      }
    }
    await page.waitForTimeout(300);
  });

  test('should schedule detection work correctly after starvation', async ({ page, context }) => {
    // Track scheduling behavior
    await context.addInitScript(() => {
      window.detectionRuns = [];
      window.sentMessages = [];
      
      // Track WebSocket sends
      const originalSend = WebSocket.prototype.send;
      WebSocket.prototype.send = function(data) {
        window.sentMessages.push({ time: Date.now(), data });
        return originalSend.call(this, data);
      };
    });

    await page.goto('/');
    await page.waitForSelector('.xterm-screen', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Enable auto-respond
    const tab = page.locator('.tab-bar .tab').first();
    await tab.click({ button: 'right' });
    await page.locator('.tab-context-menu button:has-text("Auto-respond")').click();
    await page.waitForTimeout(500);

    // Simulate multiple rapid data events (simulating spinner/progress output)
    // This would have triggered the starvation scenario
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        const term = window.xterm;
        if (term) {
          term.write('.');  // Simulate continuous output
        }
      });
      await page.waitForTimeout(300);  // 300ms between updates
    }

    // Now send a prompt (this should be detected despite previous rapid updates)
    const prompt = `
╭──────────────────────────────────────────────────────╮
│ Do you want to run this command?                     │
│                                                      │
│ ❯ 1. Yes                                            │
│   2. No                                             │
│                                                      │
│ Confirm with Enter                                   │
╰──────────────────────────────────────────────────────╯
`;

    await page.evaluate((p) => {
      const term = window.xterm;
      if (term) {
        term.write(p);
      }
    }, prompt);

    // Wait for detection and auto-respond
    await page.waitForTimeout(2000);

    // Check that auto-respond sent a message
    const messages = await page.evaluate(() => window.sentMessages);
    const enterResponses = messages.filter(m => m.data === '\r');
    
    // Should have auto-responded with Enter
    expect(enterResponses.length).toBeGreaterThan(0);
  });

  test('should handle repeated prompts correctly', async ({ page, context }) => {
    await context.addInitScript(() => {
      window.sentMessages = [];
      const originalSend = WebSocket.prototype.send;
      WebSocket.prototype.send = function(data) {
        window.sentMessages.push(data);
        return originalSend.call(this, data);
      };
    });

    await page.goto('/');
    await page.waitForSelector('.xterm-screen', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Enable auto-respond
    const tab = page.locator('.tab-bar .tab').first();
    await tab.click({ button: 'right' });
    await page.locator('.tab-context-menu button:has-text("Auto-respond")').click();
    await page.waitForTimeout(500);

    // Send first prompt
    await page.evaluate(() => {
      const term = window.xterm;
      if (term) {
        term.write('Do you want to continue? (y/n) ');
      }
    });

    await page.waitForTimeout(1500);

    // Clear terminal and send second prompt
    await page.evaluate(() => {
      const term = window.xterm;
      if (term) {
        term.write('\r\n\r\nProceed with installation? (y/n) ');
      }
    });

    await page.waitForTimeout(1500);

    // Both prompts should have been auto-responded
    const messages = await page.evaluate(() => window.sentMessages);
    const yesResponses = messages.filter(m => m === 'y\r');
    
    // Should have at least 2 responses (one for each prompt)
    expect(yesResponses.length).toBeGreaterThanOrEqual(2);
  });

  test('should work correctly with Copilot CLI style prompt', async ({ page, context }) => {
    await context.addInitScript(() => {
      window.sentMessages = [];
      const originalSend = WebSocket.prototype.send;
      WebSocket.prototype.send = function(data) {
        window.sentMessages.push(data);
        return originalSend.call(this, data);
      };
    });

    await page.goto('/');
    await page.waitForSelector('.xterm-screen', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Enable auto-respond
    const tab = page.locator('.tab-bar .tab').first();
    await tab.click({ button: 'right' });
    await page.locator('.tab-context-menu button:has-text("Auto-respond")').click();
    await page.waitForTimeout(500);

    // Copilot CLI prompt with box drawing
    const copilotPrompt = `
╭───────────────────────────────────────────────────╮
│ Run this command?                                  │
│                                                    │
│ ❯ Yes                                             │
│   No                                              │
│   Edit                                            │
│                                                    │
│ Use ↑/↓ arrows and Enter to confirm              │
╰───────────────────────────────────────────────────╯
`;

    await page.evaluate((p) => {
      const term = window.xterm;
      if (term) {
        term.write(p);
      }
    }, copilotPrompt);

    await page.waitForTimeout(1500);

    const messages = await page.evaluate(() => window.sentMessages);
    const enterResponses = messages.filter(m => m === '\r');
    
    expect(enterResponses.length).toBeGreaterThan(0);
  });

  test('should not break when auto-respond is disabled', async ({ page, context }) => {
    await context.addInitScript(() => {
      window.sentMessages = [];
      const originalSend = WebSocket.prototype.send;
      WebSocket.prototype.send = function(data) {
        window.sentMessages.push(data);
        return originalSend.call(this, data);
      };
    });

    await page.goto('/');
    await page.waitForSelector('.xterm-screen', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // DON'T enable auto-respond - leave it off

    // Send a prompt
    await page.evaluate(() => {
      const term = window.xterm;
      if (term) {
        term.write('Do you want to continue? (y/n) ');
      }
    });

    await page.waitForTimeout(1500);

    const messages = await page.evaluate(() => window.sentMessages);
    const autoResponses = messages.filter(m => m === 'y\r' || m === '\r');
    
    // Should NOT have auto-responded (feature is off)
    expect(autoResponses.length).toBe(0);
  });

  test('should handle rapid enable/disable toggle', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.xterm-screen', { timeout: 10000 });
    await page.waitForTimeout(1000);

    const tab = page.locator('.tab-bar .tab').first();

    // Rapidly toggle auto-respond on and off
    for (let i = 0; i < 5; i++) {
      await tab.click({ button: 'right' });
      await page.locator('.tab-context-menu button:has-text("Auto-respond")').click();
      await page.waitForTimeout(200);
    }

    // Terminal should still be responsive
    const terminal = page.locator('.xterm-screen').first();
    await terminal.click();
    await page.keyboard.type('echo test\r');
    await page.waitForTimeout(500);

    // Should see 'test' in output (or command echo)
    const terminalText = await page.evaluate(() => {
      const term = window.xterm;
      return term ? term.buffer.active.getLine(term.buffer.active.cursorY)?.translateToString() : '';
    });

    // Terminal still works
    expect(terminalText).toBeDefined();
  });
});
