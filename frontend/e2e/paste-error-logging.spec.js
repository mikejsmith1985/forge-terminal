/**
 * Paste Error Logging Tests
 * 
 * Tests that paste failures are captured and persisted
 * for debugging purposes.
 */

const { test, expect } = require('@playwright/test');

test.describe('Paste Error Logging', () => {
  
  test('should log paste errors to session storage', async ({ page, context }) => {
    // Arrange: Navigate to app
    await page.goto('http://localhost:3741');
    await page.waitForLoadState('networkidle');
    
    // Deny clipboard permissions to trigger paste error
    await context.grantPermissions([]);
    
    // Focus terminal
    const terminal = page.locator('.terminal');
    await terminal.click();
    await page.waitForTimeout(500);
    
    // Act: Attempt to paste (will fail due to denied permissions)
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(1000);
    
    // Assert: Error should be logged to sessionStorage
    const errorLog = await page.evaluate(() => {
      const logs = sessionStorage.getItem('paste-error-log');
      return logs ? JSON.parse(logs) : [];
    });
    
    expect(errorLog.length).toBeGreaterThan(0);
    expect(errorLog[0]).toHaveProperty('timestamp');
    expect(errorLog[0]).toHaveProperty('error');
    expect(errorLog[0]).toHaveProperty('type', 'clipboard');
    
    // Evidence
    await page.screenshot({ 
      path: 'test-results/paste-error-logged.png', 
      fullPage: true 
    });
  });

  test('should show paste error in terminal with actionable message', async ({ page, context }) => {
    // Arrange
    await page.goto('http://localhost:3741');
    await page.waitForLoadState('networkidle');
    
    await context.grantPermissions([]);
    
    const terminal = page.locator('.terminal');
    await terminal.click();
    await page.waitForTimeout(500);
    
    // Act: Try to paste
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(1000);
    
    // Assert: Terminal should show error message
    const terminalText = await page.evaluate(() => {
      return document.querySelector('.xterm-screen')?.textContent || '';
    });
    
    // Should contain actionable guidance
    expect(terminalText).toContain('Paste');
    
    // Evidence
    await page.screenshot({ 
      path: 'test-results/paste-error-terminal.png', 
      fullPage: true 
    });
  });

  test('should capture paste error in active Follow Me session', async ({ page, context }) => {
    // Arrange: Start Follow Me session
    await page.goto('http://localhost:3741');
    await page.waitForLoadState('networkidle');
    
    const debugTab = page.getByTestId('tab-debug');
    await debugTab.click();
    await page.waitForTimeout(500);
    
    const followMeButton = page.getByTestId('follow-me-button');
    await followMeButton.click();
    await page.waitForTimeout(1000);
    
    // Switch back to terminal and deny clipboard
    const terminalTab = page.getByTestId('tab-terminal');
    await terminalTab.click();
    await page.waitForTimeout(500);
    
    await context.grantPermissions([]);
    
    const terminal = page.locator('.terminal');
    await terminal.click();
    await page.waitForTimeout(500);
    
    // Act: Attempt paste (will fail)
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(1000);
    
    // Go back to Debug tab and stop recording
    await debugTab.click();
    await page.waitForTimeout(500);
    
    const imDoneButton = page.getByTestId('im-done-button');
    await imDoneButton.click();
    await page.waitForTimeout(2000);
    
    // Assert: Session should capture the paste error in console logs
    const analysisPrompt = page.getByTestId('analysis-prompt');
    await expect(analysisPrompt).toBeVisible();
    
    const promptText = await analysisPrompt.textContent();
    
    // Should mention clipboard or paste error
    expect(promptText.toLowerCase()).toMatch(/clipboard|paste|error/);
    
    // Evidence
    await page.screenshot({ 
      path: 'test-results/paste-error-in-follow-me.png', 
      fullPage: true 
    });
  });

  test('should persist paste errors across page reloads', async ({ page, context }) => {
    // Arrange: Trigger paste error
    await page.goto('http://localhost:3741');
    await page.waitForLoadState('networkidle');
    
    await context.grantPermissions([]);
    
    const terminal = page.locator('.terminal');
    await terminal.click();
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(1000);
    
    // Act: Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Assert: Error log should still exist
    const errorLog = await page.evaluate(() => {
      const logs = sessionStorage.getItem('paste-error-log');
      return logs ? JSON.parse(logs) : [];
    });
    
    // Note: sessionStorage persists across reloads in same tab
    expect(errorLog.length).toBeGreaterThan(0);
    
    // Evidence
    await page.screenshot({ 
      path: 'test-results/paste-error-persisted.png', 
      fullPage: true 
    });
  });
});
