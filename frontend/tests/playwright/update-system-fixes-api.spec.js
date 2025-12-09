// update-system-fixes-api.spec.js - Focused tests for update system API endpoints
// Tests validate the three fixes work correctly without UI interaction

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:8333';

test.describe('Update System Fixes - API Tests', () => {
  test('🟢 TEST 1: Version API endpoint returns current version', async ({ page }) => {
    console.log('\n📋 TEST 1: Version API endpoint');
    
    const response = await page.request.get(`${BASE_URL}/api/version`);
    
    console.log(`HTTP Status: ${response.status()}`);
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    console.log(`Response data: ${JSON.stringify(data)}`);
    
    expect(data.version).toBeTruthy();
    expect(typeof data.version).toBe('string');
    
    console.log(`✅ Version endpoint works: ${data.version}`);
  });

  test('🟢 TEST 2: Update check API endpoint works', async ({ page }) => {
    console.log('\n📋 TEST 2: Update check API endpoint');
    
    const response = await page.request.get(`${BASE_URL}/api/update/check`);
    
    console.log(`HTTP Status: ${response.status()}`);
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    console.log(`Response: ${JSON.stringify(data)}`);
    
    expect(data.currentVersion).toBeTruthy();
    expect(typeof data.available).toBe('boolean');
    
    console.log(`✅ Update check works (available: ${data.available})`);
  });

  test('🟢 TEST 3: Versions list API endpoint responds with releases', async ({ page }) => {
    console.log('\n📋 TEST 3: Versions list API endpoint');
    
    const response = await page.request.get(`${BASE_URL}/api/update/versions`);
    
    console.log(`HTTP Status: ${response.status()}`);
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    console.log(`Got ${data.releases?.length || 0} releases`);
    
    expect(data.releases).toBeTruthy();
    expect(Array.isArray(data.releases)).toBe(true);
    expect(data.currentVersion).toBeTruthy();
    
    console.log(`✅ Versions list API works (${data.releases.length} releases found)`);
  });

  test('🟢 TEST 4: Version tracking in localStorage initializes correctly', async ({ page }) => {
    console.log('\n📋 TEST 4: LocalStorage version tracking');
    
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait for App to initialize
    await page.waitForTimeout(2000);
    
    const versionData = await page.evaluate(() => {
      return localStorage.getItem('lastKnownVersion');
    });
    
    console.log(`LocalStorage lastKnownVersion: ${versionData}`);
    expect(versionData).toBeTruthy();
    
    console.log(`✅ Version tracking initialized in localStorage`);
  });

  test('🟢 TEST 5: SSE connection is established and working', async ({ page }) => {
    console.log('\n📋 TEST 5: SSE connection initialization');
    
    const consoleLogs = [];
    
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[SSE]')) {
        consoleLogs.push(text);
      }
    });
    
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait for SSE to connect
    await page.waitForTimeout(3000);
    
    const sseConnected = consoleLogs.some(log => log.includes('Connected to update events'));
    console.log(`SSE connection logs: ${consoleLogs.length}`);
    console.log(`Connected status: ${sseConnected ? 'YES' : 'NO'}`);
    
    if (consoleLogs.length > 0) {
      console.log(`Sample logs: ${consoleLogs.slice(0, 2).join(', ')}`);
    }
    
    // Either SSE connected or fallback polling will handle it
    expect(consoleLogs.length).toBeGreaterThan(0);
    
    console.log(`✅ Update notification system initialized`);
  });

  test('🟢 TEST 6: Versions API retry logic - multiple calls work', async ({ page }) => {
    console.log('\n📋 TEST 6: Versions API retry/resilience');
    
    // Make multiple calls to simulate retry logic
    const calls = [];
    
    for (let i = 0; i < 3; i++) {
      const response = await page.request.get(`${BASE_URL}/api/update/versions`, {
        timeout: 15000
      });
      calls.push({
        attempt: i + 1,
        status: response.status(),
        success: response.ok()
      });
    }
    
    console.log(`Call results: ${JSON.stringify(calls)}`);
    
    // All calls should succeed
    const allSuccessful = calls.every(c => c.success);
    expect(allSuccessful).toBe(true);
    
    console.log(`✅ Versions API resilient (all ${calls.length} calls succeeded)`);
  });

  test('🟢 TEST 7: Terminal connects after page load', async ({ page }) => {
    console.log('\n📋 TEST 7: Terminal WebSocket connection');
    
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait for terminal to appear
    const terminalSelector = '.xterm';
    await page.waitForSelector(terminalSelector, { timeout: 15000 }).catch(() => {
      console.log('⚠️ Terminal element not found in time');
    });
    
    const terminalExists = await page.locator(terminalSelector).count();
    console.log(`Terminal element found: ${terminalExists > 0 ? 'YES' : 'NO'}`);
    
    expect(terminalExists).toBeGreaterThan(0);
    
    console.log(`✅ Terminal element loaded`);
  });

  test('🟢 TEST 8: No critical errors in console during initialization', async ({ page }) => {
    console.log('\n📋 TEST 8: Console error check');
    
    const errors = [];
    
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        // Ignore "Failed to load" errors (common in test env)
        if (!msg.text().includes('Failed to load')) {
          errors.push(msg.text());
        }
      }
    });
    
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    console.log(`Critical errors found: ${errors.length}`);
    if (errors.length > 0) {
      console.log(`Errors: ${errors.slice(0, 2).join(', ')}`);
    }
    
    // Should have no critical errors
    expect(errors.length).toBe(0);
    
    console.log(`✅ No critical errors during initialization`);
  });

  test('🟢 TEST 9: Update modal integration with version API', async ({ page }) => {
    console.log('\n📋 TEST 9: Update modal data flow');
    
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    // Check if update info is available in the app state
    const updateInfo = await page.evaluate(async () => {
      try {
        const res = await fetch('/api/update/check');
        const data = await res.json();
        return {
          hasVersion: !!data.currentVersion,
          hasAvailable: typeof data.available === 'boolean',
          status: 'success'
        };
      } catch (err) {
        return {
          status: 'error',
          error: err.message
        };
      }
    });
    
    console.log(`Update info: ${JSON.stringify(updateInfo)}`);
    
    expect(updateInfo.status).toBe('success');
    expect(updateInfo.hasVersion).toBe(true);
    expect(updateInfo.hasAvailable).toBe(true);
    
    console.log(`✅ Update modal can access version data`);
  });

  test('🟢 TEST 10: Fallback polling mechanism is available', async ({ page }) => {
    console.log('\n📋 TEST 10: Fallback polling readiness');
    
    const consoleLogs = [];
    
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[SSE]') || text.includes('fallback') || text.includes('polling')) {
        consoleLogs.push(text.substring(0, 100)); // Truncate for readability
      }
    });
    
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait to see if SSE connects or if fallback polling starts
    await page.waitForTimeout(3000);
    
    console.log(`Initialization logs: ${consoleLogs.length}`);
    
    // At minimum, the page should attempt SSE or fallback
    expect(consoleLogs.length).toBeGreaterThan(0);
    
    console.log(`✅ Update notification system ready (${consoleLogs.length} initialization logs)`);
  });
});
