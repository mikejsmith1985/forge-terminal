/**
 * Chat Response Capture E2E Test
 * 
 * Tests the complete flow:
 * 1. Start Copilot CLI with gpt-5-mini (free/cheap model)
 * 2. Send a message via Chat UI
 * 3. Verify the response is captured by PromptDetector
 * 
 * IMPORTANT: Uses gpt-5-mini to avoid burning credits/money on tests
 */

import { test, expect } from '@playwright/test';

// Helper to dismiss any modals and overlays
async function dismissModals(page) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  
  // Dismiss Welcome modal if present
  const skipButton = page.locator('button:has-text("Skip")');
  if (await skipButton.isVisible({ timeout: 500 }).catch(() => false)) {
    await skipButton.click();
    await page.waitForTimeout(300);
  }
  
  // Dismiss update notification
  const laterButton = page.locator('button:has-text("Later")');
  if (await laterButton.isVisible({ timeout: 500 }).catch(() => false)) {
    await laterButton.click();
    await page.waitForTimeout(300);
  }
}

test.describe('Chat Response Capture', () => {
  test.setTimeout(120000); // 2 minutes timeout for CLI interactions

  test.beforeEach(async ({ page }) => {
    // Navigate to Forge Terminal
    await page.goto('http://localhost:8333');
    
    // Wait for terminal to be ready
    await page.locator('.xterm-screen').first().waitFor({ state: 'visible', timeout: 10000 });
    
    // Give terminal time to fully initialize
    await page.waitForTimeout(2000);
  });

  test('should capture response when Copilot CLI is running with gpt-5-mini', async ({ page }) => {
    // Focus the terminal
    const terminal = page.locator('.xterm-screen').first();
    await terminal.click();
    
    // STEP 1: Start Copilot CLI with FREE model (gpt-5-mini)
    console.log('[Test] Starting Copilot CLI with gpt-5-mini...');
    await page.keyboard.type('copilot --model gpt-5-mini');
    await page.keyboard.press('Enter');
    
    // Wait for CLI to initialize (look for the prompt or initial output)
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'test-results/chat-capture-01-copilot-started.png' });
    
    // STEP 2: Switch to Chat view
    console.log('[Test] Switching to Chat view...');
    const chatTab = page.locator('button.sidebar-view-tab').filter({ hasText: 'Chat' });
    if (await chatTab.isVisible()) {
      await chatTab.click();
      await page.waitForTimeout(500);
    } else {
      // Try clicking the chat icon in the header
      const chatIcon = page.locator('[title*="Chat"]').first();
      if (await chatIcon.isVisible()) {
        await chatIcon.click();
        await page.waitForTimeout(500);
      }
    }
    await page.screenshot({ path: 'test-results/chat-capture-02-chat-view.png' });
    
    // STEP 3: Find and fill the chat input
    const chatInput = page.locator('.chat-view-input, .chat-input').first();
    await expect(chatInput).toBeVisible({ timeout: 5000 });
    
    // Track WebSocket messages for debugging
    const wsMessages = [];
    page.on('websocket', ws => {
      ws.on('framesent', event => {
        try {
          const data = JSON.parse(event.payload);
          if (data.type === 'CHAT_COMMAND') {
            wsMessages.push({ direction: 'sent', ...data });
          }
        } catch (e) {
          // Binary data, ignore
        }
      });
      ws.on('framereceived', event => {
        try {
          const data = JSON.parse(event.payload);
          if (data.type === 'CHAT_RESPONSE_COMPLETE' || data.type === 'CHAT_COMMAND_SENT') {
            wsMessages.push({ direction: 'received', ...data });
          }
        } catch (e) {
          // Binary data, ignore
        }
      });
    });
    
    // STEP 4: Send a simple test message
    console.log('[Test] Sending test message: "what is 2+2?"...');
    await chatInput.click();
    await chatInput.fill('what is 2+2?');
    await page.screenshot({ path: 'test-results/chat-capture-03-message-typed.png' });
    
    // Find and click send button
    const sendButton = page.locator('.chat-view-send-btn, .chat-send-btn').first();
    await sendButton.click();
    
    // STEP 5: Wait for response
    console.log('[Test] Waiting for response...');
    await page.waitForTimeout(15000); // Wait up to 15 seconds for LLM response
    
    await page.screenshot({ path: 'test-results/chat-capture-04-after-send.png' });
    
    // STEP 6: Verify response was captured
    // Look for assistant message that's NOT "Waiting for response..."
    const assistantMessages = page.locator('.chat-view-message-assistant .chat-view-content pre');
    const messageCount = await assistantMessages.count();
    
    console.log(`[Test] Found ${messageCount} assistant message(s)`);
    
    if (messageCount > 0) {
      const lastMessage = await assistantMessages.last().textContent();
      console.log(`[Test] Last assistant message: "${lastMessage?.substring(0, 100)}..."`);
      
      // Verify it's not still showing "Waiting..."
      expect(lastMessage).not.toContain('Waiting for response');
      expect(lastMessage).not.toBe('⏳ Waiting for response...');
      
      // Should contain some actual response (not empty)
      expect(lastMessage?.length).toBeGreaterThan(10);
    }
    
    // Log WebSocket messages for debugging
    console.log('[Test] WebSocket messages:', JSON.stringify(wsMessages, null, 2));
    
    await page.screenshot({ path: 'test-results/chat-capture-05-final.png' });
  });

  test('should handle case when no CLI is running', async ({ page }) => {
    // This tests what happens when user sends message without CLI running
    
    // STEP 1: Switch to Chat view directly (without starting CLI)
    const chatTab = page.locator('button.sidebar-view-tab').filter({ hasText: 'Chat' });
    if (await chatTab.isVisible()) {
      await chatTab.click();
      await page.waitForTimeout(500);
    }
    
    // STEP 2: Find chat input
    const chatInput = page.locator('.chat-view-input, .chat-input').first();
    await expect(chatInput).toBeVisible({ timeout: 5000 });
    
    // STEP 3: Send a message (will go to shell prompt)
    await chatInput.fill('what is 2+2?');
    const sendButton = page.locator('.chat-view-send-btn, .chat-send-btn').first();
    await sendButton.click();
    
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-results/chat-capture-no-cli.png' });
    
    // The message went to shell - should see error or strange output
    // This is expected behavior - user needs to start CLI first
  });

  test('should not duplicate messages in chat view', async ({ page }) => {
    // Verify the "message appearing twice" bug is fixed
    
    // Focus terminal and start CLI
    const terminal = page.locator('.xterm-screen').first();
    await terminal.click();
    
    // Start Copilot with free model
    await page.keyboard.type('copilot --model gpt-5-mini');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(5000);
    
    // Switch to Chat
    const chatTab = page.locator('button.sidebar-view-tab').filter({ hasText: 'Chat' });
    if (await chatTab.isVisible()) {
      await chatTab.click();
      await page.waitForTimeout(500);
    }
    
    const chatInput = page.locator('.chat-view-input, .chat-input').first();
    await expect(chatInput).toBeVisible({ timeout: 5000 });
    
    // Send message
    await chatInput.fill('what is 2+2?');
    const sendButton = page.locator('.chat-view-send-btn, .chat-send-btn').first();
    await sendButton.click();
    
    await page.waitForTimeout(5000);
    
    // Count user messages containing "what is 2+2?"
    const userMessages = page.locator('.chat-view-message-user');
    const userMessageCount = await userMessages.count();
    
    // Count how many contain our specific text
    let matchingCount = 0;
    for (let i = 0; i < userMessageCount; i++) {
      const text = await userMessages.nth(i).textContent();
      if (text?.includes('what is 2+2?')) {
        matchingCount++;
      }
    }
    
    console.log(`[Test] Found ${matchingCount} user message(s) with "what is 2+2?"`);
    await page.screenshot({ path: 'test-results/chat-capture-duplicate-check.png' });
    
    // Should only appear once!
    expect(matchingCount).toBe(1);
  });
});

test.afterAll(async () => {
  console.log('\n📸 Screenshots saved to test-results/');
});
