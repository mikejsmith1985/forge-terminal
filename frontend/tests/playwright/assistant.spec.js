import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Enable dev mode so Assistant tab is visible
  await page.addInitScript(() => localStorage.setItem('devMode', 'true'));

  // Mock assistant status and chat endpoints
  await page.route('**/api/assistant/status', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ 
        available: true, 
        models: [
          { name: 'mistral', friendlyName: 'Mistral', sizeFormatted: '4.1GB', performance: 'Fast' }
        ], 
        currentModel: 'mistral' 
      }),
    });
  });

  await page.route('**/api/assistant/chat', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Hello from mock assistant' }),
    });
  });

  await page.route('**/api/assistant/execute', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });

  await page.route('**/api/assistant/model', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });
});

test('assistant panel opens and chat works (mocked)', async ({ page }) => {
  await page.goto('/');
  
  // Dev mode should show assistant tab
  const assistantTab = page.locator('text=Assistant');
  await expect(assistantTab).toBeVisible({ timeout: 5000 });
  
  await assistantTab.click();
  await expect(page.locator('.assistant-panel')).toBeVisible();
  
  // Fill and send message
  await page.fill('.assistant-input', 'Hello');
  await page.click('.assistant-send-button');
  
  // Verify response appears
  await expect(page.locator('text=Hello from mock assistant')).toBeVisible({ timeout: 5000 });
});

test('font control toggles target and adjusts sizes', async ({ page }) => {
  await page.goto('/');
  
  // Wait for terminal to load
  await page.waitForSelector('.font-size-controls', { timeout: 10000 });
  
  // Terminal target should be selected by default
  const terminalButton = page.locator('button[title="Set target: Terminal"]');
  await expect(terminalButton).toBeVisible();
  
  const sizeBefore = await page.locator('.font-size-display').innerText();
  expect(sizeBefore).toMatch(/\d+px/);
  
  // Increase terminal font
  await page.click('button[title="Increase Font Size"]');
  const sizeAfter = await page.locator('.font-size-display').innerText();
  
  // Parse sizes and verify increase
  const beforeNum = parseInt(sizeBefore);
  const afterNum = parseInt(sizeAfter);
  expect(afterNum).toBeGreaterThan(beforeNum);

  // Switch to assistant target and increase chat font
  const assistantButton = page.locator('button[title="Set target: Assistant"]');
  await assistantButton.click();
  
  const chatSizeBefore = await page.locator('.font-size-display').innerText();
  await page.click('button[title="Increase Font Size"]');
  const chatSizeAfter = await page.locator('.font-size-display').innerText();
  
  const chatBeforeNum = parseInt(chatSizeBefore);
  const chatAfterNum = parseInt(chatSizeAfter);
  expect(chatAfterNum).toBeGreaterThan(chatBeforeNum);
});
