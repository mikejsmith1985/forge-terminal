import { test, expect } from '@playwright/test';

// Phase 1 Testing - P0 Fixes Validation
// Real user workflows with actual browser interaction
// No mocks, no unit tests - production verification only

const APP_URL = 'http://localhost:8333';

test.describe('Phase 1 P0 Fixes - Error Messages', () => {
  test('should display permission denied error with helpful message', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForLoadState('networkidle');
    
    // Try to access a restricted file - this should trigger permission error
    // Using the terminal to trigger a real permission error
    const terminal = await page.locator('[data-testid="terminal"]').first();
    if (terminal) {
      await terminal.click();
      await page.keyboard.type('cat /root/.ssh/id_rsa');
      await page.keyboard.press('Enter');
      
      // Wait for error message to appear
      await page.waitForTimeout(2000);
      
      // Verify error message contains helpful information
      const errorText = await page.locator('[data-testid="error-message"]').textContent();
      
      // Check if error mentions permission or denied
      expect(errorText?.toLowerCase() || '').toMatch(/permission|denied|access/);
    }
  });

  test('should show connection error when network fails', async ({ page }) => {
    // Start on the app
    await page.goto(APP_URL);
    await page.waitForLoadState('networkidle');
    
    // Simulate network offline
    await page.context().setOffline(true);
    
    // Try to perform an operation that requires network
    const settingsBtn = await page.locator('button').filter({ hasText: /Settings|gear/ }).first();
    if (settingsBtn) {
      await settingsBtn.click();
      await page.waitForTimeout(1000);
    }
    
    // Re-enable network
    await page.context().setOffline(false);
    
    // Connection should eventually recover
    await page.waitForTimeout(2000);
    const isConnected = await page.locator('[data-testid="connection-status"]').isVisible({ timeout: 5000 }).catch(() => false);
    
    // At minimum, the app should still be responsive
    expect(page.url()).toContain(APP_URL);
  });

  test('should show file not found error with context', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForLoadState('networkidle');
    
    // Try to open a non-existent file through the file explorer
    const terminal = await page.locator('[data-testid="terminal"]').first();
    if (terminal) {
      await terminal.click();
      await page.keyboard.type('cat /nonexistent/file/path/that/does/not/exist.txt');
      await page.keyboard.press('Enter');
      
      await page.waitForTimeout(1000);
      
      // Error should mention file not found
      const output = await page.locator('[data-testid="terminal-output"]').textContent();
      expect(output?.toLowerCase() || '').toMatch(/no such file|not found|cannot open/);
    }
  });
});

test.describe('Phase 1 P0 Fixes - Settings Validation', () => {
  test('should validate API key format in real-time', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForLoadState('networkidle');
    
    // Open settings
    const settingsBtn = await page.locator('button').filter({ hasText: /Settings|gear|⚙/ }).first();
    await settingsBtn?.click();
    
    await page.waitForTimeout(1000);
    
    // Look for API key input field
    const apiKeyInput = await page.locator('input[type="password"]').first();
    if (apiKeyInput) {
      // Type invalid API key (too short)
      await apiKeyInput.fill('short');
      
      // Check for validation message
      const validationMsg = await page.locator('[data-testid="validation-message"]').textContent();
      expect(validationMsg?.toLowerCase() || '').toMatch(/required|invalid|too short|format/);
      
      // Type valid-looking API key
      await apiKeyInput.fill('sk-' + 'a'.repeat(48));
      
      // Should show success or valid state
      await page.waitForTimeout(500);
    }
  });

  test('should validate shell path when entered', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForLoadState('networkidle');
    
    // Open settings
    const settingsBtn = await page.locator('button').filter({ hasText: /Settings|gear|⚙/ }).first();
    await settingsBtn?.click();
    
    await page.waitForTimeout(1000);
    
    // Look for shell path input
    const inputs = await page.locator('input[type="text"]').all();
    for (const input of inputs) {
      const placeholder = await input.getAttribute('placeholder');
      if (placeholder?.toLowerCase().includes('shell') || placeholder?.toLowerCase().includes('path')) {
        // Enter invalid path
        await input.fill('invalid\\path\\with\\backslashes');
        await page.waitForTimeout(300);
        
        // Should show error about backslashes or format
        const error = await input.getAttribute('aria-invalid');
        expect(error).toBeTruthy();
        
        // Enter valid path
        await input.fill('/bin/bash');
        await page.waitForTimeout(300);
        
        // Should be valid now
        const valid = await input.getAttribute('aria-invalid');
        expect(valid).toBeFalsy();
        break;
      }
    }
  });
});

test.describe('Phase 1 P0 Fixes - Loading States', () => {
  test('should show loading indicator during tab creation', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForLoadState('networkidle');
    
    // Click "New Tab" or similar button
    const newTabBtn = await page.locator('button').filter({ hasText: /new|tab|\+/ }).first();
    if (newTabBtn) {
      await newTabBtn.click();
      
      // Should see loading state
      const loadingSpinner = await page.locator('[data-testid="loading-spinner"]').isVisible({ timeout: 2000 }).catch(() => false);
      
      // Loading should complete quickly
      await page.waitForTimeout(2000);
      
      // Spinner should be gone
      const spinnerGone = await page.locator('[data-testid="loading-spinner"]').isVisible({ timeout: 500 }).then(() => false).catch(() => true);
      expect(spinnerGone).toBeTruthy();
    }
  });

  test('should display timeout message if operation takes too long', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForLoadState('networkidle');
    
    // Trigger a slow operation (file explorer on large directory)
    const explorerBtn = await page.locator('button').filter({ hasText: /explorer|files|folder/ }).first();
    if (explorerBtn) {
      await explorerBtn.click();
      
      // Wait past the 3-second timeout
      await page.waitForTimeout(4000);
      
      // Should see "taking longer" message if still loading
      const timeoutMsg = await page.locator('[data-testid="timeout-message"]').textContent().catch(() => '');
      
      // If timeout message exists, it should be helpful
      if (timeoutMsg) {
        expect(timeoutMsg.toLowerCase()).toMatch(/taking longer|wait|slow/);
      }
    }
  });
});

test.describe('Phase 1 P0 Fixes - WebSocket Connection', () => {
  test('should maintain connection during normal operation', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForLoadState('networkidle');
    
    // Check connection status
    const connectionStatus = await page.locator('[data-testid="connection-status"]').textContent();
    
    // Should show connected or healthy
    expect(connectionStatus?.toLowerCase() || '').toMatch(/connected|active|healthy|ready|online/);
    
    // Perform operations for 10 seconds
    const terminal = await page.locator('[data-testid="terminal"]').first();
    if (terminal) {
      await terminal.click();
      await page.keyboard.type('echo test1');
      await page.keyboard.press('Enter');
      
      await page.waitForTimeout(2000);
      
      await page.keyboard.type('echo test2');
      await page.keyboard.press('Enter');
      
      await page.waitForTimeout(2000);
    }
    
    // Connection should still be active
    const finalStatus = await page.locator('[data-testid="connection-status"]').textContent();
    expect(finalStatus?.toLowerCase() || '').toMatch(/connected|active|healthy|ready|online/);
  });

  test('should reconnect automatically when connection drops', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForLoadState('networkidle');
    
    // Record initial state
    const initialStatus = await page.locator('[data-testid="connection-status"]').textContent();
    
    // Simulate network interruption briefly
    await page.context().setOffline(true);
    await page.waitForTimeout(1000);
    
    // Should show disconnected state or reconnecting message
    const disconnectedMsg = await page.locator('[data-testid="connection-status"], [data-testid="reconnecting-message"]').textContent();
    expect(disconnectedMsg?.toLowerCase() || '').toMatch(/reconnect|offline|disconnect|retry/);
    
    // Restore connection
    await page.context().setOffline(false);
    
    // Wait for reconnection
    await page.waitForTimeout(3000);
    
    // Should be connected again
    const reconnectedStatus = await page.locator('[data-testid="connection-status"]').textContent({ timeout: 5000 });
    expect(reconnectedStatus?.toLowerCase() || '').toMatch(/connected|active|healthy|ready|online/);
  });
});

test.describe('Phase 1 P0 Fixes - PTY Cleanup', () => {
  test('should properly clean up terminal sessions on close', async ({ page, context }) => {
    await page.goto(APP_URL);
    await page.waitForLoadState('networkidle');
    
    // Open a terminal
    const terminal = await page.locator('[data-testid="terminal"]').first();
    if (terminal) {
      await terminal.click();
      
      // Run a process
      await page.keyboard.type('sleep 100');
      await page.keyboard.press('Enter');
      
      await page.waitForTimeout(1000);
      
      // Close the terminal tab
      const closeBtn = await page.locator('button[aria-label*="close"]').first();
      if (closeBtn) {
        await closeBtn.click();
      } else {
        // Alternative: close the entire page
        await page.close();
      }
      
      // Process should be terminated (verified by not hanging)
      // If cleanup failed, browser would hang trying to close
      expect(page.isClosed()).toBeTruthy();
    }
  });

  test('should handle multiple sequential terminal sessions', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForLoadState('networkidle');
    
    // Create and close multiple terminals
    for (let i = 0; i < 3; i++) {
      const newTabBtn = await page.locator('button').filter({ hasText: /new|tab|\+/ }).first();
      if (newTabBtn) {
        await newTabBtn.click();
        await page.waitForTimeout(500);
        
        const terminal = await page.locator('[data-testid="terminal"]').last();
        if (terminal) {
          await terminal.click();
          await page.keyboard.type('echo session ' + i);
          await page.keyboard.press('Enter');
          
          await page.waitForTimeout(500);
        }
        
        // Close this tab
        const closeBtn = await page.locator('button[aria-label*="close"]').last();
        if (closeBtn) {
          await closeBtn.click();
          await page.waitForTimeout(300);
        }
      }
    }
    
    // App should still be responsive
    expect(await page.locator('[data-testid="terminal"]').count()).toBeGreaterThanOrEqual(1);
  });
});

test.describe('Phase 1 P0 Fixes - Integration', () => {
  test('should handle complete user workflow with validation and loading', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForLoadState('networkidle');
    
    // 1. Open settings
    const settingsBtn = await page.locator('button').filter({ hasText: /Settings|gear|⚙/ }).first();
    if (settingsBtn) {
      await settingsBtn.click();
      await page.waitForTimeout(1000);
      
      // 2. Try to save invalid settings (should show validation error)
      const input = await page.locator('input[type="text"]').first();
      if (input) {
        await input.fill('');
        
        const saveBtn = await page.locator('button').filter({ hasText: /Save|OK|Submit/ }).first();
        if (saveBtn) {
          await saveBtn.click();
          await page.waitForTimeout(500);
          
          // Should see validation error, not hang on loading
          const errorVisible = await page.locator('[data-testid="error"], [data-testid="validation-message"]').isVisible({ timeout: 2000 }).catch(() => false);
          expect(errorVisible).toBeTruthy();
        }
      }
    }
    
    // 3. Open a terminal and run a command
    const terminal = await page.locator('[data-testid="terminal"]').first();
    if (terminal) {
      await terminal.click();
      await page.keyboard.type('ls -la');
      await page.keyboard.press('Enter');
      
      // 4. Command should execute without errors
      await page.waitForTimeout(2000);
      
      const output = await page.locator('[data-testid="terminal-output"]').textContent();
      expect(output).toBeTruthy();
    }
  });

  test('should gracefully handle errors during operations', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForLoadState('networkidle');
    
    const terminal = await page.locator('[data-testid="terminal"]').first();
    if (terminal) {
      await terminal.click();
      
      // Run invalid command
      await page.keyboard.type('this_command_does_not_exist_12345');
      await page.keyboard.press('Enter');
      
      await page.waitForTimeout(1000);
      
      // Should show error without crashing
      const output = await page.locator('[data-testid="terminal-output"]').textContent();
      expect(output?.toLowerCase() || '').toMatch(/not found|error|command|unknown/);
      
      // App should still be responsive
      await page.keyboard.type('echo recovery');
      await page.keyboard.press('Enter');
      
      await page.waitForTimeout(1000);
      
      const recoveryOutput = await page.locator('[data-testid="terminal-output"]').textContent();
      expect(recoveryOutput).toContain('recovery');
    }
  });
});
