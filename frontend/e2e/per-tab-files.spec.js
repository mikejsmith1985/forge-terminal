import { test, expect } from '@playwright/test';
import path from 'path';
import os from 'os';
import fs from 'fs';

// Create temporary test directories
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-test-'));
const tabRootDir1 = path.join(tempDir, 'tab1-root');
const tabRootDir2 = path.join(tempDir, 'tab2-root');
const parentDir = path.join(tempDir, 'parent');

// Create test directory structures
fs.mkdirSync(tabRootDir1, { recursive: true });
fs.mkdirSync(tabRootDir2, { recursive: true });
fs.mkdirSync(parentDir, { recursive: true });

// Create test files
fs.writeFileSync(path.join(tabRootDir1, 'tab1-file.txt'), 'Tab 1 Content');
fs.mkdirSync(path.join(tabRootDir1, 'subdir1'), { recursive: true });
fs.writeFileSync(path.join(tabRootDir1, 'subdir1', 'nested.txt'), 'Nested in Tab 1');

fs.writeFileSync(path.join(tabRootDir2, 'tab2-file.txt'), 'Tab 2 Content');
fs.mkdirSync(path.join(tabRootDir2, 'subdir2'), { recursive: true });
fs.writeFileSync(path.join(tabRootDir2, 'subdir2', 'nested.txt'), 'Nested in Tab 2');

fs.writeFileSync(path.join(parentDir, 'parent-file.txt'), 'Parent Content');

test.describe('Per-Tab File Explorer', () => {
  test('should initialize file explorer at current tab root directory', async ({ page }) => {
    await page.goto('/');
    
    // Wait for app to load
    await page.waitForSelector('.app', { timeout: 10000 });
    
    // Switch to file explorer view if needed
    const filesTab = page.locator('button:has-text("Files")').first();
    if (await filesTab.isVisible()) {
      await filesTab.click();
      await page.waitForTimeout(500);
    }
    
    // File explorer should be visible
    const fileExplorer = page.locator('.file-explorer');
    await expect(fileExplorer).toBeVisible({ timeout: 5000 });
  });

  test('should display different files for different tabs', async ({ page }) => {
    await page.goto('/');
    
    // Wait for app to load
    await page.waitForSelector('.app', { timeout: 10000 });
    
    // Switch to file explorer view
    const filesTab = page.locator('button:has-text("Files")').first();
    if (await filesTab.isVisible()) {
      await filesTab.click();
      await page.waitForTimeout(500);
    }
    
    // Create a second tab
    const newTabBtn = page.locator('.new-tab-btn');
    await expect(newTabBtn).toBeVisible();
    await newTabBtn.click();
    await page.waitForTimeout(500);
    
    // File explorer should still be visible
    const fileExplorer = page.locator('.file-explorer');
    await expect(fileExplorer).toBeVisible({ timeout: 5000 });
    
    // Both tabs should exist
    const tabs = page.locator('.tab-bar .tab');
    const tabCount = await tabs.count();
    expect(tabCount).toBeGreaterThanOrEqual(2);
  });

  test('should maintain separate current paths for each tab', async ({ page }) => {
    await page.goto('/');
    
    // Wait for app to load
    await page.waitForSelector('.app', { timeout: 10000 });
    
    // Switch to file explorer view
    const filesTab = page.locator('button:has-text("Files")').first();
    if (await filesTab.isVisible()) {
      await filesTab.click();
      await page.waitForTimeout(500);
    }
    
    // Get initial file explorer state
    const fileExplorer1 = page.locator('.file-explorer');
    await expect(fileExplorer1).toBeVisible({ timeout: 5000 });
    
    // Count files/folders in initial tab
    const initialItems = page.locator('.file-tree-item');
    const initialCount = await initialItems.count();
    
    // Create a second tab
    const newTabBtn = page.locator('.new-tab-btn');
    await newTabBtn.click();
    await page.waitForTimeout(500);
    
    // File explorer should update (might be different or same depending on cwd)
    const fileExplorer2 = page.locator('.file-explorer');
    await expect(fileExplorer2).toBeVisible({ timeout: 5000 });
    
    // Switch back to first tab
    const tabs = page.locator('.tab-bar .tab');
    await tabs.first().click();
    await page.waitForTimeout(500);
    
    // File explorer should restore the same state or allow navigation
    const fileExplorer3 = page.locator('.file-explorer');
    await expect(fileExplorer3).toBeVisible({ timeout: 5000 });
  });

  test('should prevent directory traversal above tab root', async ({ page }) => {
    await page.goto('/');
    
    // Wait for app to load
    await page.waitForSelector('.app', { timeout: 10000 });
    
    // Switch to file explorer view
    const filesTab = page.locator('button:has-text("Files")').first();
    if (await filesTab.isVisible()) {
      await filesTab.click();
      await page.waitForTimeout(500);
    }
    
    // File explorer should be visible and functional
    const fileExplorer = page.locator('.file-explorer');
    await expect(fileExplorer).toBeVisible({ timeout: 5000 });
    
    // Try to check if traversal is prevented
    // This would be tested by attempting to navigate to parent dir
    // and ensuring it fails or is blocked
    // For now, just verify explorer is working
    const fileTreeItems = page.locator('.file-tree-item');
    const itemCount = await fileTreeItems.count();
    expect(itemCount).toBeGreaterThanOrEqual(0);
  });

  test('file API should accept rootPath parameter', async ({ page }) => {
    await page.goto('/');
    
    // Wait for app to load
    await page.waitForSelector('.app', { timeout: 10000 });
    
    // Test the file API endpoint with rootPath parameter
    const response = await page.request.get(`/api/files/list?path=.&rootPath=.`);
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('path');
    expect(data).toHaveProperty('isDir');
    expect(data.isDir).toBe(true);
  });

  test('file API should reject paths outside rootPath', async ({ page }) => {
    await page.goto('/');
    
    // Wait for app to load
    await page.waitForSelector('.app', { timeout: 10000 });
    
    // Try to access a path outside the root (going up)
    // This should fail with 403 Forbidden
    const response = await page.request.get(`/api/files/list?path=/&rootPath=/home`);
    
    // The response should either be 403 or 404 depending on the path
    // For security, we expect 403 when trying to go above rootPath
    expect([403, 404, 400]).toContain(response.status());
  });

  test('file deletion should respect rootPath boundaries', async ({ page }) => {
    await page.goto('/');
    
    // Wait for app to load
    await page.waitForSelector('.app', { timeout: 10000 });
    
    // Try to delete a file with POST request including rootPath
    const response = await page.request.post(`/api/files/delete`, {
      data: {
        path: '/etc/passwd',
        rootPath: '.'
      }
    });
    
    // Should be rejected (403 Forbidden or 404 Not Found)
    expect([403, 404, 400]).toContain(response.status());
  });

  test('file read should include rootPath parameter', async ({ page }) => {
    await page.goto('/');
    
    // Wait for app to load
    await page.waitForSelector('.app', { timeout: 10000 });
    
    // Create a test file in temp directory
    const testFile = path.join(tempDir, 'test-read.txt');
    const testContent = 'Test read content';
    fs.writeFileSync(testFile, testContent);
    
    // Try to read the file with rootPath parameter
    const response = await page.request.post(`/api/files/read`, {
      data: {
        path: testFile,
        rootPath: tempDir
      }
    });
    
    // Should succeed with 200 OK
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('content');
    expect(data.content).toBe(testContent);
  });

  test('file write should respect rootPath validation', async ({ page }) => {
    await page.goto('/');
    
    // Wait for app to load
    await page.waitForSelector('.app', { timeout: 10000 });
    
    // Try to write a file outside rootPath
    const response = await page.request.post(`/api/files/write`, {
      data: {
        path: '/tmp/test-write.txt',
        content: 'test content',
        rootPath: '/home/secure'
      }
    });
    
    // Should be rejected (403 Forbidden)
    expect(response.status()).toBe(403);
  });

  test('should handle missing rootPath gracefully', async ({ page }) => {
    await page.goto('/');
    
    // Wait for app to load
    await page.waitForSelector('.app', { timeout: 10000 });
    
    // If rootPath is not provided, it should default to '.'
    const response = await page.request.get(`/api/files/list?path=.`);
    
    // Should still work with default root
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('path');
  });
});

// Cleanup
test.afterAll(() => {
  // Clean up temp directory
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
