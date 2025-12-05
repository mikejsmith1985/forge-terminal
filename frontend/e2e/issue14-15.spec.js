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

test.describe('Issue #15: Tab Color Duplication Fix', () => {
  
  // Clear session before each test
  test.beforeEach(async ({ page }) => {
    await page.request.post('/api/sessions', {
      data: { tabs: [], activeTabId: '' }
    });
  });

  test('new tabs should have unique colors immediately without requiring tab switch', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await dismissToasts(page);
    await page.waitForTimeout(2000);

    // Get the first tab and its background color
    const tabs = page.locator('.tab-bar .tab');
    await expect(tabs).toHaveCount(1);
    
    const firstTab = tabs.first();
    const firstTabStyle = await firstTab.getAttribute('style');
    
    // Create a second tab
    const newTabBtn = page.locator('.tab-bar .new-tab-btn');
    await newTabBtn.click();
    await page.waitForTimeout(500);
    
    // Now we should have 2 tabs
    await expect(tabs).toHaveCount(2);
    
    // Get the second tab's style
    const secondTab = tabs.nth(1);
    const secondTabStyle = await secondTab.getAttribute('style');
    
    // The second tab should have the new tab's color, not duplicate the first
    // Since the second tab is now active, it should have its OWN theme color applied
    expect(secondTabStyle).toBeTruthy();
    expect(secondTabStyle).toContain('background-color');
    
    // Switch back to first tab
    await firstTab.click();
    await page.waitForTimeout(300);
    
    // Now get the styles again - the first tab should still have its original color
    const firstTabStyleAfter = await firstTab.getAttribute('style');
    expect(firstTabStyleAfter).toBeTruthy();
    expect(firstTabStyleAfter).toContain('background-color');
    
    // The two tabs should have DIFFERENT background colors
    // Extract the background colors from the styles
    const extractBgColor = (style) => {
      const match = style.match(/background-color:\s*([^;]+)/);
      return match ? match[1].trim() : null;
    };
    
    const firstBgColor = extractBgColor(firstTabStyleAfter);
    const secondBgColorAfter = await secondTab.getAttribute('style');
    const secondBgColor = extractBgColor(secondBgColorAfter);
    
    // Both should have background colors
    expect(firstBgColor).toBeTruthy();
    expect(secondBgColor).toBeTruthy();
    
    // They should be different (each tab has its own theme)
    // Note: The first tab is "molten" (orange) and second tab is "ocean" (blue)
    expect(firstBgColor).not.toBe(secondBgColor);
  });

  test('switching tabs should apply correct theme colors', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await dismissToasts(page);
    await page.waitForTimeout(2000);

    // Create a second tab
    const newTabBtn = page.locator('.tab-bar .new-tab-btn');
    await newTabBtn.click();
    await page.waitForTimeout(500);
    
    const tabs = page.locator('.tab-bar .tab');
    await expect(tabs).toHaveCount(2);
    
    // Get the root element to check CSS variables
    const getAccentColor = async () => {
      return page.evaluate(() => {
        return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      });
    };
    
    // Second tab is active (new tab)
    const accentWhenSecondActive = await getAccentColor();
    
    // Switch to first tab
    await tabs.nth(0).click();
    await page.waitForTimeout(300);
    
    const accentWhenFirstActive = await getAccentColor();
    
    // The accent colors should be different because each tab has a different theme
    expect(accentWhenSecondActive).not.toBe(accentWhenFirstActive);
    
    // Switch back to second tab
    await tabs.nth(1).click();
    await page.waitForTimeout(300);
    
    const accentAfterSwitchBack = await getAccentColor();
    
    // Should match the second tab's original accent
    expect(accentAfterSwitchBack).toBe(accentWhenSecondActive);
  });

  test('creating multiple tabs should not cause theme flickering on existing tabs', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await dismissToasts(page);
    await page.waitForTimeout(2000);

    const tabs = page.locator('.tab-bar .tab');
    const newTabBtn = page.locator('.tab-bar .new-tab-btn');
    
    // Get first tab's background color
    const firstTab = tabs.first();
    const firstTabInitialStyle = await firstTab.getAttribute('style');
    const extractBgColor = (style) => {
      const match = style?.match(/background-color:\s*([^;]+)/);
      return match ? match[1].trim() : null;
    };
    const firstTabInitialBg = extractBgColor(firstTabInitialStyle);
    
    // Create 3 more tabs rapidly
    for (let i = 0; i < 3; i++) {
      await newTabBtn.click();
      await page.waitForTimeout(200);
    }
    
    await expect(tabs).toHaveCount(4);
    
    // Switch to first tab and verify its color is still the original
    await firstTab.click();
    await page.waitForTimeout(300);
    
    const firstTabFinalStyle = await firstTab.getAttribute('style');
    const firstTabFinalBg = extractBgColor(firstTabFinalStyle);
    
    // First tab should still have its original theme color
    expect(firstTabFinalBg).toBe(firstTabInitialBg);
  });

});

test.describe('Issue #14: Auto-Respond Feature', () => {
  
  // Clear session before each test
  test.beforeEach(async ({ page }) => {
    await page.request.post('/api/sessions', {
      data: { tabs: [], activeTabId: '' }
    });
  });

  test('should show auto-respond option in tab context menu', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await dismissToasts(page);
    await page.waitForTimeout(2000);

    // Right-click on the tab to open context menu
    const tab = page.locator('.tab-bar .tab').first();
    await tab.click({ button: 'right' });
    
    // Context menu should appear with auto-respond option
    const contextMenu = page.locator('.tab-context-menu');
    await expect(contextMenu).toBeVisible();
    
    // Should have auto-respond button
    const autoRespondBtn = contextMenu.locator('button:has-text("Auto-respond")');
    await expect(autoRespondBtn).toBeVisible();
  });

  test('should toggle auto-respond state when clicking menu option', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await dismissToasts(page);
    await page.waitForTimeout(2000);

    const tab = page.locator('.tab-bar .tab').first();
    
    // Initially, tab should not have auto-respond class
    await expect(tab).not.toHaveClass(/auto-respond/);
    
    // Right-click and enable auto-respond
    await tab.click({ button: 'right' });
    const autoRespondBtn = page.locator('.tab-context-menu button:has-text("Auto-respond")');
    await autoRespondBtn.click();
    await page.waitForTimeout(300);
    
    // Tab should now have auto-respond class
    await expect(tab).toHaveClass(/auto-respond/);
    
    // Should also show the lightning bolt indicator
    const indicator = tab.locator('.auto-respond-indicator');
    await expect(indicator).toBeVisible();
  });

  test('auto-respond indicator should be visible when enabled', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await dismissToasts(page);
    await page.waitForTimeout(2000);

    const tab = page.locator('.tab-bar .tab').first();
    
    // Enable auto-respond
    await tab.click({ button: 'right' });
    await page.locator('.tab-context-menu button:has-text("Auto-respond")').click();
    await page.waitForTimeout(300);
    
    // The Zap icon indicator should be visible
    const zapIcon = tab.locator('.auto-respond-indicator svg');
    await expect(zapIcon).toBeVisible();
  });

  test('auto-respond should toggle off when clicked again', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await dismissToasts(page);
    await page.waitForTimeout(2000);

    const tab = page.locator('.tab-bar .tab').first();
    
    // Enable auto-respond
    await tab.click({ button: 'right' });
    await page.locator('.tab-context-menu button:has-text("Auto-respond")').click();
    await page.waitForTimeout(300);
    
    // Should be enabled
    await expect(tab).toHaveClass(/auto-respond/);
    
    // Disable auto-respond
    await tab.click({ button: 'right' });
    await page.locator('.tab-context-menu button:has-text("Auto-respond")').click();
    await page.waitForTimeout(300);
    
    // Should be disabled
    await expect(tab).not.toHaveClass(/auto-respond/);
    
    // Indicator should not be visible
    const indicator = tab.locator('.auto-respond-indicator');
    await expect(indicator).not.toBeVisible();
  });

  test('auto-respond state should persist when switching tabs', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await dismissToasts(page);
    await page.waitForTimeout(2000);

    // Create a second tab
    await page.locator('.new-tab-btn').click();
    await page.waitForTimeout(500);
    
    const tabs = page.locator('.tab-bar .tab');
    await expect(tabs).toHaveCount(2);
    
    // Enable auto-respond on first tab
    const firstTab = tabs.nth(0);
    await firstTab.click({ button: 'right' });
    await page.locator('.tab-context-menu button:has-text("Auto-respond")').click();
    await page.waitForTimeout(300);
    
    // First tab should have auto-respond
    await expect(firstTab).toHaveClass(/auto-respond/);
    
    // Switch to second tab
    await tabs.nth(1).click();
    await page.waitForTimeout(300);
    
    // Switch back to first tab
    await firstTab.click();
    await page.waitForTimeout(300);
    
    // First tab should still have auto-respond enabled
    await expect(firstTab).toHaveClass(/auto-respond/);
  });

  test('context menu should show checkmark when auto-respond is active', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await dismissToasts(page);
    await page.waitForTimeout(2000);

    const tab = page.locator('.tab-bar .tab').first();
    
    // Enable auto-respond
    await tab.click({ button: 'right' });
    await page.locator('.tab-context-menu button:has-text("Auto-respond")').click();
    await page.waitForTimeout(300);
    
    // Open context menu again
    await tab.click({ button: 'right' });
    
    // The auto-respond option should show a checkmark (✓)
    const autoRespondBtn = page.locator('.tab-context-menu button:has-text("Auto-respond")');
    const btnText = await autoRespondBtn.textContent();
    expect(btnText).toContain('✓');
  });

});
