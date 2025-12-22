import { test, expect } from '@playwright/test';

/**
 * Test to verify that the auto-respond toggle UI is working correctly
 */

test.describe('Auto-Respond Toggle UI', () => {
  
  test.beforeEach(async ({ page }) => {
    // Clear session
    await page.request.post('/api/sessions', {
      data: { tabs: [], activeTabId: '' }
    });
  });

  test('should toggle auto-respond on and off via context menu', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.xterm-screen', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Dismiss any toasts
    const toastClose = page.locator('.toast .toast-close');
    const count = await toastClose.count();
    for (let i = 0; i < count; i++) {
      try {
        await toastClose.nth(i).click({ timeout: 500 });
      } catch (e) {
        // Ignore
      }
    }
    await page.waitForTimeout(500);

    const tab = page.locator('.tab-bar .tab').first();

    // Step 1: Verify auto-respond is OFF by default
    let tabClass = await tab.getAttribute('class');
    expect(tabClass).not.toContain('auto-respond');

    // Step 2: Enable auto-respond
    await tab.click({ button: 'right' });
    await page.waitForSelector('.tab-context-menu', { timeout: 2000 });
    
    const autoRespondButton = page.locator('.tab-context-menu button:has-text("Auto-respond")');
    await expect(autoRespondButton).toBeVisible();
    
    // Check if it shows as inactive (no checkmark)
    const buttonText1 = await autoRespondButton.textContent();
    console.log('Before toggle:', buttonText1);
    
    await autoRespondButton.click();
    await page.waitForTimeout(500);

    // Step 3: Verify auto-respond is now ON
    tabClass = await tab.getAttribute('class');
    console.log('Tab class after enable:', tabClass);
    expect(tabClass).toContain('auto-respond');

    // Visual indicator should be visible
    const zapIndicator = tab.locator('.auto-respond-indicator');
    await expect(zapIndicator).toBeVisible();

    // Step 4: Open context menu again to verify checkmark
    await tab.click({ button: 'right' });
    await page.waitForSelector('.tab-context-menu', { timeout: 2000 });
    
    const autoRespondButton2 = page.locator('.tab-context-menu button:has-text("Auto-respond")');
    const buttonText2 = await autoRespondButton2.textContent();
    console.log('After enable:', buttonText2);
    expect(buttonText2).toContain('✓');

    // Step 5: Disable auto-respond
    await autoRespondButton2.click();
    await page.waitForTimeout(500);

    // Step 6: Verify auto-respond is now OFF
    tabClass = await tab.getAttribute('class');
    console.log('Tab class after disable:', tabClass);
    expect(tabClass).not.toContain('auto-respond');

    // Visual indicator should be gone
    await expect(zapIndicator).not.toBeVisible();
  });

  test('should persist auto-respond state across tab switches', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.xterm-screen', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Create a second tab
    const newTabButton = page.locator('.new-tab-btn').first();
    await newTabButton.click();
    await page.waitForTimeout(500);

    // Enable auto-respond on first tab
    const firstTab = page.locator('.tab-bar .tab').first();
    await firstTab.click({ button: 'right' });
    const autoRespondButton = page.locator('.tab-context-menu button:has-text("Auto-respond")');
    await autoRespondButton.click();
    await page.waitForTimeout(500);

    // Switch to second tab
    const secondTab = page.locator('.tab-bar .tab').nth(1);
    await secondTab.click();
    await page.waitForTimeout(500);

    // Verify second tab does NOT have auto-respond enabled
    let tabClass = await secondTab.getAttribute('class');
    expect(tabClass).not.toContain('auto-respond');

    // Switch back to first tab
    await firstTab.click();
    await page.waitForTimeout(500);

    // Verify first tab STILL has auto-respond enabled
    tabClass = await firstTab.getAttribute('class');
    expect(tabClass).toContain('auto-respond');
  });

  test('should show auto-respond indicator in tab title', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.xterm-screen', { timeout: 10000 });
    await page.waitForTimeout(1000);

    const tab = page.locator('.tab-bar .tab').first();

    // Enable auto-respond
    await tab.click({ button: 'right' });
    const autoRespondButton = page.locator('.tab-context-menu button:has-text("Auto-respond")');
    await autoRespondButton.click();
    await page.waitForTimeout(500);

    // Check the title attribute includes "Auto-respond"
    const title = await tab.getAttribute('title');
    console.log('Tab title:', title);
    expect(title).toContain('Auto-respond');
  });

  test('should log toggle events to console', async ({ page }) => {
    // Collect console logs
    const logs = [];
    page.on('console', msg => {
      if (msg.text().includes('auto-respond') || msg.text().includes('Auto-respond')) {
        logs.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForSelector('.xterm-screen', { timeout: 10000 });
    await page.waitForTimeout(1000);

    const tab = page.locator('.tab-bar .tab').first();

    // Enable auto-respond
    await tab.click({ button: 'right' });
    const autoRespondButton = page.locator('.tab-context-menu button:has-text("Auto-respond")');
    await autoRespondButton.click();
    await page.waitForTimeout(1000);

    // Should have logged the toggle
    console.log('Captured logs:', logs);
    expect(logs.length).toBeGreaterThan(0);
  });
});
