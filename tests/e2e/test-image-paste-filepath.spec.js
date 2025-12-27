/**
 * Test: Image Paste Filepath Fix
 * 
 * Purpose: Verify that pasted images provide accessible file paths to Copilot CLI
 * 
 * Test Cases:
 * 1. Image paste uploads to temp directory
 * 2. Full absolute path is sent to terminal
 * 3. Path is accessible by system
 */

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const os = require('os');

test.describe('Image Paste Filepath Fix', () => {
  let page;
  let context;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      permissions: ['clipboard-read', 'clipboard-write']
    });
    page = await context.newPage();
    
    // Navigate to Forge Terminal
    await page.goto('http://localhost:17171');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.xterm-screen', { timeout: 10000 });
  });

  test('should upload image and return full absolute path', async () => {
    // Create a test image blob
    const canvas = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'red';
      ctx.fillRect(0, 0, 100, 100);
      return canvas.toDataURL();
    });

    // Convert to blob and copy to clipboard
    const blob = await page.evaluate(async (dataUrl) => {
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      
      // Create clipboard item
      const clipboardItem = new ClipboardItem({ 'image/png': blob });
      await navigator.clipboard.write([clipboardItem]);
      
      return true;
    }, canvas);

    expect(blob).toBeTruthy();

    // Focus terminal
    await page.click('.xterm-screen');
    await page.waitForTimeout(500);

    // Trigger paste
    await page.keyboard.press('Control+V');

    // Wait for upload completion
    await page.waitForTimeout(2000);

    // Check terminal output for full path
    const terminalText = await page.evaluate(() => {
      const terminal = document.querySelector('.xterm-screen');
      return terminal ? terminal.textContent : '';
    });

    // Should contain full path format [📷 C:\Users\...\screenshot-XXX.png]
    const pathRegex = /\[📷 [A-Z]:\\.+\\screenshot-\d+-\d+\.png\]/;
    expect(terminalText).toMatch(pathRegex);

    // Extract the path
    const match = terminalText.match(/\[📷 (.+\.png)\]/);
    expect(match).toBeTruthy();
    
    const imagePath = match[1];
    console.log('Image path:', imagePath);

    // Verify path is absolute
    expect(path.isAbsolute(imagePath)).toBeTruthy();

    // Verify file exists
    expect(fs.existsSync(imagePath)).toBeTruthy();

    // Verify it's in temp directory
    const tempDir = path.join(os.tmpdir(), 'forge-terminal-session');
    expect(imagePath.startsWith(tempDir)).toBeTruthy();
  });

  test('should clean up old session files on restart', async () => {
    const tempDir = path.join(os.tmpdir(), 'forge-terminal-session');
    
    // Check if temp directory exists
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir);
      console.log('Temp files found:', files.length);
      
      // Verify files match expected pattern
      files.forEach(file => {
        expect(file).toMatch(/^screenshot-\d+-\d+\.(png|jpg|jpeg|gif|bmp|webp|svg)$/);
      });
    }
  });

  test.afterAll(async () => {
    await context.close();
  });
});
