// devmode.spec.js - Tests for DevMode feature
// Verifies that DevMode toggle hides/shows File Explorer feature
// Ensures localStorage persistence across page refreshes

import { test, expect } from '@playwright/test';
import path from 'path';
import { spawn } from 'child_process';

test.describe('DevMode Feature - Hide/Show File Explorer', () => {
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

  test('File Explorer tab should be hidden by default (DevMode off)', async ({ page }) => {
    // Clear localStorage to start fresh
    await page.evaluate(() => localStorage.clear());
    
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 10000 });
    
    // Look for Files tab - should NOT be visible when DevMode is off
    const filesTabs = await page.locator('button:has-text("Files")').count();
    expect(filesTabs).toBe(0);
  });

  test('Settings modal should have DevMode toggle', async ({ page }) => {
    // Clear localStorage
    await page.evaluate(() => localStorage.clear());
    
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 10000 });
    
    // Click settings gear icon
    await page.click('button[title="Shell Settings"]');
    
    // Wait for modal to appear
    await page.waitForSelector('.modal-header', { timeout: 5000 });
    
    // Check for DevMode toggle in settings
    const devModeToggle = await page.locator('label:has-text("Dev Mode")').count();
    expect(devModeToggle).toBeGreaterThan(0);
  });

  test('DevMode toggle should be a checkbox input', async ({ page }) => {
    // Clear localStorage
    await page.evaluate(() => localStorage.clear());
    
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 10000 });
    
    // Open settings
    await page.click('button[title="Shell Settings"]');
    await page.waitForSelector('.modal-header', { timeout: 5000 });
    
    // Find DevMode checkbox
    const devModeCheckbox = await page.locator('input[type="checkbox"]').filter({
      hasText: 'Dev Mode'
    }).count();
    
    // Should have at least one checkbox (the DevMode one)
    expect(devModeCheckbox).toBeGreaterThan(0);
  });

  test('Toggling DevMode ON should show Files tab', async ({ page }) => {
    // Clear localStorage
    await page.evaluate(() => localStorage.clear());
    
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 10000 });
    
    // Files tab should NOT exist initially
    let filesTabs = await page.locator('button:has-text("Files")').count();
    expect(filesTabs).toBe(0);
    
    // Open settings
    await page.click('button[title="Shell Settings"]');
    await page.waitForSelector('.modal-header', { timeout: 5000 });
    
    // Find and click DevMode checkbox
    const devModeCheckbox = page.locator('input[name="devMode"]');
    await devModeCheckbox.click();
    
    // Wait a moment for state update
    await page.waitForTimeout(500);
    
    // Files tab should now exist
    filesTabs = await page.locator('button:has-text("Files")').count();
    expect(filesTabs).toBeGreaterThan(0);
  });

  test('DevMode preference should persist in localStorage', async ({ page }) => {
    // Clear localStorage
    await page.evaluate(() => localStorage.clear());
    
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 10000 });
    
    // Enable DevMode
    await page.click('button[title="Shell Settings"]');
    await page.waitForSelector('.modal-header', { timeout: 5000 });
    
    const devModeCheckbox = page.locator('input[name="devMode"]');
    await devModeCheckbox.click();
    await page.waitForTimeout(500);
    
    // Check localStorage directly
    const devModeValue = await page.evaluate(() => {
      return localStorage.getItem('devMode');
    });
    
    expect(devModeValue).toBe('true');
  });

  test('DevMode setting should survive page refresh', async ({ page }) => {
    // Clear and set DevMode to true
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 10000 });
    
    // Set DevMode on
    await page.click('button[title="Shell Settings"]');
    await page.waitForSelector('.modal-header', { timeout: 5000 });
    const devModeCheckbox = page.locator('input[name="devMode"]');
    await devModeCheckbox.click();
    await page.waitForTimeout(500);
    
    // Files tab should exist
    let filesTabs = await page.locator('button:has-text("Files")').count();
    expect(filesTabs).toBeGreaterThan(0);
    
    // Refresh page
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 10000 });
    
    // Files tab should STILL exist after refresh
    filesTabs = await page.locator('button:has-text("Files")').count();
    expect(filesTabs).toBeGreaterThan(0);
  });

  test('Toggling DevMode OFF should hide Files tab', async ({ page }) => {
    // Set DevMode on first
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 10000 });
    
    await page.click('button[title="Shell Settings"]');
    await page.waitForSelector('.modal-header', { timeout: 5000 });
    const devModeCheckbox = page.locator('input[name="devMode"]');
    await devModeCheckbox.click();
    await page.waitForTimeout(500);
    
    // Files tab should exist
    let filesTabs = await page.locator('button:has-text("Files")').count();
    expect(filesTabs).toBeGreaterThan(0);
    
    // Close and reopen settings
    await page.press('Escape');
    await page.waitForTimeout(300);
    
    await page.click('button[title="Shell Settings"]');
    await page.waitForSelector('.modal-header', { timeout: 5000 });
    
    // Click checkbox again to turn OFF DevMode
    await devModeCheckbox.click();
    await page.waitForTimeout(500);
    
    // Files tab should be gone
    filesTabs = await page.locator('button:has-text("Files")').count();
    expect(filesTabs).toBe(0);
  });

  test('Clearing localStorage should reset DevMode to off', async ({ page }) => {
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 10000 });
    
    // Enable DevMode
    await page.click('button[title="Shell Settings"]');
    await page.waitForSelector('.modal-header', { timeout: 5000 });
    const devModeCheckbox = page.locator('input[name="devMode"]');
    await devModeCheckbox.click();
    await page.waitForTimeout(500);
    
    // Verify Files tab exists
    let filesTabs = await page.locator('button:has-text("Files")').count();
    expect(filesTabs).toBeGreaterThan(0);
    
    // Clear localStorage
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 10000 });
    
    // Files tab should be hidden again
    filesTabs = await page.locator('button:has-text("Files")').count();
    expect(filesTabs).toBe(0);
  });

  test('DevMode checkbox should reflect current state in settings modal', async ({ page }) => {
    // Clear and enable DevMode
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 10000 });
    
    await page.click('button[title="Shell Settings"]');
    await page.waitForSelector('.modal-header', { timeout: 5000 });
    const devModeCheckbox = page.locator('input[name="devMode"]');
    
    // Initially should be unchecked
    let isChecked = await devModeCheckbox.isChecked();
    expect(isChecked).toBe(false);
    
    // Click to enable
    await devModeCheckbox.click();
    await page.waitForTimeout(300);
    
    // Should now be checked
    isChecked = await devModeCheckbox.isChecked();
    expect(isChecked).toBe(true);
    
    // Close and reopen settings
    await page.press('Escape');
    await page.waitForTimeout(300);
    
    await page.click('button[title="Shell Settings"]');
    await page.waitForSelector('.modal-header', { timeout: 5000 });
    
    // Should still be checked
    isChecked = await page.locator('input[name="devMode"]').isChecked();
    expect(isChecked).toBe(true);
  });

  test('DevMode should only affect File Explorer visibility', async ({ page }) => {
    // Clear localStorage
    await page.evaluate(() => localStorage.clear());
    
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 10000 });
    
    // Verify Cards tab is ALWAYS visible (not affected by DevMode)
    let cardsTabs = await page.locator('button:has-text("Cards")').count();
    expect(cardsTabs).toBeGreaterThan(0);
    
    // Enable DevMode
    await page.click('button[title="Shell Settings"]');
    await page.waitForSelector('.modal-header', { timeout: 5000 });
    await page.locator('input[name="devMode"]').click();
    await page.waitForTimeout(500);
    
    // Cards tab should STILL be visible
    cardsTabs = await page.locator('button:has-text("Cards")').count();
    expect(cardsTabs).toBeGreaterThan(0);
  });

  test('Files tab should appear after Commands tab when enabled', async ({ page }) => {
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 10000 });
    
    // Enable DevMode
    await page.click('button[title="Shell Settings"]');
    await page.waitForSelector('.modal-header', { timeout: 5000 });
    await page.locator('input[name="devMode"]').click();
    await page.waitForTimeout(500);
    
    // Get the view tabs
    const viewTabs = page.locator('.sidebar-view-tabs button');
    const count = await viewTabs.count();
    
    // Should have both Cards and Files tabs = 2 tabs
    expect(count).toBe(2);
    
    // First should be Cards
    const firstTab = await viewTabs.nth(0).textContent();
    expect(firstTab).toContain('Cards');
    
    // Second should be Files
    const secondTab = await viewTabs.nth(1).textContent();
    expect(secondTab).toContain('Files');
  });
});
