import { test, expect } from '@playwright/test';

/**
 * Issue #2: Smart Routing UI Not Showing
 * 
 * The SmartRoutingPanel should appear in Task Dashboard's IMPLEMENT stage
 * when user types a prompt > 20 characters.
 */

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5173';

test.describe('Smart Routing UI', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    
    // Dismiss tour if present
    try {
      await page.waitForSelector('.tour-overlay', { timeout: 3000 });
      const skipButton = page.locator('button:has-text("Skip")');
      if (await skipButton.isVisible()) {
        await skipButton.click();
        await page.waitForTimeout(500);
      }
    } catch (e) {}
    
    await page.waitForSelector('.tour-overlay', { state: 'hidden', timeout: 5000 }).catch(() => {});
    await page.waitForSelector('.xterm-screen', { timeout: 10000 });
  });

  test('Task Dashboard opens when toggle button is clicked', async ({ page }) => {
    // Find and click Task Dashboard toggle
    const toggleBtn = page.locator('button[title="Toggle Task Dashboard"]');
    await expect(toggleBtn).toBeVisible({ timeout: 5000 });
    
    await toggleBtn.click();
    await page.waitForTimeout(500);
    
    // Task Dashboard should be visible
    const dashboard = page.locator('.task-dashboard');
    await expect(dashboard).toBeVisible({ timeout: 5000 });
    
    await page.screenshot({ path: 'test-results/smart-routing-dashboard-open.png' });
  });

  test('IMPLEMENT stage shows prompt input', async ({ page }) => {
    // Open Task Dashboard
    const toggleBtn = page.locator('button[title="Toggle Task Dashboard"]');
    await toggleBtn.click();
    await page.waitForTimeout(500);
    
    // The Implement stage should already be expanded (visible in screenshot)
    // Look for the prompt input directly
    const promptInput = page.locator('textarea').filter({ hasText: '' }).first();
    await expect(promptInput).toBeVisible({ timeout: 5000 });
    
    await page.screenshot({ path: 'test-results/smart-routing-implement-stage.png' });
  });

  test('SmartRoutingPanel appears when typing 20+ characters', async ({ page }) => {
    // Open Task Dashboard
    const toggleBtn = page.locator('button[title="Toggle Task Dashboard"]');
    await toggleBtn.click();
    await page.waitForTimeout(500);
    
    // Find the implementation textarea (has placeholder about refactoring)
    const promptInput = page.locator('textarea[placeholder*="Refactor"], textarea[placeholder*="implementation"]').first();
    await expect(promptInput).toBeVisible({ timeout: 5000 });
    
    // Type a prompt > 20 characters to trigger Smart Routing
    await promptInput.fill('Refactor routing logic across 7 files with tests');
    await page.waitForTimeout(1500); // Wait for API calls and panel to appear
    
    // Take screenshot to see what's there
    await page.screenshot({ path: 'test-results/smart-routing-after-typing.png' });
    
    // SmartRoutingPanel should be visible
    const routingPanel = page.locator('.smart-routing-panel');
    await expect(routingPanel).toBeVisible({ timeout: 5000 });
    
    // Should show detected pattern
    await expect(page.locator('[data-testid="detected-pattern"]')).toBeVisible();
    
    await page.screenshot({ path: 'test-results/smart-routing-panel-visible.png' });
  });
});
