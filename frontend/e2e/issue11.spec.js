import { test, expect } from '@playwright/test';

test.describe('Issue #11: Max Tabs Notification Bug', () => {
  
  test('should NOT show max tabs warning when only 2 tabs are open', async ({ page }) => {
    await page.goto('/');
    
    // Wait for app to load
    await page.waitForSelector('.app', { timeout: 10000 });
    
    // Tab bar should be visible with 1 tab initially
    const tabBar = page.locator('.tab-bar');
    await expect(tabBar).toBeVisible();
    
    // Count initial tabs - should be 1
    const tabs = page.locator('.tab-bar .tab');
    await expect(tabs).toHaveCount(1);
    
    // Find new tab button and click to create second tab
    const newTabBtn = page.locator('.tab-bar button[title*="tab"], .tab-bar .new-tab-btn');
    await expect(newTabBtn).toBeVisible();
    await newTabBtn.click();
    
    // Wait for second tab to appear
    await expect(tabs).toHaveCount(2);
    
    // Verify NO max tabs warning toast appears
    // Wait a moment to let any toast appear if it would
    await page.waitForTimeout(500);
    
    // Check that no "max" or "limit" warning toast is visible
    const warningToast = page.locator('.toast:has-text("Maximum"), .toast:has-text("max"), .toast:has-text("limit")');
    await expect(warningToast).toHaveCount(0);
  });
  
  test('should allow creating 3 tabs without max warning', async ({ page }) => {
    await page.goto('/');
    
    // Wait for app to load
    await page.waitForSelector('.app', { timeout: 10000 });
    
    // Wait for session to load
    await page.waitForTimeout(2000);
    
    const tabs = page.locator('.tab-bar .tab');
    const newTabBtn = page.locator('.tab-bar button[title*="tab"], .tab-bar .new-tab-btn');
    
    // Get initial tab count
    const initialCount = await tabs.count();
    
    // Create 2 more tabs
    await newTabBtn.click();
    await page.waitForTimeout(300);
    await expect(tabs).toHaveCount(initialCount + 1, { timeout: 5000 });
    
    await newTabBtn.click();
    await page.waitForTimeout(300);
    await expect(tabs).toHaveCount(initialCount + 2, { timeout: 5000 });
    
    // Wait a moment and verify no warning toasts appeared
    await page.waitForTimeout(500);
    const warningToast = page.locator('.toast:has-text("Maximum"), .toast:has-text("max"), .toast:has-text("limit")');
    await expect(warningToast).toHaveCount(0);
  });
  
  test('new tab button should be enabled when under max limit', async ({ page }) => {
    await page.goto('/');
    
    // Wait for app to load
    await page.waitForSelector('.app', { timeout: 10000 });
    
    // With only 1 tab, the new tab button should NOT be disabled
    const newTabBtn = page.locator('.tab-bar button[title*="tab"], .tab-bar .new-tab-btn');
    await expect(newTabBtn).toBeEnabled();
    
    // Create a second tab
    await newTabBtn.click();
    
    // Button should still be enabled (we're at 2, max is 20)
    await expect(newTabBtn).toBeEnabled();
  });
  
  test('createTab should return valid tab ID when creating tabs', async ({ page }) => {
    // Clear session first to start fresh
    await page.request.post('/api/sessions', {
      data: { tabs: [], activeTabId: '' }
    });
    
    await page.goto('/');
    
    // Wait for app to load
    await page.waitForSelector('.app', { timeout: 10000 });
    
    // Wait for session to fully load
    await page.waitForTimeout(2000);
    
    const tabs = page.locator('.tab-bar .tab');
    const newTabBtn = page.locator('.tab-bar button[title*="tab"], .tab-bar .new-tab-btn');
    
    // Get initial tab count
    const initialCount = await tabs.count();
    
    // Click to create additional tabs - each should work and add a new tab
    for (let i = 1; i <= 4; i++) {
      await newTabBtn.click();
      await page.waitForTimeout(300);
      await expect(tabs).toHaveCount(initialCount + i, { timeout: 5000 });
      
      // Verify the new tab becomes active (indicated by 'active' class)
      const activeTab = page.locator('.tab-bar .tab.active');
      await expect(activeTab).toHaveCount(1);
    }
    
    // No warning toast should appear
    const warningToast = page.locator('.toast:has-text("Maximum"), .toast:has-text("limit")');
    await expect(warningToast).toHaveCount(0);
  });
  
  test('tabs can be closed and new ones created without false warnings', async ({ page }) => {
    // Clear session first
    await page.request.post('/api/sessions', {
      data: { tabs: [], activeTabId: '' }
    });
    
    await page.goto('/');
    
    // Wait for app to load
    await page.waitForSelector('.app', { timeout: 10000 });
    
    // Wait for session to fully load
    await page.waitForTimeout(2000);
    
    const tabs = page.locator('.tab-bar .tab');
    const newTabBtn = page.locator('.tab-bar button[title*="tab"], .tab-bar .new-tab-btn');
    
    // Get initial count
    const initialCount = await tabs.count();
    
    // Create 2 additional tabs
    await newTabBtn.click();
    await page.waitForTimeout(300);
    await newTabBtn.click();
    await page.waitForTimeout(300);
    await expect(tabs).toHaveCount(initialCount + 2, { timeout: 5000 });
    
    // Close one tab (click the close button on the active tab)
    const activeTab = page.locator('.tab-bar .tab.active');
    const closeBtn = activeTab.locator('.tab-close');
    await closeBtn.click();
    
    // Should have one less tab now
    await expect(tabs).toHaveCount(initialCount + 1, { timeout: 5000 });
    
    // Create another tab - should work without warning
    await newTabBtn.click();
    await expect(tabs).toHaveCount(initialCount + 2, { timeout: 5000 });
    
    // No max warning should appear
    await page.waitForTimeout(300);
    const warningToast = page.locator('.toast:has-text("Maximum"), .toast:has-text("limit")');
    await expect(warningToast).toHaveCount(0);
  });
});
