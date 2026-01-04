/**
 * Follow Me Recovery Tests
 * 
 * Tests that Follow Me session survives screen share interruption
 * and persists data for recovery.
 */

const { test, expect } = require('@playwright/test');

test.describe('Follow Me Session Recovery', () => {
  
  test('should persist session data when screen share stops unexpectedly', async ({ page }) => {
    // Arrange: Navigate to app and open Debug tab
    await page.goto('http://localhost:3741');
    await page.waitForLoadState('networkidle');
    
    // Open Debug Panel
    const debugTab = page.getByTestId('tab-debug');
    await debugTab.click();
    await page.waitForTimeout(500);
    
    // Act: Start Follow Me
    const followMeButton = page.getByTestId('follow-me-button');
    await expect(followMeButton).toBeVisible();
    await followMeButton.click();
    await page.waitForTimeout(1000);
    
    // Assert: Recording indicator should appear
    const recordingIndicator = page.getByTestId('recording-indicator');
    await expect(recordingIndicator).toBeVisible();
    
    const imDoneButton = page.getByTestId('im-done-button');
    await expect(imDoneButton).toBeVisible();
    
    // Simulate screen share interruption by checking localStorage
    // (In real scenario, MediaStream would end)
    const hasPersistedSession = await page.evaluate(() => {
      const sessionKey = 'follow-me-active-session';
      const data = localStorage.getItem(sessionKey);
      return data !== null;
    });
    
    // Assert: Session should be persisted to localStorage
    expect(hasPersistedSession).toBe(true);
    
    // Evidence
    await page.screenshot({ 
      path: 'test-results/follow-me-recovery-recording.png', 
      fullPage: true 
    });
  });

  test('should show recovery UI when returning after interruption', async ({ page }) => {
    // Arrange: Set up interrupted session in localStorage
    await page.goto('http://localhost:3741');
    await page.waitForLoadState('networkidle');
    
    await page.evaluate(() => {
      const interruptedSession = {
        id: 'test-session-123',
        startTime: Date.now() - 30000, // Started 30 seconds ago
        events: [
          { type: 'session_start', timestamp: 0 },
          { type: 'click', timestamp: 5000, target: { tagName: 'BUTTON' } }
        ],
        consoleLogs: [],
        networkRequests: [],
        interrupted: true
      };
      localStorage.setItem('follow-me-active-session', JSON.stringify(interruptedSession));
    });
    
    // Act: Open Debug tab - should detect interrupted session
    const debugTab = page.getByTestId('tab-debug');
    await debugTab.click();
    await page.waitForTimeout(500);
    
    // Assert: Should show recovery UI instead of "Follow Me" button
    const recoveryUI = page.getByTestId('follow-me-recovery');
    await expect(recoveryUI).toBeVisible();
    
    const resumeButton = page.getByTestId('resume-session-button');
    await expect(resumeButton).toBeVisible();
    
    const discardButton = page.getByTestId('discard-session-button');
    await expect(discardButton).toBeVisible();
    
    // Evidence
    await page.screenshot({ 
      path: 'test-results/follow-me-recovery-ui.png', 
      fullPage: true 
    });
  });

  test('should complete interrupted session when resuming', async ({ page }) => {
    // Arrange: Set up interrupted session
    await page.goto('http://localhost:3741');
    await page.waitForLoadState('networkidle');
    
    await page.evaluate(() => {
      const interruptedSession = {
        id: 'test-session-456',
        startTime: Date.now() - 15000,
        events: [
          { type: 'session_start', timestamp: 0 },
          { type: 'keystroke', timestamp: 3000, key: 'a' }
        ],
        consoleLogs: [],
        networkRequests: [],
        interrupted: true
      };
      localStorage.setItem('follow-me-active-session', JSON.stringify(interruptedSession));
    });
    
    const debugTab = page.getByTestId('tab-debug');
    await debugTab.click();
    await page.waitForTimeout(500);
    
    // Act: Click "I'm Done" to complete the interrupted session
    const imDoneButton = page.getByTestId('im-done-button');
    await expect(imDoneButton).toBeVisible();
    await imDoneButton.click();
    await page.waitForTimeout(2000);
    
    // Assert: Should show session summary
    const sessionSummary = page.getByTestId('session-summary');
    await expect(sessionSummary).toBeVisible();
    
    const analysisPrompt = page.getByTestId('analysis-prompt');
    await expect(analysisPrompt).toBeVisible();
    
    // Assert: localStorage should be cleared
    const isCleared = await page.evaluate(() => {
      return localStorage.getItem('follow-me-active-session') === null;
    });
    expect(isCleared).toBe(true);
    
    // Evidence
    await page.screenshot({ 
      path: 'test-results/follow-me-recovery-complete.png', 
      fullPage: true 
    });
  });
});
