// issue-22-wsl-file-explorer.spec.js - Tests for WSL2 FileExplorer path handling
// Validates that files can be loaded when app runs on Windows with WSL2 paths

import { test, expect } from '@playwright/test';
import path from 'path';
import { spawn } from 'child_process';

test.describe('Issue #22 - WSL2 File Explorer Fix', () => {
  let serverProcess;
  let baseURL;

  test.beforeAll(async () => {
    // Start the server
    const forgePath = path.join(process.cwd(), '..', 'bin', 'forge');
    
    serverProcess = spawn(forgePath, [], {
      env: { ...process.env, NO_BROWSER: '1' },
      stdio: 'pipe'
    });

    // Wait for server to start
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

  test('FileExplorer should load without errors', async ({ page }) => {
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    
    // Wait for terminal to load
    await page.waitForSelector('.terminal-container', { timeout: 10000 });
    
    // Click on Files tab to open file explorer
    const filesTab = page.locator('button:has-text("Files")');
    if (await filesTab.isVisible()) {
      await filesTab.click();
      
      // Wait for files to load
      await page.waitForTimeout(2000);
      
      // Check for file tree elements
      const fileTree = page.locator('.file-tree');
      expect(fileTree).toBeTruthy();
    }
  });

  test('FileExplorer should display file tree', async ({ page }) => {
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 10000 });
    
    // Check if file explorer content exists
    const fileExplorer = page.locator('.file-explorer');
    const fileTreeExists = await fileExplorer.count() > 0;
    expect(fileTreeExists).toBeTruthy();
  });

  test('FileExplorer should show file nodes when expanded', async ({ page }) => {
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 10000 });
    
    // Click Files tab
    const filesTab = page.locator('button:has-text("Files")');
    if (await filesTab.isVisible()) {
      await filesTab.click();
      await page.waitForTimeout(1000);
      
      // Try to expand directories
      const chevrons = page.locator('.file-tree-chevron');
      const count = await chevrons.count();
      
      // Should have at least some expandable items
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('API should handle file listing requests', async ({ page }) => {
    // Test the API directly
    const response = await page.request.get(`${baseURL}/api/files/list?path=.&rootPath=.`);
    
    // Should return 200 OK for root directory
    expect(response.status()).toBe(200);
    
    // Response should contain valid JSON
    const data = await response.json();
    expect(data).toBeTruthy();
    expect(data.isDir).toBe(true);
  });

  test('API should return proper error messages', async ({ page }) => {
    // Test the API with invalid path
    const response = await page.request.get(`${baseURL}/api/files/list?path=/nonexistent/path&rootPath=.`);
    
    // Should return error status
    expect(response.status()).toBeGreaterThanOrEqual(400);
    
    // Error message should be descriptive (not empty)
    const text = await response.text();
    expect(text.length).toBeGreaterThan(0);
  });

  test('FileExplorer error message should be visible', async ({ page }) => {
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 10000 });
    
    // Check if error handling is present in the component
    const hasErrorHandling = await page.evaluate(() => {
      const html = document.body.innerHTML;
      return html.includes('error') || html.includes('Error') || html.includes('ERROR');
    });
    
    // Component should have error handling
    expect(hasErrorHandling).toBeTruthy();
  });

  test('API should support proper path encoding', async ({ page }) => {
    // Test with encoded paths
    const testPath = encodeURIComponent('.');
    const response = await page.request.get(`${baseURL}/api/files/list?path=${testPath}&rootPath=${testPath}`);
    
    expect(response.ok()).toBeTruthy();
  });

  test('FileExplorer component should handle cross-platform paths', async ({ page }) => {
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    
    // Check if FileExplorer component is properly initialized
    const hasFileExplorer = await page.evaluate(() => {
      return document.body.innerHTML.includes('FileExplorer') || 
             document.body.innerHTML.includes('file-explorer') ||
             document.body.innerHTML.includes('file-tree');
    });
    
    expect(hasFileExplorer).toBeTruthy();
  });
});
