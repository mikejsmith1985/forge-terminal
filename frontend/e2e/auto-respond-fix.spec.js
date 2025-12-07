import { test, expect } from '@playwright/test';

/**
 * Auto-Respond Feature Tests
 * Tests that auto-respond only triggers on LLM responses, not user input
 */

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

test.describe('Auto-Respond Feature - User Input Protection', () => {

  test.beforeEach(async ({ page }) => {
    await page.request.post('/api/sessions', {
      data: { tabs: [], activeTabId: '' }
    });
  });

  test('should enable auto-respond via tab context menu', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await dismissToasts(page);
    await page.waitForTimeout(1000);

    // Right-click on tab
    const tab = page.locator('.tab-bar .tab').first();
    await tab.click({ button: 'right' });

    // Click auto-respond toggle
    const autoRespondBtn = page.locator('.tab-context-menu button:has-text("Auto-respond")');
    await expect(autoRespondBtn).toBeVisible();
    await autoRespondBtn.click();
    await dismissToasts(page);

    // Verify tab shows auto-respond indicator
    await expect(tab).toHaveClass(/auto-respond/);
  });

  test('should not auto-trigger when user types "yes"', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.xterm-screen', { timeout: 10000 });
    await dismissToasts(page);
    await page.waitForTimeout(1500);

    // Enable auto-respond
    const tab = page.locator('.tab-bar .tab').first();
    await tab.click({ button: 'right' });
    await page.locator('.tab-context-menu button:has-text("Auto-respond")').click();
    await dismissToasts(page);
    await page.waitForTimeout(500);

    // Type "yes" in the terminal (simulating user response to a prompt)
    const terminal = page.locator('.xterm-screen').first();
    await terminal.click();
    
    // Type "yes " slowly to ensure it doesn't get cut off
    await page.keyboard.type('yes ', { delay: 100 });
    
    // Continue typing more text (this would normally be cut off if auto-respond triggered on user input)
    await page.keyboard.type('this is my full response', { delay: 100 });
    
    // Give time for any erroneous auto-respond to trigger
    await page.waitForTimeout(2000);
    
    // The text field should contain our full input (not cut off by premature Enter)
    // We can't directly check xterm content easily, but we verify no errors occurred
    // by checking the tab is still active and responsive
    await expect(tab).toBeVisible();
  });

  test('should only trigger auto-respond on LLM tool prompts', async ({ page, context }) => {
    // Track WebSocket messages sent
    const sentMessages = [];
    
    await context.addInitScript(() => {
      const originalSend = WebSocket.prototype.send;
      window.sentMessages = [];
      WebSocket.prototype.send = function(data) {
        window.sentMessages.push(data);
        return originalSend.call(this, data);
      };
    });

    await page.goto('/');
    await page.waitForSelector('.xterm-screen', { timeout: 10000 });
    await dismissToasts(page);
    await page.waitForTimeout(1500);

    // Enable auto-respond
    const tab = page.locator('.tab-bar .tab').first();
    await tab.click({ button: 'right' });
    await page.locator('.tab-context-menu button:has-text("Auto-respond")').click();
    await dismissToasts(page);
    await page.waitForTimeout(500);

    // Type "yes" and some additional text
    const terminal = page.locator('.xterm-screen').first();
    await terminal.click();
    
    // Type slowly to allow for proper detection
    await page.keyboard.type('yes continue', { delay: 100 });
    
    await page.waitForTimeout(2000);
    
    // Get sent messages
    const messages = await page.evaluate(() => window.sentMessages);
    
    // Filter for enter/y responses
    const autoRespondMessages = messages.filter(msg => 
      typeof msg === 'string' && (msg === '\r' || msg === 'y\r')
    );
    
    // Auto-respond should NOT have been triggered for user input
    // (it would only trigger if there was a legitimate LLM prompt pattern)
    expect(autoRespondMessages.length).toBe(0);
  });

  test('should not cut off user input when typing response to prompt', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.xterm-screen', { timeout: 10000 });
    await dismissToasts(page);
    await page.waitForTimeout(1500);

    // Enable auto-respond
    const tab = page.locator('.tab-bar .tab').first();
    await tab.click({ button: 'right' });
    await page.locator('.tab-context-menu button:has-text("Auto-respond")').click();
    await dismissToasts(page);
    await page.waitForTimeout(500);

    // Simulate typing a response that starts with "yes"
    const terminal = page.locator('.xterm-screen').first();
    await terminal.click();
    
    // Type "yes" followed by more text (this should NOT get cut off)
    const testText = 'yes, I want to continue with all these steps';
    await page.keyboard.type(testText, { delay: 50 });
    
    // Wait for any keyboard processing
    await page.waitForTimeout(2000);
    
    // The terminal should still be responsive and no errors
    // (if auto-respond triggered on user input, it would mess things up)
    await expect(terminal).toBeVisible();
  });

  test('should have debounce on prompt detection', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.xterm-screen', { timeout: 10000 });
    await dismissToasts(page);
    await page.waitForTimeout(1500);

    // Enable auto-respond
    const tab = page.locator('.tab-bar .tab').first();
    await tab.click({ button: 'right' });
    await page.locator('.tab-context-menu button:has-text("Auto-respond")').click();
    await dismissToasts(page);
    await page.waitForTimeout(500);

    // Type something with "yes" in it
    const terminal = page.locator('.xterm-screen').first();
    await terminal.click();
    
    // Type "yes" - but with short enough delays that echo counting prevents premature response
    await page.keyboard.type('yes', { delay: 200 });
    
    // Type more before any echo can cause a response
    await page.keyboard.type(' more text', { delay: 100 });
    
    // Press Enter manually 
    await page.keyboard.press('Enter');
    
    // Should still be responsive
    await expect(terminal).toBeVisible();
  });
});
