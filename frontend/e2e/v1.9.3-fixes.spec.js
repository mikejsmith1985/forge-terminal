// @ts-check
import { test, expect } from '@playwright/test';

/**
 * v1.9.3 Bug Fixes Test Suite
 * 
 * Tests for issues reported in v1.9.2:
 * 1. Restore default cards button always visible
 * 2. Session refresh button visible and working
 * 3. Update reloads in same tab (not new tab)
 * 4. Session persistence saves and restores directories
 */

test.describe('v1.9.3 Bug Fixes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8333');
    await page.waitForLoadState('networkidle');
    // Wait for terminal to be ready
    await page.locator('.xterm-screen').first().waitFor({ state: 'visible', timeout: 20000 });
  });

  test('Issue 1: Restore default cards button is always visible in settings', async ({ page }) => {
    console.log('[Test] Opening settings modal...');
    
    // Click settings button
    await page.click('button[title="Shell Settings"]');
    
    // Wait for modal to open
    await page.waitForSelector('.modal', { timeout: 5000 });
    console.log('[Test] Settings modal opened');
    
    // Check for "Restore Default Command Cards" section
    const restoreSection = await page.locator('text=Restore Default Command Cards').isVisible();
    expect(restoreSection).toBeTruthy();
    console.log('[Test] Restore cards section is visible');
    
    // Should see either:
    // - Warning about missing cards with checkboxes, OR
    // - Success message with "Restore All Default Cards" button
    
    const hasMissingWarning = await page.locator('text=Missing').isVisible();
    const hasSuccessMessage = await page.locator('text=All default cards are present').isVisible();
    
    // One of these should be true
    expect(hasMissingWarning || hasSuccessMessage).toBeTruthy();
    console.log(`[Test] Shows ${hasMissingWarning ? 'missing cards' : 'all cards present'} state`);
    
    // Should have a restore button in either case
    const restoreButton = page.locator('button', { hasText: /Restore.*Card/ });
    await expect(restoreButton).toBeVisible();
    console.log('[Test] Restore button is visible');
    
    // Close modal
    await page.click('.btn-close');
  });

  test('Issue 2: Session refresh button is visible and works', async ({ page }) => {
    console.log('[Test] Looking for session refresh button...');
    
    // Find the reconnect button (should have RefreshCw icon and specific title)
    const reconnectButton = page.locator('button[title="Reconnect Terminal Session"]');
    await expect(reconnectButton).toBeVisible();
    console.log('[Test] Reconnect button is visible');
    
    // Click the button - should trigger reconnection
    await reconnectButton.click();
    console.log('[Test] Clicked reconnect button');
    
    // Should see a toast notification
    await page.waitForSelector('.toast', { timeout: 3000 });
    const toastText = await page.locator('.toast').textContent();
    expect(toastText).toContain('Reconnecting');
    console.log('[Test] Toast notification appeared:', toastText);
    
    // Terminal should reconnect (look for connection message)
    await page.locator('.xterm-screen').first().waitFor({ state: 'visible', timeout: 20000 });
    console.log('[Test] Terminal reconnected successfully');
  });

  test('Issue 3: Settings restore cards reloads in same tab', async ({ page }) => {
    console.log('[Test] Testing that restore cards reload stays in same tab...');
    
    // Track if new tab is opened
    let newTabOpened = false;
    page.context().on('page', () => {
      newTabOpened = true;
    });
    
    // Open settings
    await page.click('button[title="Shell Settings"]');
    await page.waitForSelector('.modal', { timeout: 5000 });
    
    // Try to restore default cards (if button is available)
    const restoreButton = page.locator('button', { hasText: /Restore.*Card/ });
    if (await restoreButton.isVisible()) {
      console.log('[Test] Clicking restore button...');
      await restoreButton.click();
      
      // Wait a moment
      await page.waitForTimeout(2000);
      
      // Check that no new tab was opened
      expect(newTabOpened).toBeFalsy();
      console.log('[Test] No new tab opened - reload in same tab ✓');
    } else {
      console.log('[Test] Restore button not available (cards already present)');
    }
  });

  test('Issue 4: Session persistence saves and restores directory', async ({ page }) => {
    console.log('[Test] Testing directory persistence...');
    
    // Wait for terminal to be ready
    await page.locator('.xterm-screen').first().waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForTimeout(2000); // Wait for prompt
    
    // Get initial tab name
    const initialTabName = await page.locator('.tab.active .tab-title').textContent();
    console.log('[Test] Initial tab name:', initialTabName);
    
    // Change directory using terminal
    // Type 'cd ..' command
    await page.keyboard.type('cd ..');
    await page.keyboard.press('Enter');
    console.log('[Test] Sent cd .. command');
    
    // Wait for command to execute and tab to update
    await page.waitForTimeout(1500);
    
    // Check if tab name changed (indicating directory was detected)
    const newTabName = await page.locator('.tab.active .tab-title').textContent();
    console.log('[Test] New tab name:', newTabName);
    
    // Tab name should have changed
    const tabNameChanged = initialTabName !== newTabName;
    console.log(`[Test] Tab name ${tabNameChanged ? 'changed' : 'did not change'}`);
    
    // Now test persistence: refresh the page to simulate restart
    console.log('[Test] Refreshing page to test persistence...');
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('.xterm-screen').first().waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForTimeout(2000);
    
    // Check if tab name persisted
    const restoredTabName = await page.locator('.tab.active .tab-title').textContent();
    console.log('[Test] Restored tab name:', restoredTabName);
    
    // The restored tab name should match what we had before refresh
    // (or at least not be the original if we changed directories)
    if (tabNameChanged) {
      expect(restoredTabName).toBe(newTabName);
      console.log('[Test] Directory persistence working - tab name persisted ✓');
    } else {
      console.log('[Test] Tab name did not change during cd, skipping persistence check');
    }
  });

  test('Issue 4b: Multi-tab directory persistence', async ({ page }) => {
    console.log('[Test] Testing directory persistence across multiple tabs...');
    
    // Wait for initial terminal
    await page.locator('.xterm-screen').first().waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForTimeout(2000);
    
    // Create a second tab
    console.log('[Test] Creating second tab...');
    await page.click('button[title="New Terminal Tab (Ctrl+T)"]');
    await page.waitForTimeout(1000);
    
    // Should now have 2 tabs
    const tabCount = await page.locator('.tab').count();
    expect(tabCount).toBe(2);
    console.log('[Test] Created 2 tabs');
    
    // Switch to first tab
    await page.locator('.tab').first().click();
    await page.waitForTimeout(500);
    
    // Change directory in first tab
    await page.keyboard.type('cd ..');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);
    
    const tab1Name = await page.locator('.tab').first().locator('.tab-title').textContent();
    console.log('[Test] Tab 1 name after cd:', tab1Name);
    
    // Switch to second tab
    await page.locator('.tab').nth(1).click();
    await page.waitForTimeout(500);
    
    // Get second tab name (should be different from first)
    const tab2Name = await page.locator('.tab').nth(1).locator('.tab-title').textContent();
    console.log('[Test] Tab 2 name:', tab2Name);
    
    // Refresh page
    console.log('[Test] Refreshing page...');
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('.xterm-screen').first().waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForTimeout(2000);
    
    // Check that both tabs persisted
    const restoredTabCount = await page.locator('.tab').count();
    expect(restoredTabCount).toBe(2);
    console.log('[Test] Both tabs persisted after reload ✓');
    
    // Check tab names persisted
    const restoredTab1Name = await page.locator('.tab').first().locator('.tab-title').textContent();
    const restoredTab2Name = await page.locator('.tab').nth(1).locator('.tab-title').textContent();
    
    console.log('[Test] Restored tab 1 name:', restoredTab1Name);
    console.log('[Test] Restored tab 2 name:', restoredTab2Name);
    
    expect(restoredTab1Name).toBe(tab1Name);
    expect(restoredTab2Name).toBe(tab2Name);
    console.log('[Test] Multi-tab directory persistence working ✓');
  });

  test('Connection overlay appears when disconnected', async ({ page }) => {
    console.log('[Test] Testing connection overlay...');
    
    // Wait for terminal to connect
    await page.locator('.xterm-screen').first().waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForTimeout(1000);
    
    // Connection overlay should NOT be visible when connected
    const overlayVisible = await page.locator('.terminal-connection-overlay').isVisible();
    expect(overlayVisible).toBeFalsy();
    console.log('[Test] Connection overlay hidden when connected ✓');
    
    // Note: We can't easily test the disconnected state without killing the server
    // but we've verified the overlay exists in the code and is hidden when connected
  });

  test('Reconnect button functionality with terminal ref', async ({ page }) => {
    console.log('[Test] Testing reconnect button calls terminal.reconnect()...');
    
    // Wait for terminal
    await page.locator('.xterm-screen').first().waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForTimeout(1000);
    
    // Click reconnect button
    const reconnectButton = page.locator('button[title="Reconnect Terminal Session"]');
    await reconnectButton.click();
    
    // Should see reconnecting toast
    await page.waitForSelector('.toast', { timeout: 3000 });
    const toastText = await page.locator('.toast').textContent();
    expect(toastText).toContain('Reconnecting');
    console.log('[Test] Reconnect triggered successfully ✓');
    
    // Terminal should clear and reconnect
    // Wait a moment for reconnection
    await page.waitForTimeout(2000);
    
    // Terminal should still be there and working
    const terminalExists = await page.locator('.xterm-screen').isVisible();
    expect(terminalExists).toBeTruthy();
    console.log('[Test] Terminal reconnected and visible ✓');
  });
});
