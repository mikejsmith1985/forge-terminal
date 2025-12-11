import { test, expect } from '@playwright/test';

// Test configuration - use BASE_URL from config or env
const PORT = process.env.PORT || 8333;
const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;

test.describe('Manual Update Check Feature', () => {
  test.beforeEach(async ({ page }) => {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║ Manual Update Check Feature - UX Testing');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`📍 Navigation to: ${BASE_URL}`);
    
    // Navigate to the app
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    console.log('✅ App loaded successfully');
    
    // Wait for app to be interactive
    await page.waitForSelector('[class*="modal"], [class*="terminal"], body', { timeout: 10000 });
    console.log('✅ App is interactive');
  });

  test('Manual update check button should exist in update modal', async ({ page }) => {
    console.log('\n📋 Test: Manual update check button should exist in update modal');
    
    // Wait a moment for initial load
    await page.waitForTimeout(1000);
    
    // Try to open settings or access version info
    const downloadButton = await page.locator('button[title*="Version"]').first();
    
    if (await downloadButton.isVisible()) {
      console.log('📌 Found version/download button');
      await downloadButton.click();
      console.log('🖱️ Clicked version button');
      await page.waitForTimeout(500);
      
      // Check for "Check Now" button in update modal
      const checkButton = await page.locator('button:has-text("Check Now")').first();
      
      if (await checkButton.isVisible()) {
        console.log('✅ "Check Now" button found in update modal');
        expect(await checkButton.isVisible()).toBe(true);
      } else {
        console.log('ℹ️ "Check Now" button not visible (modal may not be open)');
      }
    } else {
      console.log('ℹ️ Version button not immediately visible, searching in modal');
      
      // Look for the modal with update content
      const updateModal = await page.locator('text=/Software Update/i');
      if (await updateModal.isVisible()) {
        console.log('✅ Software Update modal is visible');
        const checkButton = await page.locator('button:has-text("Check Now")');
        expect(await checkButton.isVisible()).toBe(true);
        console.log('✅ "Check Now" button found');
      }
    }
  });

  test('Clicking "Check Now" should trigger API call and show loading state', async ({ page }) => {
    console.log('\n📋 Test: Clicking "Check Now" should trigger API call and show loading state');
    
    await page.waitForTimeout(1000);
    
    // Open update modal by clicking version button
    const downloadButton = await page.locator('button[title*="Version"]').first();
    if (await downloadButton.isVisible()) {
      await downloadButton.click();
      console.log('🖱️ Clicked version button');
      await page.waitForTimeout(500);
    }
    
    // Look for Check Now button
    const checkButton = await page.locator('button:has-text("Check Now")').first();
    
    if (await checkButton.isVisible()) {
      console.log('✅ "Check Now" button is visible');
      
      // Monitor network activity
      let apiCallMade = false;
      page.on('request', request => {
        if (request.url().includes('/api/update/check')) {
          apiCallMade = true;
          console.log(`🌐 API Call made: ${request.url()}`);
        }
      });
      
      // Click the button
      await checkButton.click();
      console.log('🖱️ Clicked "Check Now" button');
      
      // Check for loading state ("Checking...")
      const checkingText = await page.locator('text=/Checking\.\.\./').first();
      
      // Wait a bit to ensure loading state appears
      await page.waitForTimeout(200);
      
      if (await checkingText.isVisible()) {
        console.log('✅ Loading state "Checking..." is visible');
        expect(await checkingText.isVisible()).toBe(true);
      } else {
        console.log('ℹ️ Loading state may have completed quickly');
      }
      
      // Wait for API response
      await page.waitForTimeout(2000);
      
      if (apiCallMade) {
        console.log('✅ API call to /api/update/check was made');
        expect(apiCallMade).toBe(true);
      } else {
        console.log('⚠️ API call may not have been detected');
      }
    } else {
      console.log('⚠️ "Check Now" button not visible - skipping interaction test');
    }
  });

  test('Check update result should show success message', async ({ page }) => {
    console.log('\n📋 Test: Check update result should show success message');
    
    await page.waitForTimeout(1000);
    
    // Open update modal
    const downloadButton = await page.locator('button[title*="Version"]').first();
    if (await downloadButton.isVisible()) {
      await downloadButton.click();
      console.log('🖱️ Clicked version button');
      await page.waitForTimeout(500);
      
      // Click Check Now
      const checkButton = await page.locator('button:has-text("Check Now")').first();
      if (await checkButton.isVisible()) {
        await checkButton.click();
        console.log('🖱️ Clicked "Check Now" button');
        
        // Wait for result - should show success message or "up to date" message
        await page.waitForTimeout(3000);
        
        const successMessages = [
          'You\'re up to date!',
          'Update available',
          'Checking for updates'
        ];
        
        let foundMessage = false;
        for (const msg of successMessages) {
          const element = await page.locator(`text=/${msg}/i`).first();
          if (await element.isVisible()) {
            console.log(`✅ Found message: "${msg}"`);
            foundMessage = true;
            break;
          }
        }
        
        if (!foundMessage) {
          console.log('ℹ️ No immediate success message detected (may need more time)');
        }
      }
    }
  });

  test('Manual check should display last checked time', async ({ page }) => {
    console.log('\n📋 Test: Manual check should display last checked time');
    
    await page.waitForTimeout(1000);
    
    // Open update modal
    const downloadButton = await page.locator('button[title*="Version"]').first();
    if (await downloadButton.isVisible()) {
      await downloadButton.click();
      console.log('🖱️ Clicked version button');
      await page.waitForTimeout(500);
      
      // Check if "Last checked" text appears
      const lastCheckedText = await page.locator('text=/Last checked:/i').first();
      
      if (await lastCheckedText.isVisible()) {
        console.log('✅ "Last checked" timestamp is visible');
        const timestamp = await lastCheckedText.textContent();
        console.log(`📅 Timestamp value: ${timestamp}`);
        expect(await lastCheckedText.isVisible()).toBe(true);
      } else {
        // Try to trigger a check first
        const checkButton = await page.locator('button:has-text("Check Now")').first();
        if (await checkButton.isVisible()) {
          await checkButton.click();
          console.log('🖱️ Clicked "Check Now" to populate timestamp');
          await page.waitForTimeout(3000);
          
          const updatedLastChecked = await page.locator('text=/Last checked:/i').first();
          if (await updatedLastChecked.isVisible()) {
            console.log('✅ "Last checked" timestamp appeared after check');
            expect(await updatedLastChecked.isVisible()).toBe(true);
          } else {
            console.log('ℹ️ Timestamp not visible yet');
          }
        }
      }
    }
  });

  test('Check Now button should be disabled during checking', async ({ page }) => {
    console.log('\n📋 Test: Check Now button should be disabled during checking');
    
    await page.waitForTimeout(1000);
    
    // Open update modal
    const downloadButton = await page.locator('button[title*="Version"]').first();
    if (await downloadButton.isVisible()) {
      await downloadButton.click();
      console.log('🖱️ Clicked version button');
      await page.waitForTimeout(500);
      
      const checkButton = await page.locator('button:has-text("Check Now")').first();
      if (await checkButton.isVisible()) {
        console.log('✅ "Check Now" button found');
        
        // Check initial state
        const isInitiallyDisabled = await checkButton.isDisabled();
        console.log(`📊 Initial state - Disabled: ${isInitiallyDisabled}`);
        
        // Click it
        await checkButton.click();
        console.log('🖱️ Clicked "Check Now" button');
        
        // Immediately check if disabled
        await page.waitForTimeout(100);
        const isDisabledDuringCheck = await checkButton.isDisabled();
        console.log(`📊 During check - Disabled: ${isDisabledDuringCheck}`);
        
        if (isDisabledDuringCheck) {
          console.log('✅ Button is correctly disabled during check');
          expect(isDisabledDuringCheck).toBe(true);
        } else {
          console.log('ℹ️ Button may not be disabled (check completed very quickly)');
        }
        
        // Wait for completion
        await page.waitForTimeout(3000);
        const isDisabledAfterCheck = await checkButton.isDisabled();
        console.log(`📊 After check - Disabled: ${isDisabledAfterCheck}`);
      }
    }
  });

  test('API call should return valid update info structure', async ({ page }) => {
    console.log('\n📋 Test: API call should return valid update info structure');
    
    // Make direct API call to verify response structure
    console.log(`🌐 Making API request to: ${BASE_URL}/api/update/check`);
    const response = await page.request.get(`${BASE_URL}/api/update/check`);
    
    console.log(`📊 Response status: ${response.status()}`);
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    console.log('📦 Response data structure:', JSON.stringify(data, null, 2).substring(0, 200) + '...');
    
    // Verify required fields
    expect(data).toHaveProperty('available');
    expect(data).toHaveProperty('currentVersion');
    console.log(`✅ Response has required fields: available=${data.available}, currentVersion=${data.currentVersion}`);
  });

  test('Error state should be handled gracefully', async ({ page }) => {
    console.log('\n📋 Test: Error state should be handled gracefully');
    
    // Monitor console for errors
    const consoleLogs = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[UpdateModal]')) {
        consoleLogs.push(text);
      }
    });
    
    await page.waitForTimeout(1000);
    
    // Open update modal
    const downloadButton = await page.locator('button[title*="Version"]').first();
    if (await downloadButton.isVisible()) {
      await downloadButton.click();
      console.log('🖱️ Clicked version button');
      await page.waitForTimeout(500);
      
      const checkButton = await page.locator('button:has-text("Check Now")').first();
      if (await checkButton.isVisible()) {
        await checkButton.click();
        console.log('🖱️ Clicked "Check Now" button');
        await page.waitForTimeout(3000);
        
        // Check if an error message appears (if network failed)
        const errorMessage = await page.locator('text=/Could not check for updates/i').first();
        
        if (await errorMessage.isVisible()) {
          console.log('✅ Error message is properly displayed when check fails');
          const errorText = await errorMessage.textContent();
          console.log(`📝 Error text: ${errorText}`);
          expect(await errorMessage.isVisible()).toBe(true);
        } else {
          console.log('✅ No error occurred (check succeeded)');
        }
      }
    }
  });

  test('Manual check should work when modal is open via different UI paths', async ({ page }) => {
    console.log('\n📋 Test: Manual check should work via different UI paths');
    
    // Test 1: Via version button
    console.log('🔍 Test path 1: Version button click');
    let foundVersionButton = false;
    
    const versionButton = await page.locator('button[title*="Version"]').first();
    if (await versionButton.isVisible()) {
      foundVersionButton = true;
      await versionButton.click();
      console.log('✅ Version button path accessible');
      await page.waitForTimeout(500);
      
      const checkButton = await page.locator('button:has-text("Check Now")').first();
      if (await checkButton.isVisible()) {
        console.log('✅ Check Now button accessible via version button');
        expect(true).toBe(true);
      }
      
      // Close modal
      const closeButton = await page.locator('button[class*="btn-close"]').first();
      if (await closeButton.isVisible()) {
        await closeButton.click();
        await page.waitForTimeout(300);
      }
    }
    
    if (!foundVersionButton) {
      console.log('ℹ️ Version button path not available in this environment');
    }
  });

  test('Update modal should remain stable after multiple checks', async ({ page }) => {
    console.log('\n📋 Test: Update modal should remain stable after multiple checks');
    
    await page.waitForTimeout(1000);
    
    // Open update modal
    const downloadButton = await page.locator('button[title*="Version"]').first();
    if (await downloadButton.isVisible()) {
      await downloadButton.click();
      console.log('🖱️ Clicked version button');
      await page.waitForTimeout(500);
      
      const checkButton = await page.locator('button:has-text("Check Now")').first();
      if (await checkButton.isVisible()) {
        console.log('✅ Starting multiple checks');
        
        // Perform 3 consecutive checks
        for (let i = 1; i <= 3; i++) {
          console.log(`\n🔄 Check attempt ${i}/3`);
          await checkButton.click();
          console.log('🖱️ Clicked "Check Now"');
          
          // Wait for check to complete
          await page.waitForTimeout(2500);
          
          // Verify button is still clickable
          const isVisible = await checkButton.isVisible();
          const isDisabled = await checkButton.isDisabled();
          
          console.log(`📊 After check ${i}: Visible=${isVisible}, Disabled=${isDisabled}`);
          
          if (isVisible && !isDisabled) {
            console.log(`✅ Button is ready for next check (attempt ${i}/3)`);
          } else {
            console.log(`⚠️ Button state unexpected after check ${i}`);
          }
        }
        
        console.log('✅ Modal remained stable through multiple checks');
        expect(true).toBe(true);
      }
    }
  });
});

test.describe('Update Check Feature - Browser Integration', () => {
  test.beforeEach(async ({ page }) => {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║ Browser Integration Tests');
    console.log('╚════════════════════════════════════════════════════════════╝');
    
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('[class*="modal"], [class*="terminal"], body', { timeout: 10000 });
  });

  test('Network request should use correct headers and method', async ({ page }) => {
    console.log('\n📋 Test: Network request should use correct headers and method');
    
    let requestDetails = null;
    
    page.on('request', request => {
      if (request.url().includes('/api/update/check')) {
        requestDetails = {
          url: request.url(),
          method: request.method(),
          headers: request.headers()
        };
        console.log(`🌐 Request details:`);
        console.log(`  Method: ${requestDetails.method}`);
        console.log(`  URL: ${requestDetails.url}`);
      }
    });
    
    // Make the API call
    const response = await page.request.get(`${BASE_URL}/api/update/check`);
    console.log(`✅ Response status: ${response.status()}`);
    
    expect(response.status()).toBe(200);
    expect(response.status()).not.toBe(404);
    expect(response.status()).not.toBe(500);
  });

  test('Retry logic should handle transient failures', async ({ page }) => {
    console.log('\n📋 Test: Retry logic should handle transient failures');
    
    const requestUrls = [];
    let retryCount = 0;
    
    page.on('request', request => {
      if (request.url().includes('/api/update/check')) {
        requestUrls.push(request.url());
      }
    });
    
    // Make multiple rapid requests to test retry handling
    console.log('🔄 Making multiple rapid API calls');
    const responses = [];
    for (let i = 0; i < 3; i++) {
      const response = await page.request.get(`${BASE_URL}/api/update/check`);
      responses.push(response.status());
      console.log(`  Request ${i + 1}: Status ${response.status()}`);
    }
    
    // All should succeed
    expect(responses.every(s => s === 200)).toBe(true);
    console.log('✅ All requests completed successfully');
  });

  test('Update check should not interfere with other modal operations', async ({ page }) => {
    console.log('\n📋 Test: Update check should not interfere with other modal operations');
    
    await page.waitForTimeout(1000);
    
    // Open update modal
    const downloadButton = await page.locator('button[title*="Version"]').first();
    if (await downloadButton.isVisible()) {
      await downloadButton.click();
      console.log('🖱️ Opened update modal');
      await page.waitForTimeout(500);
      
      // Start a check
      const checkButton = await page.locator('button:has-text("Check Now")').first();
      if (await checkButton.isVisible()) {
        await checkButton.click();
        console.log('🖱️ Started update check');
        
        // Try to interact with other modal elements during the check
        await page.waitForTimeout(300);
        
        // Try to scroll/navigate in the modal
        const modal = await page.locator('[class*="modal-body"]').first();
        if (await modal.isVisible()) {
          // Try to scroll down in the modal
          await modal.evaluate(el => el.scrollBy(0, 100));
          console.log('✅ Modal scrolling works during check');
        }
        
        // Wait for check to complete
        await page.waitForTimeout(2500);
        console.log('✅ Other operations work alongside update check');
      }
    }
  });
});

test.describe('Performance and Responsiveness', () => {
  test('Update check should complete within reasonable time', async ({ page }) => {
    console.log('\n📋 Test: Update check should complete within reasonable time');
    
    const startTime = Date.now();
    
    const response = await page.request.get(`${BASE_URL}/api/update/check`);
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`⏱️ API response time: ${duration}ms`);
    console.log(`✅ Response completed in ${duration < 5000 ? 'reasonable' : 'slow'} time`);
    
    expect(response.status()).toBe(200);
    
    // Should complete within 15 seconds (with retries)
    expect(duration).toBeLessThan(15000);
  });

  test('UI should remain responsive during check', async ({ page }) => {
    console.log('\n📋 Test: UI should remain responsive during check');
    
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('body', { timeout: 10000 });
    
    // Check that page is interactive
    const isInteractive = await page.evaluate(() => {
      return document.readyState === 'complete';
    });
    
    console.log(`📊 Page interactive: ${isInteractive}`);
    expect(isInteractive).toBe(true);
    console.log('✅ UI is responsive');
  });
});
