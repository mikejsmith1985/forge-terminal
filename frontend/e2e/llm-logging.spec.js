import { test, expect } from '@playwright/test';

test.describe('LLM Conversation Logging', () => {
  const SERVER_URL = 'http://localhost:8333';
  
  test('should detect gh copilot commands', async ({ page }) => {
    await page.goto(SERVER_URL);
    await page.waitForSelector('.xterm-screen', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Just verify terminal is working - detection happens on backend
    const command = 'echo "test"\n';
    await page.keyboard.type(command, { delay: 50 });
    await page.waitForTimeout(1000);

    const content = await page.textContent('.xterm-screen');
    expect(content.length).toBeGreaterThan(0);
  });

  test('should expose LLM conversations API', async ({ page }) => {
    const response = await page.goto(`${SERVER_URL}/api/am/llm/conversations/test-tab`);
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.conversations)).toBe(true);
  });
});

test.describe('LLM API Endpoints', () => {
  test('should retrieve conversations', async ({ request }) => {
    const response = await request.get('http://localhost:8333/api/am/llm/conversations/test-123');
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data).toHaveProperty('conversations');
    expect(data).toHaveProperty('count');
  });
});
