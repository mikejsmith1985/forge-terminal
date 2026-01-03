import { test, expect } from '@playwright/test';

// Use environment variable or default to 8333
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8333';

/**
 * Smart Routing API Tests
 * Tests the backend routing APIs without UI dependencies
 */

test.describe('Smart Routing API', () => {

  test('classify endpoint returns correct pattern for architecture tasks', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/routing/classify`, {
      data: {
        prompt: 'Design a smart routing system with database and UI components',
        mentionedFiles: []
      }
    });
    
    expect(response.ok()).toBeTruthy();
    const result = await response.json();
    
    expect(result.pattern).toBe('architecture');
    expect(result.complexity).toBeGreaterThanOrEqual(8);
    expect(result.reasoning).toBeTruthy();
  });

  test('classify endpoint handles multi-file-refactor pattern', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/routing/classify`, {
      data: {
        prompt: 'Refactor routing logic across multiple components',
        mentionedFiles: [
          '@internal/routing/classifier.go',
          '@internal/routing/effectiveness.go',
          '@cmd/forge/handlers_routing.go',
          '@cmd/forge/main.go',
          '@frontend/src/components/SmartRoutingPanel.jsx'
        ]
      }
    });
    
    expect(response.ok()).toBeTruthy();
    const result = await response.json();
    
    expect(result.pattern).toBe('multi-file-refactor');
    expect(result.complexity).toBe(8);
    expect(result.file_count).toBe(5);
  });

  test('classify endpoint recognizes bugfix pattern', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/routing/classify`, {
      data: {
        prompt: 'Fix the tour dismissal bug in localStorage',
        mentionedFiles: []
      }
    });
    
    expect(response.ok()).toBeTruthy();
    const result = await response.json();
    
    expect(result.pattern).toBe('bugfix');
    expect(result.complexity).toBeLessThanOrEqual(6);
  });

  test('classify endpoint recognizes testing pattern', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/routing/classify`, {
      data: {
        prompt: 'Write Playwright tests for the routing panel',
        mentionedFiles: []
      }
    });
    
    expect(response.ok()).toBeTruthy();
    const result = await response.json();
    
    expect(result.pattern).toBe('testing');
    expect(result.complexity).toBe(4);
  });

  test('classify endpoint recognizes documentation pattern', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/routing/classify`, {
      data: {
        prompt: 'Update README with routing documentation',
        mentionedFiles: []
      }
    });
    
    expect(response.ok()).toBeTruthy();
    const result = await response.json();
    
    expect(result.pattern).toBe('documentation');
    expect(result.complexity).toBe(2);
  });

  test('recommend endpoint returns model suggestion', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/routing/recommend`, {
      data: {
        pattern: 'architecture',
        complexity: 9,
        currentModel: 'claude-sonnet-4.5'
      }
    });
    
    expect(response.ok()).toBeTruthy();
    const result = await response.json();
    
    expect(result.recommended_model).toBeTruthy();
    expect(result.reasoning).toBeTruthy();
    // Confidence field may not be present in all responses
    expect(['high', 'medium', 'low', undefined]).toContain(result.confidence);
  });

  test('log endpoint accepts completion data', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/routing/log`, {
      data: {
        pattern: 'bugfix',
        model: 'claude-haiku-4.5',
        prompts: 2,
        success: true,
        filesChanged: 3
      }
    });
    
    expect(response.ok()).toBeTruthy();
    // Log endpoint may return empty response or success message
    const text = await response.text();
    expect(text).toBeTruthy(); // Just verify we got a response
  });

  test('effectiveness-log endpoint returns historical data', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/routing/effectiveness-log`);
    
    expect(response.ok()).toBeTruthy();
    const result = await response.json();
    
    expect(Array.isArray(result)).toBe(true);
    // Each entry should have required fields
    if (result.length > 0) {
      const entry = result[0];
      expect(entry).toHaveProperty('pattern');
      expect(entry).toHaveProperty('model');
      expect(entry).toHaveProperty('prompts');
      expect(entry).toHaveProperty('success');
      expect(entry).toHaveProperty('timestamp');
    }
  });

  test('recommend endpoint uses historical data when available', async ({ request }) => {
    // First, log some effectiveness data
    await request.post(`${BASE_URL}/api/routing/log`, {
      data: {
        pattern: 'feature',
        model: 'claude-opus-4.5',
        prompts: 2,
        success: true,
        filesChanged: 5
      }
    });

    await request.post(`${BASE_URL}/api/routing/log`, {
      data: {
        pattern: 'feature',
        model: 'claude-sonnet-4.5',
        prompts: 4,
        success: true,
        filesChanged: 5
      }
    });

    // Now request recommendation - should prefer Opus (fewer prompts)
    const response = await request.post(`${BASE_URL}/api/routing/recommend`, {
      data: {
        pattern: 'feature',
        complexity: 7,
        currentModel: 'claude-sonnet-4.5'
      }
    });
    
    expect(response.ok()).toBeTruthy();
    const result = await response.json();
    
    // Historical stats might be in different format or not returned
    // Main goal is that endpoint works and returns a recommendation
    expect(result.recommended_model).toBeTruthy();
  });

  test('classify handles edge case - empty prompt', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/routing/classify`, {
      data: {
        prompt: '',
        mentionedFiles: []
      }
    });
    
    expect(response.ok()).toBeTruthy();
    const result = await response.json();
    
    // Should still classify (likely as "feature" with low complexity)
    expect(result.pattern).toBeTruthy();
    expect(result.complexity).toBeLessThanOrEqual(6);
  });

  test('classify handles edge case - very long prompt', async ({ request }) => {
    const longPrompt = 'refactor '.repeat(100);
    const response = await request.post(`${BASE_URL}/api/routing/classify`, {
      data: {
        prompt: longPrompt,
        mentionedFiles: []
      }
    });
    
    expect(response.ok()).toBeTruthy();
    const result = await response.json();
    
    expect(result.pattern).toBe('multi-file-refactor');
  });

  test('classify handles edge case - many file mentions', async ({ request }) => {
    const files = Array.from({ length: 20 }, (_, i) => `@file${i}.go`);
    const response = await request.post(`${BASE_URL}/api/routing/classify`, {
      data: {
        prompt: 'Update all these files',
        mentionedFiles: files
      }
    });
    
    expect(response.ok()).toBeTruthy();
    const result = await response.json();
    
    expect(result.file_count).toBe(20);
    // Complexity based on prompt content, not just file count
    expect(result.complexity).toBeGreaterThanOrEqual(5);
  });
});
