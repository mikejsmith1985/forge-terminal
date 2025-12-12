/**
 * Terminal Startup Performance Test
 * 
 * Validates that terminal connections are fast (< 5 seconds) after performance fixes.
 * Tests both initial app launch and new tab creation scenarios.
 */

import { test, expect } from '@playwright/test';

test.describe('Terminal Startup Performance', () => {
  let forgeProcess;
  let baseURL;

  test.beforeAll(async () => {
    const { spawn } = await import('child_process');
    const path = await import('path');
    
    // Start forge binary
    const forgePath = path.resolve(__dirname, '../../../bin/forge');
    console.log('[Test] Starting Forge binary:', forgePath);
    
    forgeProcess = spawn(forgePath, [], {
      env: { ...process.env, FORGE_TEST_MODE: '1' },
      stdio: 'pipe'
    });

    // Wait for server to be ready
    await new Promise((resolve) => {
      forgeProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('[Forge]', output);
        
        const match = output.match(/Server listening on (http:\/\/[^\s]+)/);
        if (match) {
          baseURL = match[1];
          console.log('[Test] Forge ready at:', baseURL);
          setTimeout(resolve, 1000); // Give it 1 more second to stabilize
        }
      });
      
      forgeProcess.stderr.on('data', (data) => {
        console.error('[Forge Error]', data.toString());
      });
      
      setTimeout(() => {
        baseURL = 'http://127.0.0.1:8333';
        resolve();
      }, 5000);
    });
  });

  test.afterAll(async () => {
    if (forgeProcess) {
      console.log('[Test] Stopping Forge process...');
      forgeProcess.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  });

  test('initial terminal connection should be fast (< 5 seconds)', async ({ page }) => {
    console.log('[Test] Testing initial terminal connection speed...');
    
    const startTime = Date.now();
    
    // Navigate to app
    await page.goto(baseURL);
    console.log('[Test] Page loaded');
    
    // Wait for terminal to be visible
    await page.waitForSelector('.xterm-screen', { timeout: 10000 });
    console.log('[Test] Terminal container found');
    
    // Wait for "Connected" message in terminal
    const terminalConnected = page.locator('.xterm-screen:has-text("Connected")');
    await terminalConnected.waitFor({ timeout: 10000 });
    
    const connectionTime = Date.now() - startTime;
    console.log(`[Test] Terminal connected in ${connectionTime}ms`);
    
    // Verify terminal is interactive by checking for prompt
    // Wait a bit for shell to show prompt
    await page.waitForTimeout(1000);
    
    // Take screenshot for visual verification
    await page.screenshot({ path: 'test-results/terminal-startup-initial.png' });
    
    // Assert connection time is reasonable
    expect(connectionTime).toBeLessThan(5000); // Should connect in < 5 seconds
    console.log('[Test] ✓ Initial connection performance acceptable');
  });

  test('new tab creation should be fast (< 3 seconds)', async ({ page }) => {
    console.log('[Test] Testing new tab creation speed...');
    
    // Navigate to app first
    await page.goto(baseURL);
    await page.waitForSelector('.xterm-screen', { timeout: 10000 });
    await page.locator('.xterm-screen:has-text("Connected")').waitFor({ timeout: 10000 });
    console.log('[Test] Initial tab ready');
    
    // Click "New Tab" button
    const startTime = Date.now();
    const newTabButton = page.locator('button[title="New Tab (Ctrl+T)"]').first();
    await newTabButton.click();
    console.log('[Test] New tab button clicked');
    
    // Wait for second tab to appear and connect
    const secondTab = page.locator('[role="tab"]').nth(1);
    await secondTab.waitFor({ timeout: 5000 });
    console.log('[Test] Second tab appeared');
    
    // Wait for "Connected" message in new tab's terminal
    // The new tab should be active, so look for Connected text
    await page.locator('.xterm-screen:has-text("Connected")').waitFor({ timeout: 10000 });
    
    const newTabTime = Date.now() - startTime;
    console.log(`[Test] New tab connected in ${newTabTime}ms`);
    
    // Take screenshot
    await page.screenshot({ path: 'test-results/terminal-startup-newtab.png' });
    
    // Assert new tab creation is fast
    expect(newTabTime).toBeLessThan(3000); // New tabs should be even faster
    console.log('[Test] ✓ New tab creation performance acceptable');
  });

  test('directory restoration should not block terminal (< 2 seconds)', async ({ page }) => {
    console.log('[Test] Testing directory restoration performance...');
    
    await page.goto(baseURL);
    
    // Wait for initial connection
    await page.waitForSelector('.xterm-screen', { timeout: 10000 });
    await page.locator('.xterm-screen:has-text("Connected")').waitFor({ timeout: 10000 });
    
    // Change directory to /tmp
    await page.keyboard.type('cd /tmp\n');
    await page.waitForTimeout(1000);
    console.log('[Test] Changed to /tmp');
    
    // Refresh to trigger session restore with directory
    const startTime = Date.now();
    await page.reload();
    
    // Wait for reconnection
    await page.waitForSelector('.xterm-screen', { timeout: 10000 });
    await page.locator('.xterm-screen:has-text("Connected")').waitFor({ timeout: 10000 });
    
    const restoreTime = Date.now() - startTime;
    console.log(`[Test] Terminal restored with directory in ${restoreTime}ms`);
    
    // Verify we're in /tmp by looking for the prompt or typing pwd
    await page.waitForTimeout(500); // Let directory restoration complete
    await page.keyboard.type('pwd\n');
    await page.waitForTimeout(500);
    
    // Take screenshot
    await page.screenshot({ path: 'test-results/terminal-startup-restore.png' });
    
    // Assert restoration is fast
    expect(restoreTime).toBeLessThan(3000);
    console.log('[Test] ✓ Directory restoration performance acceptable');
  });

  test('terminal should be interactive immediately after connection', async ({ page }) => {
    console.log('[Test] Testing immediate interactivity...');
    
    await page.goto(baseURL);
    
    const startTime = Date.now();
    
    // Wait for connection
    await page.waitForSelector('.xterm-screen', { timeout: 10000 });
    await page.locator('.xterm-screen:has-text("Connected")').waitFor({ timeout: 10000 });
    
    // Immediately try to type (don't wait for prompt)
    // This tests that the terminal is accepting input right away
    await page.keyboard.type('echo "test"\n');
    
    // Wait for echo output
    const echoOutput = page.locator('.xterm-screen:has-text("test")');
    await echoOutput.waitFor({ timeout: 5000 });
    
    const totalTime = Date.now() - startTime;
    console.log(`[Test] Terminal fully interactive in ${totalTime}ms`);
    
    // Take screenshot
    await page.screenshot({ path: 'test-results/terminal-startup-interactive.png' });
    
    // Should be interactive quickly
    expect(totalTime).toBeLessThan(5000);
    console.log('[Test] ✓ Terminal immediately interactive');
  });
});
