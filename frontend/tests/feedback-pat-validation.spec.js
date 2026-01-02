/**
 * TDD Test: PAT Validation in Feedback Modal
 * 
 * RED: This test will initially fail because there's no PAT validation
 * when the user saves settings.
 */

import { test, expect } from '@playwright/test';

test.describe('Feedback Modal - PAT Validation', () => {
    test('should validate PAT immediately when saving settings', async ({ page }) => {
        // Navigate to the app
        await page.goto('http://localhost:3000');
        
        // Open feedback modal (assuming there's a feedback button)
        await page.click('button:has-text("Feedback")');
        
        // Enter an invalid PAT
        await page.fill('input[type="password"]', 'invalid_token_123');
        
        // Click Save Settings
        await page.click('button:has-text("Save Settings")');
        
        // RED PHASE: This assertion will fail initially
        // Expect to see an error message about invalid PAT
        await expect(page.locator('.alert-error')).toContainText(/invalid.*token|unauthorized/i);
        
        // Should NOT have closed the setup view
        await expect(page.locator('.setup-view')).toBeVisible();
    });

    test('should accept valid PAT and close setup view', async ({ page }) => {
        // Mock GitHub API to return success
        await page.route('https://api.github.com/user', route => {
            route.fulfill({
                status: 200,
                body: JSON.stringify({ login: 'testuser' })
            });
        });
        
        await page.goto('http://localhost:3000');
        await page.click('button:has-text("Feedback")');
        
        // Enter a valid-looking PAT
        await page.fill('input[type="password"]', 'ghp_validTokenFormat123456789012345678');
        
        // Click Save Settings
        await page.click('button:has-text("Save Settings")');
        
        // GREEN PHASE: Should show success and close setup
        await expect(page.locator('.setup-view')).not.toBeVisible();
        await expect(page.locator('.feedback-form')).toBeVisible();
    });

    test('should show clear error when PAT lacks permissions', async ({ page }) => {
        // Mock GitHub API to return 403
        await page.route('https://api.github.com/user', route => {
            route.fulfill({
                status: 403,
                body: JSON.stringify({ message: 'Resource not accessible by integration' })
            });
        });
        
        await page.goto('http://localhost:3000');
        await page.click('button:has-text("Feedback")');
        
        await page.fill('input[type="password"]', 'ghp_limitedToken123456789012345678');
        await page.click('button:has-text("Save Settings")');
        
        // Should show permission error
        await expect(page.locator('.alert-error')).toContainText(/permission|scope/i);
    });
});
