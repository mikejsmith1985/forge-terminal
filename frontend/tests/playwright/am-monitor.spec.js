// am-monitor.spec.js - Tests for AM Monitor redesigned UI
// Validates the simplified, intuitive AM monitoring interface

import { test, expect } from '@playwright/test';

test.describe('AM Monitor UI - Simplified Redesign', () => {
  const baseURL = 'http://127.0.0.1:8333';

  test('AM Monitor should not be visible when DevMode is OFF', async ({ page }) => {
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    
    // Clear localStorage and reload to start fresh
    await page.evaluate(() => {
      localStorage.setItem('devMode', 'false');
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 15000 });
    
    // AM Monitor should NOT be visible when DevMode is off
    const amMonitor = await page.locator('.am-monitor').count();
    expect(amMonitor).toBe(0);
  });

  test('AM Monitor should be visible when DevMode is ON', async ({ page }) => {
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 15000 });
    
    // Enable DevMode via settings
    await page.click('button[title="Shell Settings"]');
    await page.waitForSelector('.modal-header', { timeout: 5000 });
    
    const devModeCheckbox = page.locator('input[name="devMode"]');
    if (!(await devModeCheckbox.isChecked())) {
      await devModeCheckbox.click();
    }
    await page.waitForTimeout(500);
    await page.press('Escape');
    
    // AM Monitor should be visible
    const amMonitor = await page.locator('.am-monitor').first();
    await expect(amMonitor).toBeVisible({ timeout: 5000 });
  });

  test('AM Monitor has correct CSS classes based on state', async ({ page }) => {
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 15000 });
    
    // Enable DevMode
    await page.click('button[title="Shell Settings"]');
    await page.waitForSelector('.modal-header', { timeout: 5000 });
    const devModeCheckbox = page.locator('input[name="devMode"]');
    if (!(await devModeCheckbox.isChecked())) {
      await devModeCheckbox.click();
    }
    await page.waitForTimeout(500);
    await page.press('Escape');
    
    // Check AM Monitor has expected class
    const amMonitor = page.locator('.am-monitor').first();
    await expect(amMonitor).toBeVisible({ timeout: 5000 });
    
    // Should have one of these state classes
    const classes = await amMonitor.getAttribute('class');
    expect(classes).toMatch(/am-(active|disabled|recording|loading)/);
  });

  test('AM Monitor tooltip provides helpful information', async ({ page }) => {
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 15000 });
    
    // Enable DevMode
    await page.click('button[title="Shell Settings"]');
    await page.waitForSelector('.modal-header', { timeout: 5000 });
    const devModeCheckbox = page.locator('input[name="devMode"]');
    if (!(await devModeCheckbox.isChecked())) {
      await devModeCheckbox.click();
    }
    await page.waitForTimeout(500);
    await page.press('Escape');
    
    // Check AM Monitor has a title attribute (tooltip)
    const amMonitor = page.locator('.am-monitor').first();
    await expect(amMonitor).toBeVisible({ timeout: 5000 });
    
    const tooltip = await amMonitor.getAttribute('title');
    expect(tooltip).not.toBeNull();
    expect(tooltip.length).toBeGreaterThan(10);
    
    // Tooltip should contain helpful info about logging state
    expect(tooltip.toLowerCase()).toMatch(/log|conversation|ready|off|recording/);
  });

  test('AM Monitor icon changes based on state', async ({ page }) => {
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 15000 });
    
    // Enable DevMode
    await page.click('button[title="Shell Settings"]');
    await page.waitForSelector('.modal-header', { timeout: 5000 });
    const devModeCheckbox = page.locator('input[name="devMode"]');
    if (!(await devModeCheckbox.isChecked())) {
      await devModeCheckbox.click();
    }
    await page.waitForTimeout(500);
    await page.press('Escape');
    
    // Check AM Monitor has an SVG icon
    const amMonitor = page.locator('.am-monitor').first();
    await expect(amMonitor).toBeVisible({ timeout: 5000 });
    
    const svgIcon = amMonitor.locator('svg');
    await expect(svgIcon).toBeVisible();
  });

  test('AM Monitor does not show confusing technical metrics', async ({ page }) => {
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 15000 });
    
    // Enable DevMode
    await page.click('button[title="Shell Settings"]');
    await page.waitForSelector('.modal-header', { timeout: 5000 });
    const devModeCheckbox = page.locator('input[name="devMode"]');
    if (!(await devModeCheckbox.isChecked())) {
      await devModeCheckbox.click();
    }
    await page.waitForTimeout(500);
    await page.press('Escape');
    
    // Wait for AM Monitor
    const amMonitor = page.locator('.am-monitor').first();
    await expect(amMonitor).toBeVisible({ timeout: 5000 });
    
    // Check the displayed text does NOT contain confusing technical metrics
    const text = await amMonitor.textContent();
    
    // Should NOT have these confusing patterns
    expect(text).not.toMatch(/snapshots/i);
    expect(text).not.toMatch(/\d+\s*tracked/i);
    expect(text).not.toMatch(/\d+\s*KB/i);
    expect(text).not.toMatch(/\d+\s*bytes/i);
    expect(text).not.toMatch(/HEALTHY/i);  // Technical status
    expect(text).not.toMatch(/DEGRADED/i);
  });

  test('AM Monitor shows simple, intuitive labels', async ({ page }) => {
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 15000 });
    
    // Enable DevMode
    await page.click('button[title="Shell Settings"]');
    await page.waitForSelector('.modal-header', { timeout: 5000 });
    const devModeCheckbox = page.locator('input[name="devMode"]');
    if (!(await devModeCheckbox.isChecked())) {
      await devModeCheckbox.click();
    }
    await page.waitForTimeout(500);
    await page.press('Escape');
    
    // Wait for AM Monitor
    const amMonitor = page.locator('.am-monitor').first();
    await expect(amMonitor).toBeVisible({ timeout: 5000 });
    
    // Check the displayed text is simple and intuitive
    const text = await amMonitor.textContent();
    
    // Should have one of these simple labels
    const validLabels = [
      /log on/i,
      /log off/i,
      /\d+ logs?/i,  // "1 log" or "3 logs"
      /recording/i,
      /am/i,         // Simple "AM" label
    ];
    
    expect(validLabels.some(pattern => pattern.test(text))).toBe(true);
  });

  test('AM Monitor has recording animation CSS available', async ({ page }) => {
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 15000 });
    
    // Enable DevMode
    await page.click('button[title="Shell Settings"]');
    await page.waitForSelector('.modal-header', { timeout: 5000 });
    const devModeCheckbox = page.locator('input[name="devMode"]');
    if (!(await devModeCheckbox.isChecked())) {
      await devModeCheckbox.click();
    }
    await page.waitForTimeout(500);
    await page.press('Escape');
    
    // Check that the recording animation CSS exists in the stylesheet
    const hasRecordingAnimation = await page.evaluate(() => {
      const sheets = document.styleSheets;
      for (let i = 0; i < sheets.length; i++) {
        try {
          const rules = sheets[i].cssRules;
          for (let j = 0; j < rules.length; j++) {
            if (rules[j].name === 'pulse-recording') {
              return true;
            }
          }
        } catch (e) {
          // Cross-origin stylesheets can't be read
        }
      }
      return false;
    });
    
    expect(hasRecordingAnimation).toBe(true);
  });
});
