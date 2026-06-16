/**
 * E2E Test: Follow Me Recording Timer
 *
 * v3.12.13: Validates that the recording timer updates correctly and survives tab switches
 */

const { test, expect } = require('../fixtures/forge')

test.describe('Follow Me Recording Timer', () => {
  test.beforeEach(async ({ page }) => {
    // Start Forge Terminal
    await page.goto('http://localhost:3005');

    // Wait for app to load
    await page.waitForTimeout(2000);

    // Dismiss tour if present
    const tourClose = page.locator('.tour-tooltip-close');
    if (await tourClose.count() > 0) {
      await tourClose.click();
    }
    await page.waitForTimeout(500);

    await expect(page.locator('.terminal-wrapper:not(.hidden) .terminal-inner')).toBeVisible({ timeout: 15000 });
  });

  test('timer should increment from 0:00', async ({ page }) => {
    // Navigate to Web Tools tab (which contains the debugger)
    await page.locator('button').filter({ hasText: 'Web Tools' }).click({ force: true });
    await page.waitForTimeout(500);

    // Wait for WebAppDebuggerCard to appear (contains Follow Me)
    await expect(page.locator('.web-app-debugger-card')).toBeVisible({ timeout: 5000 });

    // Wait for Follow Me button
    await expect(page.locator('[data-testid="follow-me-button"]')).toBeVisible({ timeout: 5000 });

    // Click Follow Me with force to bypass any overlays
    await page.locator('[data-testid="follow-me-button"]').click({ force: true });

    // Wait for recording to start
    await expect(page.locator('[data-testid="recording-indicator"]')).toBeVisible({ timeout: 5000 });

    // Take immediate screenshot
    await page.screenshot({ path: 'screenshots/timer-after-click.png' });

    // Get initial timer value
    const initialTimer = await page.locator('.recording-duration').innerText();
    console.log('Initial timer:', initialTimer);

    // Should be 0:00 or 0:01
    expect(initialTimer).toMatch(/0:0[0-2]/);

    // Wait 4 seconds (a bit longer to ensure ticks)
    await page.waitForTimeout(4000);

    // Take screenshot after wait
    await page.screenshot({ path: 'screenshots/timer-after-4-seconds.png' });

    // Timer should have incremented
    const updatedTimer = await page.locator('.recording-duration').innerText();
    console.log('Updated timer:', updatedTimer);
    // Timer should now be 0:03 to 0:06 (4 seconds + some slack)
    expect(updatedTimer).toMatch(/0:0[3-6]/);

    // Take final screenshot
    await page.screenshot({ path: 'screenshots/follow-me-timer-running.png' });

    // Stop recording
    await page.locator('[data-testid="im-done-button"]').click({ force: true });
  });

  test('timer should survive tab switches', async ({ page }) => {
    // Navigate to Web Tools tab
    await page.locator('button').filter({ hasText: 'Web Tools' }).click();
    await page.waitForTimeout(500);
    await expect(page.locator('.web-app-debugger-card')).toBeVisible({ timeout: 5000 });

    // Start Follow Me
    await page.locator('[data-testid="follow-me-button"]').click();
    await expect(page.locator('[data-testid="recording-indicator"]')).toBeVisible();

    // Wait for timer to reach ~5 seconds
    await page.waitForTimeout(5000);

    // Get timer value before switch
    const timerBefore = await page.locator('.recording-duration').innerText();
    console.log('Timer before switch:', timerBefore);
    const secondsBefore = parseInt(timerBefore.split(':')[1]);

    // Switch away to Files tab
    await page.locator('button').filter({ hasText: 'Files' }).click();
    await page.waitForTimeout(2000);

    // Switch back to Web Tools tab
    await page.locator('button').filter({ hasText: 'Web Tools' }).click();

    // Wait for component to remount
    await expect(page.locator('[data-testid="recording-indicator"]')).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(1000);

    // Timer should show continued time
    const timerAfter = await page.locator('.recording-duration').innerText();
    console.log('Timer after switch:', timerAfter);
    const secondsAfter = parseInt(timerAfter.split(':')[1]);

    // Timer should have continued (allow 2s tolerance for switch time)
    expect(secondsAfter).toBeGreaterThanOrEqual(secondsBefore + 1);
    expect(secondsAfter).toBeLessThanOrEqual(secondsBefore + 5);

    // Take screenshot
    await page.screenshot({ path: 'screenshots/follow-me-timer-after-switch.png' });

    // Stop recording
    await page.locator('[data-testid="im-done-button"]').click();
  });
});
