/**
 * @fileoverview E2E tests for Diagnostic Overlay System
 * 
 * Tests the diagnostic overlay functionality:
 * - Toggle on/off via debug panel
 * - Event capture and display
 * - Problem detection alerts
 * - Export functionality
 * 
 * Requires dev mode to be enabled.
 */

import { test, expect } from '@playwright/test';

test.describe('Diagnostic Overlay', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
    
    // Wait for app to load
    await page.waitForSelector('.app-container', { timeout: 10000 });
    
    // Enable dev mode first (required for diagnostic overlay)
    // Click settings
    await page.click('button[title*="Settings"]');
    await page.waitForSelector('.settings-modal', { timeout: 5000 });
    
    // Find and enable dev mode toggle
    const devModeToggle = page.locator('text=Developer Mode').locator('..').locator('input[type="checkbox"]');
    const isChecked = await devModeToggle.isChecked();
    if (!isChecked) {
      await devModeToggle.click();
    }
    
    // Close settings modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  });

  test('should show diagnostic overlay toggle in debug panel', async ({ page }) => {
    // Navigate to debug panel
    await page.click('button:has-text("Debug")');
    await page.waitForTimeout(300);
    
    // Should see the "Show Diagnostics" button
    const diagnosticsButton = page.locator('button:has-text("Diagnostics")');
    await expect(diagnosticsButton).toBeVisible();
  });

  test('should toggle diagnostic overlay on and off', async ({ page }) => {
    // Navigate to debug panel
    await page.click('button:has-text("Debug")');
    await page.waitForTimeout(300);
    
    // Click to show diagnostics
    await page.click('button:has-text("Show Diagnostics")');
    await page.waitForTimeout(300);
    
    // Overlay should appear
    const overlay = page.locator('.diagnostic-overlay');
    await expect(overlay).toBeVisible();
    
    // Button text should change
    const hideButton = page.locator('button:has-text("Hide Diagnostics")');
    await expect(hideButton).toBeVisible();
    
    // Click to hide
    await hideButton.click();
    await page.waitForTimeout(300);
    
    // Overlay should disappear
    await expect(overlay).not.toBeVisible();
  });

  test('should capture keyboard events', async ({ page }) => {
    // Open diagnostics
    await page.click('button:has-text("Debug")');
    await page.click('button:has-text("Show Diagnostics")');
    await page.waitForTimeout(300);
    
    // Click on terminal to focus it
    await page.click('.terminal-container');
    await page.waitForTimeout(100);
    
    // Type some keys
    await page.keyboard.type('hello');
    await page.waitForTimeout(500);
    
    // Check overlay for keyboard events
    const overlay = page.locator('.diagnostic-overlay');
    await expect(overlay).toContainText('pressed');
  });

  test('should display problem alerts when issues detected', async ({ page }) => {
    // This test verifies the UI structure for problem alerts
    // Actual problem triggering would require more complex setup
    
    await page.click('button:has-text("Debug")');
    await page.click('button:has-text("Show Diagnostics")');
    await page.waitForTimeout(300);
    
    // Verify overlay structure
    const overlay = page.locator('.diagnostic-overlay');
    await expect(overlay).toBeVisible();
    
    // Should have header with "Diagnostics" title
    await expect(overlay).toContainText('Diagnostics');
    
    // Should have control buttons
    const liveButton = overlay.locator('button:has-text("Live")');
    await expect(liveButton).toBeVisible();
  });

  test('should allow pausing event capture', async ({ page }) => {
    await page.click('button:has-text("Debug")');
    await page.click('button:has-text("Show Diagnostics")');
    await page.waitForTimeout(300);
    
    // Click pause button
    const overlay = page.locator('.diagnostic-overlay');
    const liveButton = overlay.locator('button:has-text("Live")');
    await liveButton.click();
    await page.waitForTimeout(200);
    
    // Should now show "Paused"
    const pausedButton = overlay.locator('button:has-text("Paused")');
    await expect(pausedButton).toBeVisible();
  });

  test('should export diagnostic session', async ({ page }) => {
    await page.click('button:has-text("Debug")');
    await page.click('button:has-text("Show Diagnostics")');
    await page.waitForTimeout(300);
    
    // Generate some events
    await page.click('.terminal-container');
    await page.keyboard.type('test');
    await page.waitForTimeout(300);
    
    // Set up download listener
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('.diagnostic-overlay button[title="Export session"]').click(),
    ]);
    
    // Verify download filename
    expect(download.suggestedFilename()).toContain('forge-diagnostic-');
    expect(download.suggestedFilename()).toContain('.json');
  });

  test('should minimize and expand overlay', async ({ page }) => {
    await page.click('button:has-text("Debug")');
    await page.click('button:has-text("Show Diagnostics")');
    await page.waitForTimeout(300);
    
    const overlay = page.locator('.diagnostic-overlay');
    
    // Click minimize button
    await overlay.locator('button[title="Minimize"]').click();
    await page.waitForTimeout(200);
    
    // Should still be visible but smaller (check for expand button)
    await expect(overlay.locator('button[title="Expand"]')).toBeVisible();
    
    // Expand again
    await overlay.locator('button[title="Expand"]').click();
    await page.waitForTimeout(200);
    
    // Should show minimize button again
    await expect(overlay.locator('button[title="Minimize"]')).toBeVisible();
  });

  test('should show session info in footer', async ({ page }) => {
    await page.click('button:has-text("Debug")');
    await page.click('button:has-text("Show Diagnostics")');
    await page.waitForTimeout(300);
    
    const overlay = page.locator('.diagnostic-overlay');
    
    // Footer should show session ID and event count
    await expect(overlay).toContainText('Session:');
    await expect(overlay).toContainText('events');
    await expect(overlay).toContainText('Started:');
  });
});

test.describe('Diagnostic System Integration', () => {
  test('should persist diagnostic state during session', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app-container', { timeout: 10000 });
    
    // Enable dev mode
    await page.click('button[title*="Settings"]');
    const devModeToggle = page.locator('text=Developer Mode').locator('..').locator('input[type="checkbox"]');
    if (!(await devModeToggle.isChecked())) {
      await devModeToggle.click();
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    
    // Open diagnostics
    await page.click('button:has-text("Debug")');
    await page.click('button:has-text("Show Diagnostics")');
    
    // Generate events
    await page.click('.terminal-container');
    await page.keyboard.type('abc');
    await page.waitForTimeout(500);
    
    // Get event count
    const overlay = page.locator('.diagnostic-overlay');
    const footerText = await overlay.locator('text=/\\d+ events/').textContent();
    const eventCount = parseInt(footerText?.match(/(\d+) events/)?.[1] || '0');
    
    // Should have captured events
    expect(eventCount).toBeGreaterThan(0);
  });
});
