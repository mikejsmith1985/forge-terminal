import { test, expect } from '@playwright/test';

const baseURL = 'http://127.0.0.1:8333';

test.describe('DiagnosticsButton - Basic Functionality', () => {
  
  test('should show button and open panel on click', async ({ page }) => {
    console.log('[Test] Navigating to Forge Terminal...');
    await page.goto(baseURL, { waitUntil: 'load', timeout: 15000 });
    
    // Wait for terminal to load
    await page.waitForSelector('.terminal-inner', { timeout: 10000 });
    console.log('[Test] Terminal loaded');
    
    // Find the diagnostics button
    const button = page.locator('button:has-text("Debug")').first();
    await expect(button).toBeVisible({ timeout: 5000 });
    console.log('[Test] Diagnostics button visible');
    
    // Click the button
    await button.click();
    console.log('[Test] Button clicked');
    
    // Wait for panel to appear (with text "Diagnostics")
    const panelHeading = page.locator('h4:has-text("Diagnostics")');
    await expect(panelHeading).toBeVisible({ timeout: 5000 });
    console.log('[Test] Panel opened successfully');
    
    // Verify panel contains diagnostic data
    await expect(page.locator('text=Tab ID:')).toBeVisible();
    await expect(page.locator('text=Textareas:')).toBeVisible();
    await expect(page.locator('text=WebSocket:')).toBeVisible();
    console.log('[Test] Diagnostic data present');
    
    // Close the panel
    const closeButton = page.locator('button:has-text("×")');
    await closeButton.click();
    console.log('[Test] Panel closed');
    
    // Verify panel is gone
    await expect(panelHeading).not.toBeVisible();
    console.log('[Test] Test complete ✅');
  });
});
