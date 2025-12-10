// am-monitor-health.spec.js - Tests for AM Monitor health display fix
// Issue: AMMonitor was showing "0/4 services" because frontend used old 5-layer metrics
// Fix: Updated frontend to use new CaptureMetrics structure (conversationsActive, inputTurnsDetected, etc.)

import { test, expect } from '@playwright/test';
import path from 'path';
import { spawn } from 'child_process';

test.describe('AM Monitor Health Display Fix', () => {
  let serverProcess;
  let baseURL;

  test.beforeAll(async () => {
    // Start the server
    const forgePath = path.join(process.cwd(), '..', 'bin', 'forge');
    
    serverProcess = spawn(forgePath, [], {
      env: { ...process.env, NO_BROWSER: '1' },
      stdio: 'pipe'
    });

    // Wait for server to start and capture the URL
    await new Promise((resolve) => {
      serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        const match = output.match(/http:\/\/(127\.0\.0\.1|localhost):\d+/);
        if (match) {
          baseURL = match[0];
          resolve();
        }
      });
      
      setTimeout(() => {
        if (!baseURL) {
          baseURL = 'http://127.0.0.1:8333';
          resolve();
        }
      }, 5000);
    });
  });

  test.afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill();
    }
  });

  test('/api/am/health returns correct structure (no layersOperational)', async ({ request }) => {
    const response = await request.get(`${baseURL}/api/am/health`);
    expect(response.status()).toBe(200);
    
    const health = await response.json();
    
    // Verify structure has new fields, not old layer fields
    expect(health).toHaveProperty('status');
    expect(['HEALTHY', 'DEGRADED', 'FAILED', 'NOT_INITIALIZED']).toContain(health.status);
    
    // Should NOT have old layer architecture fields
    if (health.metrics) {
      expect(health.metrics).not.toHaveProperty('layersOperational');
      expect(health.metrics).not.toHaveProperty('layersTotal');
      
      // Should have new capture metrics
      expect(health.metrics).toHaveProperty('conversationsActive');
      expect(health.metrics).toHaveProperty('inputTurnsDetected');
      expect(health.metrics).toHaveProperty('outputTurnsDetected');
    }
  });

  test('AM Monitor displays correctly in Dev Mode', async ({ page }) => {
    // Navigate first, then set localStorage, then refresh
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    
    // Enable Dev Mode after page loads
    await page.evaluate(() => localStorage.setItem('devMode', 'true'));
    
    // Refresh to apply the setting
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 10000 });
    
    // Wait for AM Monitor to load (it polls every 10 seconds, but should load initially)
    await page.waitForTimeout(2000);
    
    // AM Monitor should be visible in Dev Mode
    const amMonitor = page.locator('.am-monitor');
    await expect(amMonitor).toBeVisible({ timeout: 10000 });
  });

  test('AM Monitor tooltip shows correct metrics (not "0/4 services")', async ({ page }) => {
    // Navigate first, then set localStorage
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    
    // Enable Dev Mode
    await page.evaluate(() => localStorage.setItem('devMode', 'true'));
    
    // Refresh to apply the setting
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 10000 });
    await page.waitForTimeout(2000);
    
    // Find AM Monitor and check its title attribute
    const amMonitor = page.locator('.am-monitor');
    await expect(amMonitor).toBeVisible({ timeout: 10000 });
    
    const title = await amMonitor.getAttribute('title');
    
    // Title should NOT contain old "Layers: 0/4 operational" format
    expect(title).not.toContain('Layers:');
    expect(title).not.toContain('/4 operational');
    
    // Title should contain new format with "Active:", "Tracked:", "Captures:"
    expect(title).toContain('AM System:');
    expect(title).toContain('Active:');
    expect(title).toContain('Tracked:');
    expect(title).toContain('Captures:');
  });

  test('AM Monitor shows HEALTHY status when no activity yet', async ({ page }) => {
    // Navigate first, then set localStorage
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    
    // Enable Dev Mode
    await page.evaluate(() => localStorage.setItem('devMode', 'true'));
    
    // Refresh to apply the setting
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 10000 });
    await page.waitForTimeout(2000);
    
    const amMonitor = page.locator('.am-monitor');
    await expect(amMonitor).toBeVisible({ timeout: 10000 });
    
    // Should have the 'am-active' class indicating healthy status
    // or display "(0)" for 0 conversations
    const amText = await amMonitor.textContent();
    expect(amText).toContain('AM');
    
    // Either shows "HEALTHY" class or shows conversation count
    const hasActiveClass = await amMonitor.evaluate(el => el.classList.contains('am-active'));
    const hasDisabledClass = await amMonitor.evaluate(el => el.classList.contains('am-disabled'));
    
    // Should be either active (healthy) or disabled (not initialized) - NOT inactive/failed
    expect(hasActiveClass || hasDisabledClass).toBe(true);
  });

  test('AM Monitor is hidden when Dev Mode is off', async ({ page }) => {
    // Navigate first, then set localStorage
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    
    // Disable Dev Mode
    await page.evaluate(() => localStorage.setItem('devMode', 'false'));
    
    // Refresh to apply the setting
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 10000 });
    await page.waitForTimeout(2000);
    
    // AM Monitor should NOT be visible when Dev Mode is off
    const amMonitor = page.locator('.am-monitor');
    await expect(amMonitor).toHaveCount(0);
  });

  test('API returns conversationsActive metric correctly', async ({ request }) => {
    const response = await request.get(`${baseURL}/api/am/health`);
    expect(response.status()).toBe(200);
    
    const health = await response.json();
    
    if (health.metrics) {
      // conversationsActive should be a number >= 0
      expect(typeof health.metrics.conversationsActive).toBe('number');
      expect(health.metrics.conversationsActive).toBeGreaterThanOrEqual(0);
      
      // inputTurnsDetected and outputTurnsDetected should also be numbers
      expect(typeof health.metrics.inputTurnsDetected).toBe('number');
      expect(typeof health.metrics.outputTurnsDetected).toBe('number');
    }
  });
});
