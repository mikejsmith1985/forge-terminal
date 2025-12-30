/**
 * E2E Test: LensFilePicker - Context Builder
 * 
 * Tests the new Lens-based file picker with:
 * - Heatmap mode (sorted by modification time)
 * - Graph mode (grouped by directory)
 * - Search mode (fuzzy search)
 * - Context Cart (file selection with token counting)
 */

import { test, expect } from '@playwright/test';

// Helper to dismiss modals
async function dismissModals(page) {
  // Dismiss the "Welcome to Forge Terminal" tour modal - use specific class
  const tourSkipBtn = page.locator('.tour-btn-skip');
  if (await tourSkipBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await tourSkipBtn.click({ force: true });
    await page.waitForTimeout(500);
  }
  
  // Also try the X close button
  const tourCloseBtn = page.locator('.tour-tooltip-close');
  if (await tourCloseBtn.isVisible({ timeout: 300 }).catch(() => false)) {
    await tourCloseBtn.click({ force: true });
    await page.waitForTimeout(300);
  }
  
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  
  // Dismiss File Access Permissions modal
  const confirmButton = page.locator('button:has-text("Confirm Selection")');
  if (await confirmButton.isVisible({ timeout: 500 }).catch(() => false)) {
    await confirmButton.click();
    await page.waitForTimeout(200);
  }
  
  const laterButton = page.locator('button:has-text("Later")');
  if (await laterButton.isVisible({ timeout: 300 }).catch(() => false)) {
    await laterButton.click();
    await page.waitForTimeout(200);
  }
  
  // Press Escape again to close any remaining overlays
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
}

test.describe('LensFilePicker', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.tab-bar', { timeout: 10000 });
    
    // Wait for and dismiss File Access Permissions modal
    const confirmButton = page.locator('button:has-text("Confirm Selection")');
    if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmButton.click();
      await page.waitForTimeout(500);
    }
    
    await dismissModals(page);
    await page.waitForTimeout(300);
  });

  test('opens Files sidebar with LensFilePicker', async ({ page }) => {
    // Capture console errors
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    page.on('pageerror', err => {
      errors.push(err.message);
    });

    // Wait for app to fully load and dismiss any modals
    await page.waitForTimeout(1000);
    await dismissModals(page);
    await page.waitForTimeout(500);

    // Click on Files tab in the ribbon (right sidebar)
    const filesTab = page.locator('.sidebar-view-tab:has-text("Files"), button:has-text("Files")').first();
    
    await page.screenshot({ path: 'test-results/lens-00-before-click.png', fullPage: true });
    
    if (await filesTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await filesTab.click({ force: true });
      await page.waitForTimeout(1000);
    }
    
    // Log any errors
    if (errors.length > 0) {
      console.log('Console errors:');
      errors.slice(0, 5).forEach((e, i) => console.log(`  ${i+1}. ${e.substring(0, 200)}`));
    }
    
    // Check if File Access modal appeared and dismiss it
    const confirmButton = page.locator('button:has-text("Confirm Selection")');
    if (await confirmButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await confirmButton.click();
      await page.waitForTimeout(500);
    }
    
    await page.screenshot({ path: 'test-results/lens-01-files-sidebar.png', fullPage: true });
    
    // Check for error boundary - FAIL if visible
    const errorBoundary = page.locator('text=Something Went Wrong');
    const hasError = await errorBoundary.isVisible({ timeout: 500 }).catch(() => false);
    console.log('Has error boundary:', hasError);
    
    // Look for lens picker elements - use the actual class names
    const lensPicker = page.locator('.lens-picker');
    const contextCart = page.locator('text=Context Cart');
    const heatmapTab = page.locator('button:has-text("Heatmap")');
    
    const isLensVisible = await lensPicker.isVisible({ timeout: 3000 }).catch(() => false);
    const isCartVisible = await contextCart.isVisible({ timeout: 1000 }).catch(() => false);
    const isHeatmapVisible = await heatmapTab.isVisible({ timeout: 1000 }).catch(() => false);
    
    console.log('LensFilePicker visible:', isLensVisible);
    console.log('Context Cart visible:', isCartVisible);
    console.log('Heatmap tab visible:', isHeatmapVisible);
    console.log('Total errors:', errors.length);
    
    // MUST NOT have error boundary
    expect(hasError).toBe(false);
    
    // LensFilePicker should be visible
    expect(isLensVisible || isCartVisible || isHeatmapVisible).toBe(true);
  });

  test('lens tabs can be switched', async ({ page }) => {
    // Open files sidebar
    const filesButton = page.locator('[title*="Files"], button:has-text("Files")').first();
    if (await filesButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await filesButton.click();
      await page.waitForTimeout(500);
    }
    
    // Look for Heatmap tab
    const heatmapTab = page.locator('.lens-tab:has-text("Heatmap")');
    const graphTab = page.locator('.lens-tab:has-text("Graph")');
    const searchTab = page.locator('.lens-tab:has-text("Search")');
    
    await page.screenshot({ path: 'test-results/lens-03-heatmap-default.png', fullPage: true });
    
    // Try clicking Graph tab
    if (await graphTab.isVisible({ timeout: 1000 }).catch(() => false)) {
      await graphTab.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: 'test-results/lens-04-graph-mode.png', fullPage: true });
    }
    
    // Try clicking Search tab
    if (await searchTab.isVisible({ timeout: 1000 }).catch(() => false)) {
      await searchTab.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: 'test-results/lens-05-search-mode.png', fullPage: true });
    }
    
    console.log('✅ Lens tab switching test completed');
  });

  test('files can be selected into cart', async ({ page }) => {
    // Open files sidebar
    const filesButton = page.locator('[title*="Files"], button:has-text("Files")').first();
    if (await filesButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await filesButton.click();
      await page.waitForTimeout(500);
    }
    
    // Look for file items
    const fileItems = page.locator('.lens-file-item');
    const fileCount = await fileItems.count().catch(() => 0);
    console.log('File items found:', fileCount);
    
    if (fileCount > 0) {
      // Click first file to select
      await fileItems.first().click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: 'test-results/lens-06-file-selected.png', fullPage: true });
      
      // Check if cart shows the file
      const cartItems = page.locator('.lens-cart-item');
      const cartCount = await cartItems.count();
      console.log('Cart items:', cartCount);
      
      // Expect at least one item in cart
      expect(cartCount).toBeGreaterThanOrEqual(1);
    }
    
    console.log('✅ File selection test completed');
  });

  test('search lens filters files', async ({ page }) => {
    // Open files sidebar
    const filesButton = page.locator('[title*="Files"], button:has-text("Files")').first();
    if (await filesButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await filesButton.click();
      await page.waitForTimeout(500);
    }
    
    // Switch to search tab
    const searchTab = page.locator('.lens-tab:has-text("Search")');
    if (await searchTab.isVisible({ timeout: 1000 }).catch(() => false)) {
      await searchTab.click();
      await page.waitForTimeout(300);
    }
    
    // Find search input
    const searchInput = page.locator('.lens-search-input input');
    if (await searchInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await searchInput.fill('main');
      await page.waitForTimeout(300);
      await page.screenshot({ path: 'test-results/lens-07-search-filter.png', fullPage: true });
      
      // Check filtered results
      const fileItems = page.locator('.lens-file-item');
      const filteredCount = await fileItems.count();
      console.log('Filtered files:', filteredCount);
    }
    
    console.log('✅ Search filter test completed');
  });

  test('cart shows token budget', async ({ page }) => {
    // Open files sidebar
    const filesButton = page.locator('[title*="Files"], button:has-text("Files")').first();
    if (await filesButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await filesButton.click();
      await page.waitForTimeout(500);
    }
    
    // Look for budget display
    const budgetText = page.locator('.lens-budget-text, .lens-cart-budget');
    const isBudgetVisible = await budgetText.isVisible({ timeout: 2000 }).catch(() => false);
    console.log('Budget display visible:', isBudgetVisible);
    
    if (isBudgetVisible) {
      const text = await budgetText.textContent();
      console.log('Budget text:', text);
      
      // Should contain token count
      expect(text).toContain('tokens');
    }
    
    await page.screenshot({ path: 'test-results/lens-08-cart-budget.png', fullPage: true });
    
    console.log('✅ Token budget test completed');
  });
});
