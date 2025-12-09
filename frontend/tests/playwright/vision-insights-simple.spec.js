import { test, expect } from '@playwright/test';

test.describe('Vision Insights API Integration', () => {
  test('should have Vision Insights API endpoints available', async ({ request }) => {
    const baseURL = process.env.BASE_URL || 'http://localhost:4173';
    
    // Test insights endpoint with a sample tab ID
    const insightsResponse = await request.get(`${baseURL}/api/vision/insights/test-tab-id`);
    expect(insightsResponse.ok()).toBe(true);
    
    const insightsData = await insightsResponse.json();
    expect(insightsData).toHaveProperty('success');
    expect(insightsData).toHaveProperty('insights');
    expect(insightsData).toHaveProperty('count');
    expect(Array.isArray(insightsData.insights)).toBe(true);
    
    console.log(`Insights API returned ${insightsData.count} insights`);
  });

  test('should have Vision Insights Summary API endpoint available', async ({ request }) => {
    const baseURL = process.env.BASE_URL || 'http://localhost:4173';
    
    // Test summary endpoint
    const summaryResponse = await request.get(`${baseURL}/api/vision/insights/summary/test-tab-id`);
    expect(summaryResponse.ok()).toBe(true);
    
    const summaryData = await summaryResponse.json();
    expect(summaryData).toHaveProperty('success');
    expect(summaryData).toHaveProperty('summary');
    expect(summaryData.summary).toHaveProperty('total');
    expect(summaryData.summary).toHaveProperty('bySeverity');
    expect(summaryData.summary).toHaveProperty('byType');
    expect(summaryData.summary).toHaveProperty('recent');
    
    console.log(`Summary API returned summary for ${summaryData.summary.total} total insights`);
  });

  test('should return empty insights for new tabs', async ({ request }) => {
    const baseURL = process.env.BASE_URL || 'http://localhost:4173';
    const newTabId = `test-new-tab-${Date.now()}`;
    
    const response = await request.get(`${baseURL}/api/vision/insights/${newTabId}`);
    expect(response.ok()).toBe(true);
    
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.count).toBe(0);
    expect(data.insights).toEqual([]);
  });

  test('should handle missing tab ID gracefully', async ({ request }) => {
    const baseURL = process.env.BASE_URL || 'http://localhost:4173';
    
    // Test with empty tab ID
    const response = await request.get(`${baseURL}/api/vision/insights/`);
    expect(response.status()).toBe(400); // Bad Request
  });

  test('should integrate with AM system', async ({ request }) => {
    const baseURL = process.env.BASE_URL || 'http://localhost:4173';
    
    // Check AM health to ensure system is initialized
    const healthResponse = await request.get(`${baseURL}/api/am/health`);
    expect(healthResponse.ok()).toBe(true);
    
    const healthData = await healthResponse.json();
    console.log(`AM System Status: ${healthData.status}`);
    
    // Vision Insights should work when AM is initialized
    if (healthData.status !== 'NOT_INITIALIZED') {
      const insightsResponse = await request.get(`${baseURL}/api/vision/insights/test-tab`);
      expect(insightsResponse.ok()).toBe(true);
    }
  });
});
