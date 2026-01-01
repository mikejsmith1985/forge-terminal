import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test.describe('AM Logging System Validation', () => {
  test('should capture LLM conversation with AM enabled', async ({ page }) => {
    // 1. Navigate to Forge Terminal
    await page.goto('http://localhost:8333');
    await page.waitForTimeout(2000);

    // 2. Take initial screenshot
    await page.screenshot({ path: 'test-results/am-test-1-initial.png' });
    
    // 3. Enable Dev Mode to see AM indicator
    // Click settings icon
    const settingsBtn = page.locator('button[title*="Settings"], button:has-text("Settings")').first();
    await settingsBtn.click();
    await page.waitForTimeout(500);
    
    // Find and enable Dev Mode
    const devModeCheckbox = page.locator('input[name="devMode"]');
    if (await devModeCheckbox.isVisible()) {
      const isChecked = await devModeCheckbox.isChecked();
      if (!isChecked) {
        await devModeCheckbox.check();
      }
    }
    
    // Close settings
    const closeBtn = page.locator('.modal .btn-close, .modal button:has-text("Close")').first();
    await closeBtn.click();
    await page.waitForTimeout(500);
    
    await page.screenshot({ path: 'test-results/am-test-2-devmode.png' });

    // 4. Right-click on tab to enable AM
    const tab = page.locator('.tab').first();
    await tab.click({ button: 'right' });
    await page.waitForTimeout(500);
    
    // Click "AM Logging" option
    const amOption = page.locator('text="AM Logging"');
    if (await amOption.isVisible()) {
      await amOption.click();
    }
    await page.waitForTimeout(1000);
    
    await page.screenshot({ path: 'test-results/am-test-3-am-enabled.png' });

    // 5. Use the Chat interface to send a message (this uses LLM API)
    // Click Chat button
    const chatBtn = page.locator('button[title*="Chat"], button:has-text("Chat")').first();
    await chatBtn.click();
    await page.waitForTimeout(1000);
    
    await page.screenshot({ path: 'test-results/am-test-4-chat-open.png' });

    // Type a test message
    const chatInput = page.locator('textarea, input[type="text"]').last();
    await chatInput.fill('Say hello and tell me what 2+2 equals in one sentence.');
    await page.waitForTimeout(500);
    
    // Send the message
    await page.keyboard.press('Enter');
    // Or find send button
    // const sendBtn = page.locator('button:has-text("Send")');
    // await sendBtn.click();
    
    await page.waitForTimeout(3000); // Wait for response
    
    await page.screenshot({ path: 'test-results/am-test-5-after-chat.png' });

    // 6. Check AM Monitor indicator
    const amMonitor = page.locator('.am-monitor');
    if (await amMonitor.isVisible()) {
      const monitorText = await amMonitor.textContent();
      const monitorClass = await amMonitor.getAttribute('class');
      
      console.log('AM Monitor Text:', monitorText);
      console.log('AM Monitor Class:', monitorClass);
      
      // Check for red (broken) vs green (active)
      if (monitorClass.includes('am-broken')) {
        console.log('🔴 AM INDICATOR IS RED (BROKEN)');
      } else if (monitorClass.includes('am-active')) {
        console.log('🟢 AM INDICATOR IS GREEN (ACTIVE)');
      } else if (monitorClass.includes('am-disabled')) {
        console.log('🟡 AM INDICATOR IS YELLOW (DISABLED)');
      }
      
      await page.screenshot({ path: 'test-results/am-test-6-final-indicator.png' });
    }

    // 7. Wait a bit longer to allow capture
    await page.waitForTimeout(5000);
    
    // 8. Take final screenshot
    await page.screenshot({ path: 'test-results/am-test-7-final.png', fullPage: true });
  });
});
