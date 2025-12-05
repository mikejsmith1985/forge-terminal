import { test, expect } from '@playwright/test';

test.describe('Issue #10 Fixes', () => {
  
  test.describe('Fix #1: Multiple Screenshots in Feedback Modal', () => {
    test('should allow capturing multiple screenshots', async ({ page }) => {
      await page.goto('/');
      
      // Wait for app to load
      await page.waitForSelector('.app', { timeout: 10000 });
      
      // Open feedback modal via the feedback button
      const feedbackBtn = page.locator('button[title="Send Feedback"]');
      await feedbackBtn.click();
      
      // Wait for modal to appear
      await page.waitForSelector('.modal-overlay');
      
      // Check that modal header is visible
      await expect(page.locator('.modal-header h3')).toContainText('Send Feedback');
      
      // If we see "Setup Required", we need to fill in a token first
      const setupView = page.locator('.setup-view');
      if (await setupView.isVisible()) {
        // Enter a test token (doesn't need to be valid for screenshot testing)
        await page.locator('input[type="password"]').fill('ghp_test_token_12345');
        await page.locator('button:has-text("Save Settings")').click();
        
        // Wait for form to appear
        await page.waitForSelector('.feedback-form');
      }
      
      // Screenshot section should show "Screenshots" label
      const screenshotLabel = page.locator('.screenshot-section label');
      await expect(screenshotLabel).toBeVisible();
      
      // Capture first screenshot
      const captureBtn = page.locator('button:has-text("Capture Screen")');
      await captureBtn.click();
      
      // Wait for screenshot to be captured (button text should change)
      await page.waitForSelector('button:has-text("Add Another")', { timeout: 5000 });
      
      // Verify first screenshot appears
      const screenshotPreview = page.locator('.screenshot-preview');
      await expect(screenshotPreview.first()).toBeVisible();
      
      // Screenshot count should show (1)
      await expect(screenshotLabel).toContainText('(1)');
      
      // Capture second screenshot
      const addAnotherBtn = page.locator('button:has-text("Add Another")');
      await addAnotherBtn.click();
      
      // Wait for second screenshot
      await page.waitForTimeout(1000);
      
      // Should now have 2 screenshots
      const screenshotPreviews = page.locator('.screenshot-preview');
      await expect(screenshotPreviews).toHaveCount(2);
      
      // Label should show (2)
      await expect(screenshotLabel).toContainText('(2)');
      
      // Each screenshot should have a remove button
      const removeButtons = page.locator('.screenshot-preview button:has-text("Remove")');
      await expect(removeButtons).toHaveCount(2);
      
      // Remove first screenshot
      await removeButtons.first().click();
      
      // Should now have 1 screenshot
      await expect(page.locator('.screenshot-preview')).toHaveCount(1);
      await expect(screenshotLabel).toContainText('(1)');
      
      // Close modal
      await page.locator('.modal-header .btn-close').click();
    });
  });
  
  test.describe('Fix #2: Version Check', () => {
    test('should return correct version from API', async ({ page }) => {
      // Check the version endpoint
      const response = await page.request.get('/api/version');
      expect(response.ok()).toBe(true);
      
      const data = await response.json();
      // Version should be a valid semver string
      expect(data.version).toMatch(/^\d+\.\d+\.\d+$/);
    });
    
    test('should not show update notification for current version', async ({ page }) => {
      await page.goto('/');
      
      // Wait for app to load
      await page.waitForSelector('.app', { timeout: 10000 });
      
      // Wait a bit for update check to complete
      await page.waitForTimeout(2000);
      
      // Check that no update toast is visible (or if visible, it shouldn't say update available for 1.4.0)
      const updateToast = page.locator('.toast:has-text("Update available")');
      const toastCount = await updateToast.count();
      
      // If an update toast appears, it should be for a version newer than 1.4.0
      if (toastCount > 0) {
        const toastText = await updateToast.first().textContent();
        // The toast should mention a version, and it shouldn't be 1.4.0 or lower
        expect(toastText).not.toContain('1.4.0');
        expect(toastText).not.toContain('1.3.');
      }
    });
  });
  
  test.describe('Fix #3: Tab1 Shell Settings', () => {
    test('should load and display settings modal', async ({ page }) => {
      await page.goto('/');
      
      // Wait for app to load
      await page.waitForSelector('.app', { timeout: 10000 });
      
      // Open settings modal
      const settingsBtn = page.locator('button[title="Shell Settings"]');
      await settingsBtn.click();
      
      // Wait for settings modal
      await page.waitForSelector('.modal-overlay');
      
      // Verify settings modal has shell configuration options
      await expect(page.locator('.modal-header h3')).toContainText('Settings');
      
      // Close modal
      await page.locator('.modal-header .btn-close').click();
    });
    
    test('tabs should exist and be switchable', async ({ page }) => {
      await page.goto('/');
      
      // Wait for app to load  
      await page.waitForSelector('.app', { timeout: 10000 });
      
      // Tab bar should be visible
      const tabBar = page.locator('.tab-bar');
      await expect(tabBar).toBeVisible();
      
      // At least one tab should exist
      const tabs = page.locator('.tab-bar .tab');
      await expect(tabs.first()).toBeVisible();
      
      // Should have a new tab button
      const newTabBtn = page.locator('.tab-bar button[title*="tab"], .tab-bar .new-tab-btn');
      await expect(newTabBtn).toBeVisible();
    });
  });
});
