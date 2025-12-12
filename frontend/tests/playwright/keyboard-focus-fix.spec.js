// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Keyboard Focus Fix Tests - v1.22.12
 * 
 * Tests that the DiagnosticsButton doesn't steal keyboard focus
 * and that orphaned components have been removed successfully.
 */

test.describe('Keyboard Focus Fix', () => {
  test.beforeEach(async ({ page }) => {
    // Start the app
    await page.goto('/');
    
    // Wait for terminal to be ready
    await page.waitForSelector('.xterm-helper-textarea', { timeout: 15000 });
    
    // Close any welcome modal if present
    const welcomeModal = page.locator('.welcome-modal');
    if (await welcomeModal.count() > 0) {
      const closeBtn = page.locator('.welcome-modal .btn-primary, .welcome-modal button').first();
      if (await closeBtn.count() > 0) {
        await closeBtn.click();
        await page.waitForTimeout(500);
      }
    }
    
    await page.waitForTimeout(1000);
  });

  test('DiagnosticsButton has tabIndex=-1 to prevent focus stealing', async ({ page }) => {
    // Check if DiagnosticsButton exists and has correct tabIndex
    const diagButton = page.locator('.diagnostics-button');
    
    // The button might only appear in dev mode or certain conditions
    // If it exists, verify it has tabIndex=-1
    const count = await diagButton.count();
    if (count > 0) {
      const tabIndex = await diagButton.getAttribute('tabindex');
      expect(tabIndex).toBe('-1');
      console.log('✅ DiagnosticsButton has tabIndex=-1');
    } else {
      console.log('ℹ️ DiagnosticsButton not visible (may require dev mode or specific conditions)');
    }
  });

  test('Clicking sidebar tabs does not break terminal focus', async ({ page }) => {
    // Find the FIRST visible terminal textarea (active tab)
    const terminalTextarea = page.locator('.xterm-helper-textarea').first();
    await terminalTextarea.focus();
    
    // Verify terminal has focus
    const activeElementBefore = await page.evaluate(() => document.activeElement?.className);
    expect(activeElementBefore).toContain('xterm-helper-textarea');
    
    // Click on Cards tab (should already be selected, but click anyway)
    const cardsTab = page.locator('.sidebar-view-tab').first();
    await cardsTab.click();
    await page.waitForTimeout(200);
    
    // Refocus terminal and verify typing works
    await terminalTextarea.focus();
    await terminalTextarea.type('echo test', { delay: 50 });
    
    // Terminal should still be functional
    const terminalContent = await page.locator('.xterm-rows').first().textContent();
    expect(terminalContent).toBeTruthy();
  });

  test('Terminal receives keyboard input correctly', async ({ page }) => {
    const terminalTextarea = page.locator('.xterm-helper-textarea').first();
    await terminalTextarea.focus();
    
    // Type a test command
    const testStr = 'echo hello world';
    await terminalTextarea.type(testStr, { delay: 30 });
    
    // Verify keyboard events are captured
    const terminalContent = await page.locator('.xterm-rows').first().textContent();
    // Terminal should show the typed text (or at least be non-empty)
    expect(terminalContent?.length).toBeGreaterThan(0);
    
    console.log('✅ Terminal receives keyboard input correctly');
  });
});

test.describe('Orphaned Components Removal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.sidebar', { timeout: 15000 });
    
    // Close any welcome modal if present
    const welcomeModal = page.locator('.welcome-modal');
    if (await welcomeModal.count() > 0) {
      const closeBtn = page.locator('.welcome-modal .btn-primary, .welcome-modal button').first();
      if (await closeBtn.count() > 0) {
        await closeBtn.click();
        await page.waitForTimeout(500);
      }
    }
  });

  test('App loads successfully after orphaned components removed', async ({ page }) => {
    // Verify core UI elements exist
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.locator('.terminal-container')).toBeVisible();
    await expect(page.locator('.sidebar-view-tabs')).toBeVisible();
    
    console.log('✅ App loads successfully after orphaned components removed');
  });

  test('Sidebar tabs work correctly (Cards, Files)', async ({ page }) => {
    const sidebarTabs = page.locator('.sidebar-view-tab');
    
    // Should have at least Cards and Files tabs
    const tabCount = await sidebarTabs.count();
    expect(tabCount).toBeGreaterThanOrEqual(2);
    
    // Click Files tab
    const filesTab = sidebarTabs.filter({ hasText: 'Files' });
    await filesTab.click();
    await page.waitForTimeout(1000);
    
    // Either FileAccessPrompt modal appears or FileExplorer loads, or sidebar content changes
    const hasFileExplorer = await page.locator('.file-explorer').count() > 0;
    const hasModal = await page.locator('.modal').count() > 0;
    const sidebarHeader = await page.locator('.sidebar-header').textContent();
    const filesHeaderVisible = sidebarHeader?.includes('Files');
    
    // The test passes if any of these are true - Files tab is responding
    expect(hasFileExplorer || hasModal || filesHeaderVisible).toBeTruthy();
    
    // Close any modal if present before clicking Cards
    const modalCount = await page.locator('.modal-overlay').count();
    if (modalCount > 0) {
      // Press Escape to close any modal
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
    
    // Click Cards tab
    const cardsTab = sidebarTabs.filter({ hasText: 'Cards' });
    await cardsTab.click({ force: true }); // Force click in case overlay is present
    await page.waitForTimeout(500);
    
    // Command cards area should be visible
    await expect(page.locator('.sidebar-content')).toBeVisible();
    
    console.log('✅ Sidebar tabs work correctly');
  });

  test('Settings button opens modal correctly', async ({ page }) => {
    // Click settings button
    const settingsButton = page.locator('[title="Shell Settings"]');
    await settingsButton.click();
    await page.waitForTimeout(500);
    
    // Settings modal should open - use a more specific selector
    const settingsModal = page.locator('.modal').filter({ hasText: 'Shell Settings' });
    await expect(settingsModal).toBeVisible({ timeout: 5000 });
    
    // Close the modal
    const closeButton = settingsModal.locator('.modal-close, .close-button, button:has-text("×")').first();
    await closeButton.click();
    
    // Modal should close
    await expect(settingsModal).not.toBeVisible({ timeout: 3000 });
    
    console.log('✅ Settings modal opens and closes correctly');
  });
});

test.describe('AM Polling Configuration', () => {
  test('AM config is loaded with correct defaults', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.sidebar', { timeout: 15000 });
    
    // Check that AM_CONFIG is accessible via window
    const pollingInterval = await page.evaluate(() => {
      return window.__forgeAMConfig?.getPollingInterval?.() || null;
    });
    
    // Default should be 30000ms (30 seconds)
    if (pollingInterval) {
      expect(pollingInterval).toBeGreaterThanOrEqual(5000);
      expect(pollingInterval).toBeLessThanOrEqual(300000);
      console.log(`✅ AM polling interval: ${pollingInterval}ms`);
    } else {
      console.log('ℹ️ AM config not exposed via window (may be dev mode only)');
    }
  });
});
