import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Image Paste', () => {
  test('should handle image paste via Ctrl+V', async ({ page }) => {
    // Navigate to app
    await page.goto('http://localhost:8333');
    
    // Wait for terminal
    await page.waitForSelector('.terminal-inner');
    
    // Create a dummy image file to paste
    const buffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    
    // Focus terminal
    await page.click('.terminal-inner');
    
    // Simulate paste event with file
    // Playwright doesn't support direct clipboard API access easily in all browsers
    // But we can trigger the paste event manually via CDP or evaluate
    
    await page.evaluate(async () => {
      // Create a blob
      const blob = await fetch('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==').then(r => r.blob());
      const file = new File([blob], 'test-image.png', { type: 'image/png' });
      
      // Create DataTransfer
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      
      // Dispatch paste event
      const event = new ClipboardEvent('paste', {
        clipboardData: dataTransfer,
        bubbles: true,
        cancelable: true
      });
      
      document.querySelector('.xterm-helper-textarea')?.dispatchEvent(event) || 
      document.querySelector('.terminal-inner')?.dispatchEvent(event) ||
      document.dispatchEvent(event);
    });
    
    // Wait for "see file at" message in terminal
    // We need to check the terminal content
    // This is tricky with xterm canvas, but we can check the accessibility tree or selection
    // Or we can check if the backend received the upload (if we could mock it)
    
    // For now, let's wait a bit and check if we can find the text in the DOM (xterm renders text in rows)
    await page.waitForTimeout(2000);
    
    const terminalText = await page.evaluate(() => {
      const rows = document.querySelectorAll('.xterm-rows > div');
      return Array.from(rows).map(r => r.innerText).join('\n');
    });
    
    console.log('Terminal text:', terminalText);
    
    // We expect "see file at" or similar
    expect(terminalText).toContain('see file at');
  });
});
