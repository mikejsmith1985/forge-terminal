/**
 * E2E Test: Multi-Tab Focus Isolation
 * 
 * Tests that keyboard input goes to the correct tab and doesn't leak
 * to other tabs. This is critical for multi-tab workflows.
 */

import { test, expect } from '@playwright/test';

// Helper to dismiss modals
async function dismissModals(page) {
  // Press Escape to close overlays
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  
  // Skip welcome modal
  const skipButton = page.locator('button:has-text("Skip")');
  if (await skipButton.isVisible({ timeout: 500 }).catch(() => false)) {
    await skipButton.click();
    await page.waitForTimeout(200);
  }
  
  // Dismiss update notification
  const laterButton = page.locator('button:has-text("Later")');
  if (await laterButton.isVisible({ timeout: 300 }).catch(() => false)) {
    await laterButton.click();
    await page.waitForTimeout(200);
  }
}

// Use isolated context for each test
test.describe('Multi-Tab Focus Isolation', () => {

  test('hidden terminal blocks keyboard input', async ({ browser }) => {
    // Create a completely fresh context with no storage
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    
    try {
      await page.goto('/');
      
      // Clear localStorage before the app loads state
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.waitForSelector('.tab-bar', { timeout: 10000 });
      await dismissModals(page);
      
      // Get initial tab count (should be 1 in fresh state)
      const initialTabs = await page.locator('.tab').count();
      console.log('Initial tabs:', initialTabs);
      
      // Switch Tab 1 to terminal mode
      const terminalToggle = page.locator('.terminal-toggle-btn').first();
      if (await terminalToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
        await terminalToggle.click({ force: true });
        await page.waitForTimeout(500);
      }
      
      await page.screenshot({ path: 'test-results/focus-01-tab1-terminal.png', fullPage: true });
      
      // Create Tab 2
      await page.keyboard.press('Control+t');
      await page.waitForTimeout(1000);
      await dismissModals(page);
      
      const afterCreateTabs = await page.locator('.tab').count();
      console.log('After Ctrl+T tabs:', afterCreateTabs);
      expect(afterCreateTabs).toBe(initialTabs + 1);
      
      // Switch Tab 2 to terminal mode
      const terminalToggle2 = page.locator('.terminal-toggle-btn').first();
      if (await terminalToggle2.isVisible({ timeout: 2000 }).catch(() => false)) {
        await terminalToggle2.click({ force: true });
        await page.waitForTimeout(500);
      }
      
      await page.screenshot({ path: 'test-results/focus-02-tab2-terminal.png', fullPage: true });
      
      // Now type something - should go to Tab 2 only
      const testText = 'TAB2_ONLY';
      await page.keyboard.type(testText, { delay: 50 });
      
      await page.screenshot({ path: 'test-results/focus-03-typed-in-tab2.png', fullPage: true });
      
      // Switch back to Tab 1
      await page.keyboard.press('Control+1');
      await page.waitForTimeout(500);
      
      await page.screenshot({ path: 'test-results/focus-04-back-to-tab1.png', fullPage: true });
      
      // Check which textareas exist and their tabIndex
      const textareaInfo = await page.evaluate(() => {
        const textareas = document.querySelectorAll('.xterm-helper-textarea');
        return Array.from(textareas).map((t, i) => ({
          index: i,
          tabIndex: t.tabIndex,
          isFocused: t === document.activeElement
        }));
      });
      
      console.log('Textarea states:', JSON.stringify(textareaInfo));
      
      // Only one textarea should be focusable (tabIndex >= 0)
      const focusableCount = textareaInfo.filter(t => t.tabIndex >= 0).length;
      console.log('Focusable textareas:', focusableCount);
      expect(focusableCount).toBe(1);
      
      console.log('✅ Hidden terminal focus test passed');
    } finally {
      await context.close();
    }
  });

  test('xterm textareas have correct tabIndex when switching', async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    
    try {
      await page.goto('/');
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.waitForSelector('.tab-bar', { timeout: 10000 });
      await dismissModals(page);
      
      const initialTabs = await page.locator('.tab').count();
      
      // Create Tab 2
      await page.keyboard.press('Control+t');
      await page.waitForTimeout(500);
      await dismissModals(page);
      
      const tabCount = await page.locator('.tab').count();
      expect(tabCount).toBe(initialTabs + 1);
      
      // Switch both to terminal mode
      for (let i = 0; i < tabCount; i++) {
        await page.keyboard.press(`Control+${i + 1}`);
        await page.waitForTimeout(300);
        
        const terminalToggle = page.locator('.terminal-toggle-btn').first();
        if (await terminalToggle.isVisible({ timeout: 1000 }).catch(() => false)) {
          await terminalToggle.click({ force: true });
          await page.waitForTimeout(300);
        }
      }
      
      // Now last tab should be active, check tabIndex states
      const textareaInfo = await page.evaluate(() => {
        const textareas = document.querySelectorAll('.xterm-helper-textarea');
        return {
          textareas: Array.from(textareas).map((t, i) => ({
            index: i,
            tabIndex: t.tabIndex
          })),
          count: textareas.length
        };
      });
      
      console.log('Textarea info:', JSON.stringify(textareaInfo));
      
      // Only one should have tabIndex=0 (the active tab's terminal)
      const focusable = textareaInfo.textareas.filter(t => t.tabIndex === 0);
      const unfocusable = textareaInfo.textareas.filter(t => t.tabIndex === -1);
      
      console.log(`Focusable: ${focusable.length}, Unfocusable: ${unfocusable.length}`);
      
      expect(focusable.length).toBe(1);
      
      await page.screenshot({ path: 'test-results/focus-tabindex-check.png', fullPage: true });
      
      console.log('✅ TabIndex test passed');
    } finally {
      await context.close();
    }
  });

  test('multiple tabs maintain focus isolation', async ({ browser }) => {
    test.setTimeout(120000); // 2 minutes
    
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    
    try {
      await page.goto('/');
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.waitForSelector('.tab-bar', { timeout: 10000 });
      await dismissModals(page);
      
      const initialTabs = await page.locator('.tab').count();
      console.log('Initial tabs:', initialTabs);
      
      // Only create tabs if under limit (max is typically 20)
      const MAX_TABS = 20;
      const TARGET_NEW_TABS = Math.min(4, MAX_TABS - initialTabs);
      
      // Create additional tabs (if possible)
      for (let i = 0; i < TARGET_NEW_TABS; i++) {
        await page.keyboard.press('Control+t');
        await page.waitForTimeout(300);
        await dismissModals(page);
      }
      
      const tabCount = await page.locator('.tab').count();
      console.log('Total tabs:', tabCount);
      // Just verify we have at least 2 tabs for the test
      expect(tabCount).toBeGreaterThanOrEqual(2);
      
      // Switch each tab to terminal mode (up to first 9)
      for (let i = 0; i < Math.min(tabCount, 9); i++) {
        await page.keyboard.press(`Control+${i + 1}`);
        await page.waitForTimeout(200);
        
        const terminalToggle = page.locator('.terminal-toggle-btn').first();
        if (await terminalToggle.isVisible({ timeout: 1000 }).catch(() => false)) {
          await terminalToggle.click({ force: true });
          await page.waitForTimeout(200);
        }
      }
      
      await page.screenshot({ path: 'test-results/focus-many-tabs.png', fullPage: true });
      
      // Check that only 1 textarea is focusable
      const textareaInfo = await page.evaluate(() => {
        const textareas = document.querySelectorAll('.xterm-helper-textarea');
        return Array.from(textareas).map((t, i) => ({
          index: i,
          tabIndex: t.tabIndex
        }));
      });
      
      const focusableCount = textareaInfo.filter(t => t.tabIndex === 0).length;
      console.log(`Total textareas: ${textareaInfo.length}, Focusable: ${focusableCount}`);
      
      expect(focusableCount).toBe(1);
      
      console.log('✅ Multiple tabs test passed');
    } finally {
      await context.close();
    }
  });
});
