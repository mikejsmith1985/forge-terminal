/**
 * Session Monitor Duration Fix - v3.11.7
 * 
 * BUG: When FollowMe debugger session is interrupted and restored,
 * the duration resets to 0 and event timestamps become incorrect.
 * 
 * ROOT CAUSE: startTimeRef is not restored from localStorage,
 * causing Date.now() - startTimeRef.current to calculate from wrong base.
 * 
 * TEST: Verify that interrupted sessions preserve correct duration and timestamps.
 */

const { test, expect } = require('@playwright/test');

const DEV_SERVER_PORT = process.env.DEV_SERVER_PORT || 3005;
const BASE_URL = `http://localhost:${DEV_SERVER_PORT}`;

test.describe('Session Monitor Duration Fix', () => {
  
  test('should preserve duration when session is interrupted and restored', async ({ page }) => {
    test.setTimeout(120000); // 2 minutes for this complex test
    // Navigate to app
    await page.goto(BASE_URL);
    await page.waitForTimeout(3000); // Wait for app to load
    
    // Find and click Debug tab
    const debugTab = page.locator('button, div, span').filter({ hasText: /^Debug$/i }).first();
    await expect(debugTab).toBeVisible({ timeout: 10000 });
    await debugTab.click();
    await page.waitForTimeout(500);
    
    // Start recording
    const startButton = page.locator('[data-testid="start-recording"], button').filter({ hasText: /Start Recording/i }).first();
    await expect(startButton).toBeVisible({ timeout: 5000 });
    await startButton.click();
    
    // Grant screen capture permission (if prompt appears - skip in headless)
    await page.waitForTimeout(1000);
    
    // Verify recording started
    const imDoneButton = page.locator('[data-testid="im-done-button"]');
    await expect(imDoneButton).toBeVisible({ timeout: 5000 });
    
    // Wait for 3 seconds of recording
    await page.waitForTimeout(3000);
    
    // Verify duration is updating (should be ~3 seconds)
    const durationText = page.locator('.recording-duration').first();
    await expect(durationText).toBeVisible();
    const duration1 = await durationText.textContent();
    console.log(`[Test] Duration after 3s: ${duration1}`);
    
    // Simulate interruption by switching tabs (triggers unmount and localStorage save)
    const terminalTab = page.locator('button, div, span').filter({ hasText: /Terminal|Tab/i }).first();
    if (await terminalTab.isVisible()) {
      await terminalTab.click();
      await page.waitForTimeout(500);
      console.log('[Test] Switched away from Debug tab (simulating interruption)');
    }
    
    // Wait 2 more seconds while on different tab
    await page.waitForTimeout(2000);
    
    // Switch back to Debug tab (should restore session)
    await debugTab.click();
    await page.waitForTimeout(1000);
    
    // Verify session was restored
    const restoredBanner = page.locator('text=/Previous session interrupted/i');
    if (await restoredBanner.isVisible()) {
      console.log('[Test] ✓ Session restoration banner visible');
      
      // Click "Continue Recording" to resume
      const continueButton = page.locator('button').filter({ hasText: /Continue/i }).first();
      await continueButton.click();
      await page.waitForTimeout(500);
    }
    
    // Verify duration continued from where it left off (should be ~5 seconds total)
    await expect(durationText).toBeVisible();
    const duration2 = await durationText.textContent();
    console.log(`[Test] Duration after restoration: ${duration2}`);
    
    // Wait 2 more seconds
    await page.waitForTimeout(2000);
    
    // Stop recording
    await expect(imDoneButton).toBeVisible();
    await imDoneButton.click();
    
    // Wait for session to process
    await page.waitForTimeout(2000);
    
    // Verify session summary shows correct duration (should be ~7 seconds)
    const sessionSummary = page.locator('[data-testid="session-summary"]');
    await expect(sessionSummary).toBeVisible({ timeout: 5000 });
    
    // Get duration from summary
    const durationStat = sessionSummary.locator('.stat').filter({ hasText: /duration/i });
    const finalDuration = await durationStat.locator('.stat-value').textContent();
    console.log(`[Test] Final duration in summary: ${finalDuration}`);
    
    // Parse duration (format: "0:07" for 7 seconds or "0s" for 0 seconds)
    const parseDuration = (str) => {
      if (str.includes(':')) {
        const [min, sec] = str.split(':').map(s => parseInt(s, 10));
        return min * 60 + sec;
      }
      return parseInt(str, 10) || 0;
    };
    
    const finalSeconds = parseDuration(finalDuration);
    console.log(`[Test] Final duration in seconds: ${finalSeconds}`);
    
    // ASSERTION: Duration should be at least 5 seconds (3s + 2s before interruption + time after)
    // Allow margin for timing variance
    expect(finalSeconds).toBeGreaterThanOrEqual(5);
    expect(finalSeconds).toBeLessThanOrEqual(10); // Reasonable upper bound
    
    console.log('[Test] ✅ Duration preserved correctly through interruption');
    
    // Verify events have correct timestamps
    const copyButton = page.locator('[data-testid="copy-prompt-button"]');
    await expect(copyButton).toBeVisible();
    await copyButton.click();
    await page.waitForTimeout(500);
    
    // Get clipboard content with session data
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    console.log(`[Test] Clipboard contains ${clipboardText.length} characters`);
    
    // Parse session data from clipboard (it's in markdown format)
    expect(clipboardText).toContain('Debug Session Analysis Request');
    
    // Check that duration is not 0
    expect(clipboardText).not.toContain('Duration:** 0 seconds');
    
    // Verify User Action Timeline has timestamps
    expect(clipboardText).toContain('User Action Timeline');
    
    // Extract first event timestamp
    const timelineMatch = clipboardText.match(/\[(\d+\.\d+)s\]/);
    if (timelineMatch) {
      const firstEventTime = parseFloat(timelineMatch[1]);
      console.log(`[Test] First event timestamp: ${firstEventTime}s`);
      
      // Events should NOT all be at 0s or negative
      expect(firstEventTime).toBeGreaterThan(0);
    }
    
    console.log('[Test] ✅ All assertions passed');
  });
  
  test('should calculate correct event timestamps after restoration', async ({ page }) => {
    test.setTimeout(120000); // 2 minutes for this complex test
    // Navigate to app
    await page.goto(BASE_URL);
    await page.waitForTimeout(3000); // Wait for app to load
    
    // Find and click Debug tab
    const debugTab = page.locator('button, div, span').filter({ hasText: /^Debug$/i }).first();
    await expect(debugTab).toBeVisible({ timeout: 10000 });
    await debugTab.click();
    await page.waitForTimeout(500);
    
    // Start recording
    const startButton = page.locator('[data-testid="start-recording"], button').filter({ hasText: /Start Recording/i }).first();
    await expect(startButton).toBeVisible({ timeout: 5000 });
    await startButton.click();
    await page.waitForTimeout(1000);
    
    // Verify recording started
    const imDoneButton = page.locator('[data-testid="im-done-button"]');
    await expect(imDoneButton).toBeVisible({ timeout: 5000 });
    
    // Generate some clicks BEFORE interruption
    await page.mouse.click(100, 100);
    await page.waitForTimeout(500);
    await page.mouse.click(200, 200);
    await page.waitForTimeout(500);
    
    console.log('[Test] Generated 2 clicks before interruption');
    
    // Switch away to trigger interruption
    const terminalTab = page.locator('button, div, span').filter({ hasText: /Terminal|Tab/i }).first();
    if (await terminalTab.isVisible()) {
      await terminalTab.click();
      await page.waitForTimeout(1000);
    }
    
    // Wait, then switch back
    await page.waitForTimeout(2000);
    await debugTab.click();
    await page.waitForTimeout(1000);
    
    // Resume if needed
    const continueButton = page.locator('button').filter({ hasText: /Continue/i }).first();
    if (await continueButton.isVisible()) {
      await continueButton.click();
      await page.waitForTimeout(500);
    }
    
    // Generate clicks AFTER restoration
    await page.mouse.click(300, 300);
    await page.waitForTimeout(500);
    await page.mouse.click(400, 400);
    await page.waitForTimeout(500);
    
    console.log('[Test] Generated 2 clicks after restoration');
    
    // Stop recording
    await imDoneButton.click();
    await page.waitForTimeout(2000);
    
    // Get session data
    const copyButton = page.locator('[data-testid="copy-prompt-button"]');
    await expect(copyButton).toBeVisible();
    await copyButton.click();
    await page.waitForTimeout(500);
    
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    
    // Extract all event timestamps
    const timestamps = [];
    const regex = /\[(\d+\.\d+)s\]/g;
    let match;
    while ((match = regex.exec(clipboardText)) !== null) {
      timestamps.push(parseFloat(match[1]));
    }
    
    console.log(`[Test] Found ${timestamps.length} event timestamps:`, timestamps);
    
    // CRITICAL ASSERTION: Timestamps should be monotonically increasing
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
    }
    
    // CRITICAL ASSERTION: No negative timestamps
    timestamps.forEach(ts => {
      expect(ts).toBeGreaterThanOrEqual(0);
    });
    
    // CRITICAL ASSERTION: Timestamps should span the actual duration
    const firstTimestamp = timestamps[0];
    const lastTimestamp = timestamps[timestamps.length - 1];
    const timeSpan = lastTimestamp - firstTimestamp;
    
    console.log(`[Test] Time span from first to last event: ${timeSpan}s`);
    expect(timeSpan).toBeGreaterThan(2); // At least 2 seconds of activity
    
    console.log('[Test] ✅ Event timestamps are correct and monotonic');
  });
});
