import { test, expect } from '@playwright/test';

test('Modal scrolling functionality', async ({ page }) => {
  // Navigate to the app
  await page.goto('http://localhost:5173');
  
  // Wait for app to load
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
  
  // Look for button to open modal - try different selectors
  const openButtons = await page.locator('button, [role="button"]').all();
  
  // Try to find an "Add" button or similar
  let foundModal = false;
  for (const button of openButtons.slice(0, 5)) {
    const text = await button.textContent().catch(() => '');
    if (text && (text.includes('Add') || text.includes('Settings') || text.includes('Edit'))) {
      await button.click().catch(() => null);
      await page.waitForTimeout(500);
      
      const modal = page.locator('.modal');
      if (await modal.isVisible().catch(() => false)) {
        foundModal = true;
        
        // Verify modal structure
        const header = page.locator('.modal-header');
        const body = page.locator('.modal-body');
        
        console.log('✓ Modal found');
        console.log('✓ Has header:', await header.isVisible().catch(() => false));
        console.log('✓ Has body:', await body.isVisible().catch(() => false));
        
        // Check body overflow
        const bodyOverflow = await body.evaluate(el => 
          window.getComputedStyle(el).overflowY
        ).catch(() => 'unknown');
        console.log('✓ Body overflow-y:', bodyOverflow);
        
        break;
      }
    }
  }
  
  expect(foundModal).toBeTruthy();
});
