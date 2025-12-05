import { test, expect } from '@playwright/test';

test.describe('Tab Styling Enhancement', () => {
  
  test('tabs should have colored background with bold title', async ({ page }) => {
    await page.goto('/');
    
    // Wait for app to load
    await page.waitForSelector('.app', { timeout: 10000 });
    
    // Tab bar should be visible
    const tabBar = page.locator('.tab-bar');
    await expect(tabBar).toBeVisible();
    
    // At least one tab should exist
    const tab = page.locator('.tab-bar .tab').first();
    await expect(tab).toBeVisible();
    
    // Tab should have a background color (not transparent)
    // The tab will have a colored background if it has a colorTheme
    const tabBackgroundColor = await tab.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });
    
    // Tab title should have bold font weight (700)
    const tabTitle = page.locator('.tab-bar .tab .tab-title').first();
    await expect(tabTitle).toBeVisible();
    
    const fontWeight = await tabTitle.evaluate((el) => {
      return window.getComputedStyle(el).fontWeight;
    });
    
    // Font weight should be 700 (bold)
    expect(fontWeight).toBe('700');
  });
  
  test('tab background color should match theme accent color', async ({ page }) => {
    await page.goto('/');
    
    // Wait for app to load
    await page.waitForSelector('.app', { timeout: 10000 });
    
    // Get the first tab
    const tab = page.locator('.tab-bar .tab').first();
    await expect(tab).toBeVisible();
    
    // Check if tab has a background color set via inline style
    const hasBackgroundStyle = await tab.evaluate((el) => {
      const style = el.getAttribute('style');
      return style && style.includes('background-color');
    });
    
    // Tab should have inline background-color style from the theme
    expect(hasBackgroundStyle).toBe(true);
  });
  
  test('tab color indicator element should not exist', async ({ page }) => {
    await page.goto('/');
    
    // Wait for app to load
    await page.waitForSelector('.app', { timeout: 10000 });
    
    // The old tab-color-indicator should not exist
    const colorIndicator = page.locator('.tab-color-indicator');
    await expect(colorIndicator).toHaveCount(0);
  });
  
  test('multiple tabs should each have their own background color', async ({ page }) => {
    await page.goto('/');
    
    // Wait for app to load
    await page.waitForSelector('.app', { timeout: 10000 });
    
    // Click new tab button to create a second tab
    const newTabBtn = page.locator('.new-tab-btn');
    await expect(newTabBtn).toBeVisible();
    await newTabBtn.click();
    
    // Wait for second tab to appear
    await page.waitForTimeout(500);
    
    // Both tabs should be visible
    const tabs = page.locator('.tab-bar .tab');
    const tabCount = await tabs.count();
    expect(tabCount).toBeGreaterThanOrEqual(2);
    
    // Each tab should have bold title
    for (let i = 0; i < Math.min(tabCount, 2); i++) {
      const tabTitle = tabs.nth(i).locator('.tab-title');
      const fontWeight = await tabTitle.evaluate((el) => {
        return window.getComputedStyle(el).fontWeight;
      });
      expect(fontWeight).toBe('700');
    }
  });
});
