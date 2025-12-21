import { test, expect } from '@playwright/test';

test('should not reload page when update is available via SSE', async ({ page }) => {
  // Mock version endpoint
  await page.route('/api/version', async route => {
    await route.fulfill({ json: { version: '1.0.0' } });
  });

  // Mock update check (initial check)
  await page.route('/api/update/check', async route => {
    await route.fulfill({ json: { available: false, currentVersion: '1.0.0' } });
  });

  // Mock SSE endpoint
  await page.route('/api/update/events', async route => {
    const headers = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    };
    // Send an update event immediately
    const updateData = JSON.stringify({
      available: true,
      latestVersion: '1.1.0',
      releaseNotes: 'Fixes stuff',
    });
    const body = `event: connected\ndata: {}\n\nevent: update\ndata: ${updateData}\n\n`;
    
    await route.fulfill({
      status: 200,
      headers,
      body,
    });
  });

  // Track reloads
  let reloadCount = 0;
  page.on('framenavigated', () => {
    console.log('Frame navigated');
    reloadCount++;
  });

  await page.goto('/');
  
  // Wait for the toast to appear (indicating the event was processed)
  // The toast text is "Update available: 1.1.0"
  // If the page reloads immediately, we might miss the toast or the test might fail/flake.
  // But if the bug is present, the reload happens almost instantly after the event.
  
  // We expect the toast to be visible.
  // If the page reloads, the toast might disappear or the test context might be lost.
  
  try {
    await expect(page.getByText('Update available: 1.1.0')).toBeVisible({ timeout: 5000 });
  } catch (e) {
    console.log('Toast not found, checking if reloaded...');
  }

  // Wait a bit to see if reload happens
  await page.waitForTimeout(3000);
  
  // Initial load = 1. Reload = 2.
  // If bug is present, reloadCount >= 2.
  // If fixed, reloadCount == 1.
  console.log('Reload count:', reloadCount);
  expect(reloadCount).toBe(1);
});
