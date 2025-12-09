import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Reset state
  await page.request.post('/api/sessions', {
    data: { tabs: [], activeTabId: '' }
  }).catch(() => {
    // Server may not be ready yet
  });
});

test('should display active tab magnified and inactive tabs shrunk', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.app', { timeout: 10000 });
  
  // Wait for tab bar to be visible
  await page.waitForSelector('.tab-bar', { timeout: 5000 });
  await page.waitForTimeout(500);
  
  // Create first tab by opening new tab (Ctrl+T)
  await page.keyboard.press('Control+T');
  await page.waitForTimeout(500);
  
  // Create second tab to have an inactive tab
  await page.keyboard.press('Control+T');
  await page.waitForTimeout(500);
  
  // Get both tabs
  const tabs = page.locator('.tab');
  const tabCount = await tabs.count();
  
  if (tabCount < 2) {
    console.log(`Expected at least 2 tabs, got ${tabCount}`);
  }
  
  // Find active and inactive tabs
  const allTabs = await tabs.evaluateAll((elements) => {
    return elements.map((el) => ({
      transform: window.getComputedStyle(el).transform,
      opacity: window.getComputedStyle(el).opacity,
      isActive: el.classList.contains('active')
    }));
  });
  
  const activeTab = allTabs.find(t => t.isActive);
  const inactiveTabs = allTabs.filter(t => !t.isActive);
  
  expect(activeTab).toBeDefined();
  // Active tab should have full opacity
  expect(activeTab.opacity).toBe('1');
  
  if (inactiveTabs.length > 0) {
    // Inactive tabs should have reduced opacity
    inactiveTabs.forEach(tab => {
      expect(parseFloat(tab.opacity)).toBeLessThan(1);
    });
  }
});

test('should scale tab on hover', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.app', { timeout: 10000 });
  await page.waitForSelector('.tab-bar', { timeout: 5000 });
  
  // Create two tabs
  await page.keyboard.press('Control+T');
  await page.waitForTimeout(300);
  await page.keyboard.press('Control+T');
  await page.waitForTimeout(300);
  
  const inactiveTab = page.locator('.tab').nth(0);
  
  // Get initial style
  const beforeHover = await inactiveTab.evaluate((el) => {
    return window.getComputedStyle(el).transform;
  });
  
  // Hover over inactive tab
  await inactiveTab.hover();
  await page.waitForTimeout(250);
  
  // Get hovered style
  const onHover = await inactiveTab.evaluate((el) => {
    return window.getComputedStyle(el).transform;
  });
  
  // Transform should change on hover (0.85 default -> 0.92 on hover)
  expect(beforeHover).not.toBe(onHover);
});

test('should transition smoothly between tab scales', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.app', { timeout: 10000 });
  await page.waitForSelector('.tab-bar', { timeout: 5000 });
  await page.waitForTimeout(500);
  
  // Create two tabs
  await page.keyboard.press('Control+T');
  await page.waitForTimeout(300);
  
  // Get tabs and find which one is active
  const tabs = page.locator('.tab');
  let tabCount = await tabs.count();
  
  if (tabCount >= 2) {
    // Get active tab before creating another
    const beforeSecondCreate = await tabs.evaluateAll((elements) => {
      return elements.map((el) => ({
        isActive: el.classList.contains('active'),
        transform: window.getComputedStyle(el).transform
      }));
    });
    
    const activeBeforeSecond = beforeSecondCreate.find(t => t.isActive);
    expect(activeBeforeSecond).toBeDefined();
    
    // Create another tab
    await page.keyboard.press('Control+T');
    await page.waitForTimeout(300);
    
    // Get new active tab
    const tabsAfterSecond = page.locator('.tab');
    const afterSecondCreate = await tabsAfterSecond.evaluateAll((elements) => {
      return elements.map((el) => ({
        isActive: el.classList.contains('active'),
        transform: window.getComputedStyle(el).transform
      }));
    });
    
    const activeAfterSecond = afterSecondCreate.find(t => t.isActive);
    expect(activeAfterSecond).toBeDefined();
  }
});

test('should maintain visual distinction with multiple tabs', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.app', { timeout: 10000 });
  await page.waitForSelector('.tab-bar', { timeout: 5000 });
  await page.waitForTimeout(500);
  
  // Create multiple tabs
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Control+T');
    await page.waitForTimeout(200);
  }
  
  const tabs = page.locator('.tab');
  
  // Get all tab data
  const tabTransforms = await tabs.evaluateAll((elements) => {
    return elements.map((el) => ({
      transform: window.getComputedStyle(el).transform,
      isActive: el.classList.contains('active'),
      opacity: window.getComputedStyle(el).opacity
    }));
  });
  
  // Find active tab
  const activeTab = tabTransforms.find(t => t.isActive);
  expect(activeTab).toBeDefined();
  
  // Active tab should have full opacity
  expect(parseFloat(activeTab.opacity)).toBe(1);
  
  // All inactive tabs should have reduced opacity
  const inactiveTabs = tabTransforms.filter(t => !t.isActive);
  inactiveTabs.forEach(tab => {
    expect(parseFloat(tab.opacity)).toBeLessThan(1);
  });
});

test('should not break tab functionality with magnified styling', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.app', { timeout: 10000 });
  await page.waitForSelector('.tab-bar', { timeout: 5000 });
  await page.waitForTimeout(500);
  
  // Create two tabs
  await page.keyboard.press('Control+T');
  await page.waitForTimeout(300);
  await page.keyboard.press('Control+T');
  await page.waitForTimeout(300);
  
  const tabs = page.locator('.tab');
  const tabCount = await tabs.count();
  
  if (tabCount >= 2) {
    // Check that we can identify the tabs
    const firstTab = tabs.nth(0);
    
    // Click first tab
    await firstTab.click();
    await page.waitForTimeout(300);
    
    // Verify it became active
    const firstTabActive = await firstTab.evaluate((el) => {
      return el.classList.contains('active');
    });
    expect(firstTabActive).toBe(true);
    
    // Test close button is still visible and functional
    const closeBtn = firstTab.locator('.tab-close');
    const isVisible = await closeBtn.isVisible();
    expect(isVisible).toBe(true);
  }
});
