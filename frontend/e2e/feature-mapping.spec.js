// @ts-check
import { test, expect } from '@playwright/test';

test.describe('Feature Mapping Tests', () => {
  test('should load Features lens and display dynamic analysis', async ({ page }) => {
    // Start Forge Terminal
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Wait for terminal to initialize
    await page.waitForSelector('.terminal-container', { timeout: 10000 });

    // Click Files tab in sidebar
    await page.click('.sidebar-view-tab:nth-child(2)');
    await page.waitForSelector('.lens-picker', { timeout: 5000 });

    // Click Features tab
    await page.click('.lens-tab:has-text("Features")');
    await page.waitForSelector('.lens-features-groups', { timeout: 10000 });

    // Wait for feature analysis to load
    await page.waitForSelector('.lens-feature-group', { timeout: 15000 });

    // Verify features are displayed
    const featureGroups = await page.$$('.lens-feature-group');
    expect(featureGroups.length).toBeGreaterThan(0);

    console.log(`✅ Found ${featureGroups.length} feature groups`);

    // Check first feature has expected elements
    const firstFeature = featureGroups[0];
    
    // Should have name
    const name = await firstFeature.$('.lens-feature-name');
    expect(name).toBeTruthy();
    const nameText = await name.textContent();
    console.log(`  Feature name: ${nameText}`);

    // Should have file count badge
    const badge = await firstFeature.$('.lens-feature-badge');
    expect(badge).toBeTruthy();
    const badgeText = await badge.textContent();
    console.log(`  Files: ${badgeText}`);

    // Should have token count
    const tokens = await firstFeature.$('.lens-feature-tokens');
    expect(tokens).toBeTruthy();
    const tokensText = await tokens.textContent();
    console.log(`  Tokens: ${tokensText}`);

    // Take screenshot
    await page.screenshot({ path: 'test-results/features-lens.png', fullPage: true });
    console.log('  Screenshot saved: test-results/features-lens.png');
  });

  test('should show capabilities and endpoints if available', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 10000 });

    // Navigate to Features lens
    await page.click('.sidebar-view-tab:nth-child(2)');
    await page.waitForSelector('.lens-picker', { timeout: 5000 });
    await page.click('.lens-tab:has-text("Features")');
    await page.waitForSelector('.lens-feature-group', { timeout: 15000 });

    // Check for capabilities
    const capabilities = await page.$$('.lens-feature-capabilities');
    if (capabilities.length > 0) {
      const capText = await capabilities[0].textContent();
      console.log(`✅ Found capabilities: ${capText}`);
    } else {
      console.log('ℹ️  No capabilities displayed (expected if none discovered)');
    }

    // Check for API endpoints
    const endpoints = await page.$$('.lens-feature-endpoints');
    if (endpoints.length > 0) {
      const epText = await endpoints[0].textContent();
      console.log(`✅ Found API endpoints: ${epText}`);
    } else {
      console.log('ℹ️  No endpoints displayed (expected if none discovered)');
    }

    // Take screenshot
    await page.screenshot({ path: 'test-results/features-details.png', fullPage: true });
  });

  test('should allow selecting files from features', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 10000 });

    // Navigate to Features lens
    await page.click('.sidebar-view-tab:nth-child(2)');
    await page.waitForSelector('.lens-picker', { timeout: 5000 });
    await page.click('.lens-tab:has-text("Features")');
    await page.waitForSelector('.lens-feature-group', { timeout: 15000 });

    // Click first file in first feature
    const firstFile = await page.$('.lens-feature-files .lens-file-item');
    expect(firstFile).toBeTruthy();
    
    await firstFile.click();
    
    // Verify it's selected
    const isSelected = await firstFile.evaluate(el => el.classList.contains('selected'));
    expect(isSelected).toBe(true);
    console.log('✅ File selection works');

    // Check context cart
    const cartItems = await page.$$('.lens-cart-item');
    expect(cartItems.length).toBe(1);
    console.log('✅ Context cart updated');

    // Take screenshot
    await page.screenshot({ path: 'test-results/features-selection.png', fullPage: true });
  });

  test('should fallback to static grouping if analysis fails', async ({ page }) => {
    // This test would require mocking the API failure
    // For now, just verify the view loads
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 10000 });

    await page.click('.sidebar-view-tab:nth-child(2)');
    await page.waitForSelector('.lens-picker', { timeout: 5000 });
    await page.click('.lens-tab:has-text("Features")');
    
    // Should not crash even if API fails
    await page.waitForTimeout(5000);
    
    const errorMessage = await page.$('.lens-error');
    const featuresGroups = await page.$('.lens-features-groups');
    
    // Should either show features or error, not blank
    expect(errorMessage || featuresGroups).toBeTruthy();
    console.log(errorMessage ? 'ℹ️  Fallback mode active' : '✅ Dynamic analysis working');
  });
});
