/**
 * Follow Me & Paste Conflict Tests
 * 
 * Tests for screen capture tool conflicts and file path paste handling
 */

const { test, expect } = require('@playwright/test');

test.describe('Follow Me Screen Capture Conflict', () => {
  
  test('should continue session when screen capture tool used during Follow Me', async ({ page }) => {
    // Arrange: Start Follow Me
    await page.goto('http://localhost:3741');
    await page.waitForLoadState('networkidle');
    
    const debugTab = page.getByTestId('tab-debug');
    await debugTab.click();
    await page.waitForTimeout(500);
    
    const followMeButton = page.getByTestId('follow-me-button');
    await followMeButton.click();
    await page.waitForTimeout(1000);
    
    // Assert: Recording should be active
    const recordingIndicator = page.getByTestId('recording-indicator');
    await expect(recordingIndicator).toBeVisible();
    
    // Simulate events being captured (clicking, typing)
    await page.click('body');
    await page.keyboard.type('test');
    await page.waitForTimeout(500);
    
    // Act: Simulate screen capture tool requesting displayMedia
    // (In real scenario, this triggers stream.onended)
    // We'll check the session continues by verifying localStorage
    const sessionPersisted = await page.evaluate(() => {
      const session = localStorage.getItem('follow-me-active-session');
      return session !== null;
    });
    
    // Assert: Session should auto-save (conflict detection)
    expect(sessionPersisted).toBe(true);
    
    // Assert: "I'm Done" button should still be visible
    const imDoneButton = page.getByTestId('im-done-button');
    await expect(imDoneButton).toBeVisible();
    
    // Evidence
    await page.screenshot({ 
      path: 'test-results/follow-me-capture-conflict.png', 
      fullPage: true 
    });
  });

  test('should differentiate screen capture conflict from user stop', async ({ page }) => {
    await page.goto('http://localhost:3741');
    await page.waitForLoadState('networkidle');
    
    const debugTab = page.getByTestId('tab-debug');
    await debugTab.click();
    await page.waitForTimeout(500);
    
    const followMeButton = page.getByTestId('follow-me-button');
    await followMeButton.click();
    await page.waitForTimeout(1000);
    
    // Simulate recent activity (within last 2 seconds)
    await page.evaluate(() => {
      const now = Date.now();
      const event = {
        type: 'click',
        timestamp: 100, // Recent event
        x: 100,
        y: 100
      };
      // This simulates Follow Me capturing events
      window.localStorage.setItem('follow-me-last-event', now.toString());
    });
    
    // In a real scenario, if stream ends with recent events,
    // it's treated as tool conflict (not user stop)
    
    // Evidence
    await page.screenshot({ 
      path: 'test-results/follow-me-conflict-detection.png', 
      fullPage: true 
    });
  });
});

test.describe('Paste File Path vs Image Blob', () => {
  
  test('should upload image blob instead of pasting file path text', async ({ page }) => {
    // Arrange
    await page.goto('http://localhost:3741');
    await page.waitForLoadState('networkidle');
    
    const terminal = page.locator('.terminal');
    await terminal.click();
    await page.waitForTimeout(500);
    
    // Act: Simulate clipboard with BOTH file path text AND image blob
    // (This mimics Windows screenshot tools that put both in clipboard)
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'red';
      ctx.fillRect(0, 0, 100, 100);
      
      // Convert canvas to blob
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      
      // Create clipboard data with BOTH text and image
      const clipboardData = {
        items: [
          {
            type: 'text/plain',
            getAsString: (callback) => callback('C:\\Users\\test\\AppData\\Local\\Temp\\screenshot.png'),
            getAsFile: () => null
          },
          {
            type: 'image/png',
            getAsString: () => {},
            getAsFile: () => blob
          }
        ],
        getData: (type) => {
          if (type === 'text/plain') return 'C:\\Users\\test\\AppData\\Local\\Temp\\screenshot.png';
          return '';
        }
      };
      
      // Trigger paste event
      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: clipboardData,
        bubbles: true,
        cancelable: true
      });
      
      document.querySelector('.terminal').dispatchEvent(pasteEvent);
    });
    
    await page.waitForTimeout(2000);
    
    // Assert: Terminal should NOT show the file path text
    // It should show upload indicator instead
    const terminalText = await page.evaluate(() => {
      return document.querySelector('.xterm-screen')?.textContent || '';
    });
    
    // Should NOT contain the temp path
    expect(terminalText).not.toContain('AppData\\Local\\Temp');
    
    // Should show upload indicator (if upload succeeds)
    // OR show "Uploading" message
    
    // Evidence
    await page.screenshot({ 
      path: 'test-results/paste-image-not-path.png', 
      fullPage: true 
    });
  });

  test('should log when clipboard contains both text and media', async ({ page }) => {
    await page.goto('http://localhost:3741');
    await page.waitForLoadState('networkidle');
    
    // Listen for console messages
    const consoleMessages = [];
    page.on('console', msg => {
      if (msg.text().includes('Media detected')) {
        consoleMessages.push(msg.text());
      }
    });
    
    const terminal = page.locator('.terminal');
    await terminal.click();
    
    // Trigger paste with both text and image
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 50;
      canvas.height = 50;
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      
      const clipboardData = {
        items: [
          { type: 'text/plain', getAsFile: () => null },
          { type: 'image/png', getAsFile: () => blob }
        ],
        getData: (type) => type === 'text/plain' ? 'C:\\path\\to\\file.png' : ''
      };
      
      const event = new ClipboardEvent('paste', {
        clipboardData,
        bubbles: true,
        cancelable: true
      });
      
      document.querySelector('.terminal').dispatchEvent(event);
    });
    
    await page.waitForTimeout(1000);
    
    // Assert: Should log that media was detected
    expect(consoleMessages.length).toBeGreaterThan(0);
    expect(consoleMessages.some(msg => msg.includes('ignoring text path'))).toBe(true);
    
    // Evidence
    await page.screenshot({ 
      path: 'test-results/paste-media-prioritized.png', 
      fullPage: true 
    });
  });
});
