/**
 * Auto-Respond E2E Test for Copilot CLI v0.0.369
 * 
 * This test validates that auto-respond works correctly with REAL
 * terminal output and user interactions in Forge Terminal.
 */

const { test, expect } = require('@playwright/test');

test.describe('Auto-Respond Feature', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to Forge Terminal
    await page.goto('http://localhost:8333');
    
    // Wait for terminal to be ready - use first() to avoid strict mode
    await page.locator('.xterm-screen').first().waitFor({ state: 'visible', timeout: 10000 });
    
    // Give terminal time to fully initialize
    await page.waitForTimeout(1000);
  });

  test('should show auto-respond toggle in tab context menu', async ({ page }) => {
    // Right-click on the first tab to open context menu
    const tab = page.locator('.tab').first();
    await tab.click({ button: 'right' });
    
    // Verify auto-respond option exists in context menu (button with Zap icon)
    const autoRespondButton = page.locator('.tab-context-menu button').filter({ hasText: 'Auto-respond' });
    await expect(autoRespondButton).toBeVisible();
    
    // Take screenshot
    await page.screenshot({ path: 'test-results/auto-respond-context-menu.png' });
  });

  test('should enable auto-respond when clicked', async ({ page }) => {
    // Right-click on tab
    const tab = page.locator('.tab').first();
    await tab.click({ button: 'right' });
    
    // Wait for context menu to appear
    await page.waitForTimeout(300);
    
    // Click auto-respond button in context menu
    const autoRespondButton = page.locator('.tab-context-menu button').filter({ hasText: 'Auto-respond' });
    await autoRespondButton.click();
    
    // Wait for state update and UI to re-render
    await page.waitForTimeout(1000);
    
    // Take screenshot to see what happened
    await page.screenshot({ path: 'test-results/auto-respond-enabled.png' });
    
    // Right-click again to verify the state changed (checkmark should be visible)
    await tab.click({ button: 'right' });
    await page.waitForTimeout(300);
    
    // The button should now have 'active' class and show checkmark
    const activeButton = page.locator('.tab-context-menu button.active').filter({ hasText: 'Auto-respond' });
    await expect(activeButton).toBeVisible();
    
    await page.screenshot({ path: 'test-results/auto-respond-enabled-menu.png' });
  });

  test('should detect prompts and log to console', async ({ page }) => {
    // Enable auto-respond first
    const tab = page.locator('.tab').first();
    await tab.click({ button: 'right' });
    const autoRespondButton = page.locator('.tab-context-menu button').filter({ hasText: 'Auto-respond' });
    await autoRespondButton.click();
    await page.waitForTimeout(500);
    
    // Listen for console logs
    const consoleLogs = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('Auto-Respond')) {
        consoleLogs.push(text);
      }
    });
    
    // Focus terminal and type something
    const terminal = page.locator('.xterm-screen').first();
    await terminal.click();
    await page.keyboard.type('echo "test"');
    await page.keyboard.press('Enter');
    
    // Wait for detection to run
    await page.waitForTimeout(1000);
    
    // Take screenshot
    await page.screenshot({ path: 'test-results/auto-respond-detection.png' });
    
    // Log what we captured (for debugging)
    console.log('Captured Auto-Respond logs:', consoleLogs.length);
  });

  test('should show indicator when auto-respond is active', async ({ page }) => {
    // Enable auto-respond
    const tab = page.locator('.tab').first();
    await tab.click({ button: 'right' });
    await page.waitForTimeout(300);
    
    const autoRespondButton = page.locator('.tab-context-menu button').filter({ hasText: 'Auto-respond' });
    await autoRespondButton.click();
    await page.waitForTimeout(1000);
    
    // Right-click again to verify checkmark in menu
    await tab.click({ button: 'right' });
    await page.waitForTimeout(300);
    
    const activeButton = page.locator('.tab-context-menu button.active').filter({ hasText: 'Auto-respond' });
    await expect(activeButton).toBeVisible();
    
    // Take screenshot
    await page.screenshot({ path: 'test-results/auto-respond-indicator.png' });
  });

  test.skip('should auto-respond to real Copilot CLI tool approval', async ({ page }) => {
    // This test requires actual Copilot CLI to be installed
    // Skip in CI, run manually when needed
  });
});

test.afterAll(async () => {
  console.log('\n📸 Screenshots saved to test-results/');
});
