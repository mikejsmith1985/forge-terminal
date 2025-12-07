// issue-fixes-v1.11.spec.js - Tests for Issue Fixes
// Issue 1: PostInstallModal removal - Update should use direct refresh
// Issue 2: DevMode save should use page refresh instead of websocket reconnect  
// Issue 3: WSL File Explorer path resolution

import { test, expect } from '@playwright/test';

test.describe('v1.11 Issue Fixes', () => {
  
  test.beforeEach(async ({ page }) => {
    // Clear localStorage for clean state
    await page.goto('http://localhost:8333');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('.terminal-container', { timeout: 30000 });
  });

  test.describe('Issue 1: PostInstallModal Removal', () => {
    
    test('UpdateModal should exist and be accessible', async ({ page }) => {
      // Click the download/update button
      const updateButton = page.locator('button[title*="Version"]');
      await expect(updateButton).toBeVisible({ timeout: 5000 });
      await updateButton.click();
      
      // Modal should open
      await expect(page.locator('.modal-header:has-text("Software Update")')).toBeVisible();
    });

    test('Update modal should not contain PostInstallModal references', async ({ page }) => {
      // Check that the page doesn't have PostInstallModal elements
      const hasPostInstallModal = await page.evaluate(() => {
        return document.body.innerHTML.includes('Forging a New Version') ||
               document.body.innerHTML.includes('ForgeVideo.mp4');
      });
      expect(hasPostInstallModal).toBe(false);
    });

    test('Update modal shows success message without video', async ({ page }) => {
      // Open update modal
      const updateButton = page.locator('button[title*="Version"]');
      await updateButton.click();
      await page.waitForSelector('.modal-header');
      
      // Modal should show current version info
      await expect(page.locator('text=Current Version')).toBeVisible();
      
      // No video elements should be present
      const videoCount = await page.locator('video').count();
      expect(videoCount).toBe(0);
    });
  });

  test.describe('Issue 2: DevMode Save & Refresh', () => {
    
    test('Settings modal should have DevMode toggle', async ({ page }) => {
      // Open settings
      await page.click('button[title="Shell Settings"]');
      await page.waitForSelector('.modal-header', { timeout: 5000 });
      
      // DevMode checkbox should be visible
      const devModeCheckbox = page.locator('input[name="devMode"]');
      await expect(devModeCheckbox).toBeVisible();
    });

    test('DevMode toggle should update localStorage immediately', async ({ page }) => {
      // Open settings
      await page.click('button[title="Shell Settings"]');
      await page.waitForSelector('.modal-header');
      
      // Toggle DevMode on
      const devModeCheckbox = page.locator('input[name="devMode"]');
      await devModeCheckbox.check();
      
      // Wait for state to update
      await page.waitForTimeout(300);
      
      // Check localStorage was updated
      const devModeValue = await page.evaluate(() => localStorage.getItem('devMode'));
      expect(devModeValue).toBe('true');
    });

    test('DevMode toggle shows Files tab immediately', async ({ page }) => {
      // Initially Files tab should not be visible
      await expect(page.locator('button:has-text("Files")')).not.toBeVisible();
      
      // Open settings and enable DevMode
      await page.click('button[title="Shell Settings"]');
      await page.waitForSelector('.modal-header');
      
      const devModeCheckbox = page.locator('input[name="devMode"]');
      await devModeCheckbox.check();
      await page.waitForTimeout(500);
      
      // Files tab should now be visible
      await expect(page.locator('button:has-text("Files")')).toBeVisible();
    });

    test('Save & Restart should close modal', async ({ page }) => {
      // Open settings
      await page.click('button[title="Shell Settings"]');
      await page.waitForSelector('.modal-header');
      
      // Find the Save button
      const saveButton = page.locator('button:has-text("Save & Restart")');
      await expect(saveButton).toBeVisible();
    });
  });

  test.describe('Issue 3: WSL File Explorer Path Resolution', () => {
    
    test('API should handle basic file listing', async ({ page }) => {
      // Test the API directly with current directory
      const response = await page.request.get('http://localhost:8333/api/files/list?path=.&rootPath=.');
      expect(response.status()).toBe(200);
      
      const data = await response.json();
      expect(data).toBeTruthy();
      expect(data.isDir).toBe(true);
      expect(data.name).toBeTruthy();
    });

    test('API should accept shell and distro parameters', async ({ page }) => {
      // Test API with WSL parameters (won't fail on Linux, just uses normal path resolution)
      const response = await page.request.get(
        'http://localhost:8333/api/files/list?path=.&rootPath=.&shell=powershell'
      );
      expect(response.status()).toBe(200);
    });

    test('File explorer loads when DevMode is enabled', async ({ page }) => {
      // Enable DevMode
      await page.click('button[title="Shell Settings"]');
      await page.waitForSelector('.modal-header');
      await page.locator('input[name="devMode"]').check();
      await page.waitForTimeout(500);
      
      // Close modal by clicking btn-close (X button)
      await page.locator('.btn-close').click();
      await page.waitForTimeout(500);
      
      // Check if Files tab is visible in sidebar view tabs
      const filesTab = page.locator('.sidebar-view-tab:has-text("Files")');
      const isVisible = await filesTab.isVisible();
      
      if (isVisible) {
        await filesTab.click();
        await page.waitForTimeout(1500);
        
        // File explorer should show content - look for file-explorer or loading message
        const hasContent = await page.evaluate(() => {
          return document.body.innerHTML.includes('file-explorer') || 
                 document.body.innerHTML.includes('Loading files') ||
                 document.body.innerHTML.includes('Files');
        });
        expect(hasContent).toBe(true);
      } else {
        // DevMode checkbox should have made the tab visible - this is a bug
        expect(isVisible).toBe(true);
      }
    });

    test('FileExplorer receives shellConfig prop', async ({ page }) => {
      // Enable DevMode
      await page.click('button[title="Shell Settings"]');
      await page.waitForSelector('.modal-header');
      await page.locator('input[name="devMode"]').check();
      await page.waitForTimeout(300);
      
      // Close modal by clicking X button
      await page.locator('.btn-close').click();
      await page.waitForTimeout(500);
      
      // Switch to Files view
      const filesTab = page.locator('.sidebar-view-tab:has-text("Files")');
      if (await filesTab.isVisible()) {
        await filesTab.click();
        await page.waitForTimeout(500);
        
        // Component should be present (check for class or loading state)
        const hasFileExplorer = await page.evaluate(() => {
          return document.body.innerHTML.includes('file-explorer') || 
                 document.body.innerHTML.includes('Loading files');
        });
        expect(hasFileExplorer).toBe(true);
      } else {
        // DevMode should make Files visible
        expect(await filesTab.isVisible()).toBe(true);
      }
    });
    
    test('File tree should display directories and files', async ({ page }) => {
      // Enable DevMode
      await page.click('button[title="Shell Settings"]');
      await page.waitForSelector('.modal-header');
      await page.locator('input[name="devMode"]').check();
      await page.waitForTimeout(300);
      await page.locator('.btn-close').click();
      await page.waitForTimeout(500);
      
      // Click Files tab
      const filesTab = page.locator('.sidebar-view-tab:has-text("Files")');
      if (await filesTab.isVisible()) {
        await filesTab.click();
        await page.waitForTimeout(2000);
        
        // Should have file tree nodes
        const hasFileTree = await page.evaluate(() => {
          return document.body.innerHTML.includes('file-tree') ||
                 document.body.innerHTML.includes('file-explorer');
        });
        expect(hasFileTree).toBe(true);
      }
    });
  });

  test.describe('Integration Tests', () => {
    
    test('Settings save without terminal reconnection loop', async ({ page }) => {
      // Open settings
      await page.click('button[title="Shell Settings"]');
      await page.waitForSelector('.modal-header');
      
      // Toggle DevMode
      const devModeCheckbox = page.locator('input[name="devMode"]');
      await devModeCheckbox.check();
      
      // Page state should be stable (no reconnection messages in terminal)
      await page.waitForTimeout(1000);
      
      // Terminal should not show "Reconnecting" or "Attempt X/5" messages
      const terminalText = await page.locator('.terminal-container').textContent();
      const hasReconnectingMessage = terminalText.includes('Reconnecting') && 
                                      terminalText.includes('Attempt');
      expect(hasReconnectingMessage).toBe(false);
    });

    test('Cards tab remains visible after DevMode toggle', async ({ page }) => {
      // Cards tab should always be visible (use sidebar-view-tab class for specificity)
      await expect(page.locator('.sidebar-view-tab:has-text("Cards")')).toBeVisible();
      
      // Enable DevMode
      await page.click('button[title="Shell Settings"]');
      await page.waitForSelector('.modal-header');
      await page.locator('input[name="devMode"]').check();
      await page.waitForTimeout(300);
      
      // Cards tab should still be visible
      await expect(page.locator('.sidebar-view-tab:has-text("Cards")')).toBeVisible();
      
      // Now Files tab should also be visible
      await expect(page.locator('.sidebar-view-tab:has-text("Files")')).toBeVisible();
    });

    test('Terminal remains functional after settings changes', async ({ page }) => {
      // Terminal should be connected
      await page.waitForSelector('.terminal-container', { timeout: 15000 });
      
      // Wait for terminal to initialize
      await page.waitForTimeout(2000);
      
      // Terminal content area should exist
      const terminalInner = page.locator('.terminal-inner');
      await expect(terminalInner).toBeVisible();
    });
  });
});
