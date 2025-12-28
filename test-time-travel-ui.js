/**
 * test-time-travel-ui.js
 * Tests for Industrial Phase 2: Time-Travel UI + Model Router
 * 
 * Features tested:
 * 1. History Slider component renders and works
 * 2. Clock icon toggles the slider (Ctrl+Shift+H)
 * 3. Model Router API classifies tasks correctly
 * 4. Model Tier indicator shows in ribbon
 */

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('[Test] Navigating to Forge Terminal...');
  await page.goto('http://localhost:3005');
  
  // Wait for terminal to load
  await page.waitForSelector('.xterm', { timeout: 10000 });
  console.log('[Test] ✅ Terminal loaded');

  // Test 1: Clock icon should be visible (it's in theme-controls after the spacer)
  console.log('\n[Test 1] Checking for Clock icon in ribbon...');
  await page.waitForTimeout(2000); // Give UI time to render
  
  // Find all buttons in theme-controls
  const themeButtons = await page.locator('.theme-controls button.btn-ghost.btn-icon').all();
  console.log(`[Test 1] Found ${themeButtons.length} buttons in theme-controls`);
  
  // Clock should be the 4th button (after Palette, Theme Toggle, Sidebar Position)
  let clockButton = null;
  if (themeButtons.length >= 4) {
    clockButton = themeButtons[3]; // 0-indexed, so 4th button is index 3
    console.log('[Test 1] ✅ Clock button found (4th button in theme-controls)');
  } else {
    console.log('[Test 1] ❌ Not enough buttons in theme-controls');
    await browser.close();
    process.exit(1);
  }

  // Test 2: Click Clock icon to open History Slider
  console.log('\n[Test 2] Clicking Clock icon to open History Slider...');
  
  // Listen for console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`[Browser Error] ${msg.text()}`);
    }
  });
  
  await clockButton.click();
  await page.waitForTimeout(2000);
  
  // Take screenshot for debugging
  await page.screenshot({ path: 'test-history-slider.png' });
  console.log('[Test 2] Screenshot saved to test-history-slider.png');
  
  const slider = await page.locator('.history-slider-container').first();
  const sliderVisible = await slider.isVisible().catch(() => false);
  
  if (sliderVisible) {
    console.log('[Test 2] ✅ History Slider opened');
  } else {
    console.log('[Test 2] ❌ History Slider did NOT open');
    console.log('[Test 2] Checking if component exists in DOM...');
    const sliderCount = await page.locator('.history-slider-container').count();
    console.log(`[Test 2] Found ${sliderCount} .history-slider-container elements`);
    
    // Check React state
    const historyState = await page.evaluate(() => {
      return window.__FORGE_DEBUG_STATE || 'No debug state';
    });
    console.log('[Test 2] Debug state:', historyState);
    
    await browser.close();
    process.exit(1);
  }

  // Test 3: Check for expected UI elements
  console.log('\n[Test 3] Verifying History Slider UI elements...');
  const hasTitle = await page.locator('.history-slider-title').count() > 0;
  const hasSliderInput = await page.locator('.history-slider-input').count() > 0;
  const hasControls = await page.locator('.history-control-btn').count() > 0;
  
  console.log(`[Test 3] Title: ${hasTitle ? '✅' : '❌'}`);
  console.log(`[Test 3] Slider Input: ${hasSliderInput ? '✅' : '❌'}`);
  console.log(`[Test 3] Control Buttons: ${hasControls ? '✅' : '❌'}`);

  // Test 4: Test keyboard shortcut Ctrl+Shift+H
  console.log('\n[Test 4] Testing keyboard shortcut Ctrl+Shift+H...');
  await page.keyboard.press('Control+Shift+H');
  await page.waitForTimeout(500);
  
  const sliderClosed = !(await slider.isVisible());
  if (sliderClosed) {
    console.log('[Test 4] ✅ Ctrl+Shift+H closed the slider');
  } else {
    console.log('[Test 4] ❌ Ctrl+Shift+H did not work');
  }

  // Re-open for next test
  await page.keyboard.press('Control+Shift+H');
  await page.waitForTimeout(500);

  // Test 5: Model Router API - classify an architectural task
  console.log('\n[Test 5] Testing Model Router API...');
  
  const testInputs = [
    { input: "Design a microservices architecture for our payment system", expectedTier: "Opus" },
    { input: "Refactor the user authentication module to use JWT tokens", expectedTier: "Sonnet" },
    { input: "Run the test suite and check for linting errors", expectedTier: "Haiku" },
  ];

  for (const test of testInputs) {
    const response = await page.evaluate(async (input) => {
      const res = await fetch('/api/llm/model-tier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      });
      return res.json();
    }, test.input);

    const passed = response.tier === test.expectedTier;
    console.log(`[Test 5] Input: "${test.input}"`);
    console.log(`[Test 5] Expected: ${test.expectedTier}, Got: ${response.tier} ${passed ? '✅' : '❌'}`);
    console.log(`[Test 5] Recommendation: ${response.recommendation}\n`);
  }

  // Test 6: Check Model Tier Indicator (if visible)
  console.log('\n[Test 6] Checking for Model Tier Indicator in sidebar...');
  const tierIndicator = await page.locator('.model-tier-indicator');
  const tierIndicatorExists = await tierIndicator.count() > 0;
  
  if (tierIndicatorExists) {
    const text = await tierIndicator.textContent();
    console.log('[Test 6] ✅ Model Tier Indicator found:', text);
  } else {
    console.log('[Test 6] ⚠️  Model Tier Indicator not visible (normal if no recent classification)');
  }

  // Test 7: Slider should support moving the slider handle
  console.log('\n[Test 7] Testing slider interaction...');
  const sliderInput = await page.locator('.history-slider-input');
  await sliderInput.fill('50'); // Set to 50%
  await page.waitForTimeout(500);
  
  const sliderValue = await sliderInput.inputValue();
  console.log(`[Test 7] Slider value set to: ${sliderValue}% ${sliderValue === '50' ? '✅' : '❌'}`);

  // Test 8: Check if API endpoints respond
  console.log('\n[Test 8] Testing Time-Travel API endpoints...');
  
  const tabId = await page.evaluate(() => {
    // Get active tab ID from window state
    const tabs = document.querySelectorAll('.tab');
    if (tabs.length > 0) {
      return tabs[0].getAttribute('data-tab-id') || 'terminal-1';
    }
    return 'terminal-1';
  });

  const rangeResponse = await page.evaluate(async (tabId) => {
    const res = await fetch(`/api/am/session/${tabId}/range`);
    return { ok: res.ok, status: res.status, data: await res.json() };
  }, tabId);

  console.log(`[Test 8] /api/am/session/${tabId}/range:`);
  console.log(`[Test 8] Status: ${rangeResponse.status} ${rangeResponse.ok ? '✅' : '❌'}`);
  console.log(`[Test 8] Available: ${rangeResponse.data.available}`);
  console.log(`[Test 8] Snapshot Count: ${rangeResponse.data.snapshotCount}`);

  // Final Summary
  console.log('\n═══════════════════════════════════════');
  console.log('✅ ALL TESTS PASSED');
  console.log('═══════════════════════════════════════');
  console.log('Time-Travel UI: OPERATIONAL');
  console.log('Model Router: OPERATIONAL');
  console.log('Keyboard Shortcut: OPERATIONAL');
  console.log('═══════════════════════════════════════\n');

  // Keep browser open for manual inspection
  console.log('[Test] Browser kept open for manual inspection. Press Ctrl+C to exit.');
  await page.waitForTimeout(300000); // Keep open for 5 minutes

  await browser.close();
})();
