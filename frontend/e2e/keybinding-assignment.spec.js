/**
 * Keybinding Assignment Tests
 * 
 * Tests the new 20-slot keybinding pool:
 * - Slots 1-10: Ctrl+Shift+0-9
 * - Slots 11-20: Ctrl+Alt+0-9
 * 
 * Validates:
 * - Auto-assignment sequence
 * - Duplicate prevention
 * - Pool exhaustion alert
 * - Manual keybinding validation
 */

import { test, expect } from '@playwright/test';

// Helper to clear command cards
async function clearAllCommands(page) {
  const deleteButtons = await page.locator('.action-icon.delete').all();
  for (const btn of deleteButtons) {
    await btn.click();
  }
  // Wait for any deletion animations
  await page.waitForTimeout(500);
}

// Helper to add a command card
async function addCommandCard(page, description, command, keyBinding = '') {
  await page.click('.btn-add');
  await page.waitForSelector('.modal', { state: 'visible' });
  
  await page.fill('input[name="description"]', description);
  await page.fill('textarea[name="command"]', command);
  
  if (keyBinding) {
    await page.fill('input[name="keyBinding"]', keyBinding);
  }
  
  await page.click('.modal-footer .btn-primary');
  await page.waitForSelector('.modal', { state: 'hidden' });
  await page.waitForTimeout(300);
}

// Helper to get all keybinding badges
async function getKeybindingBadges(page) {
  const badges = await page.locator('.keybinding-badge').allTextContents();
  return badges;
}

test.describe('Keybinding Assignment', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Switch to cards view
    const cardsTab = page.locator('.sidebar-view-tab', { hasText: 'Cards' });
    if (await cardsTab.isVisible()) {
      await cardsTab.click();
    }
    
    // Clear any existing commands
    await clearAllCommands(page);
  });

  test('Auto-assigns Ctrl+Shift+0-9 for first 10 cards', async ({ page }) => {
    const expectedKeybindings = [
      'Ctrl+Shift+0',
      'Ctrl+Shift+1',
      'Ctrl+Shift+2',
      'Ctrl+Shift+3',
      'Ctrl+Shift+4',
      'Ctrl+Shift+5',
      'Ctrl+Shift+6',
      'Ctrl+Shift+7',
      'Ctrl+Shift+8',
      'Ctrl+Shift+9',
    ];

    // Add 10 cards without specifying keybindings
    for (let i = 0; i < 10; i++) {
      await addCommandCard(page, `Test Card ${i + 1}`, `echo "test ${i + 1}"`);
    }

    // Get all keybinding badges
    const badges = await getKeybindingBadges(page);
    
    // Verify all 10 expected keybindings are present
    for (const expected of expectedKeybindings) {
      expect(badges).toContain(expected);
    }
    
    expect(badges.length).toBe(10);
  });

  test('Auto-assigns Ctrl+Alt+0-9 for cards 11-20', async ({ page }) => {
    // Add first 10 cards (Ctrl+Shift+0-9)
    for (let i = 0; i < 10; i++) {
      await addCommandCard(page, `Card ${i + 1}`, `echo "${i + 1}"`);
    }

    // Add next 10 cards (should get Ctrl+Alt+0-9)
    const expectedAltKeybindings = [
      'Ctrl+Alt+0',
      'Ctrl+Alt+1',
      'Ctrl+Alt+2',
      'Ctrl+Alt+3',
      'Ctrl+Alt+4',
      'Ctrl+Alt+5',
      'Ctrl+Alt+6',
      'Ctrl+Alt+7',
      'Ctrl+Alt+8',
      'Ctrl+Alt+9',
    ];

    for (let i = 10; i < 20; i++) {
      await addCommandCard(page, `Card ${i + 1}`, `echo "${i + 1}"`);
    }

    // Get all keybinding badges
    const badges = await getKeybindingBadges(page);
    
    // Verify Alt keybindings are present
    for (const expected of expectedAltKeybindings) {
      expect(badges).toContain(expected);
    }
    
    expect(badges.length).toBe(20);
  });

  test('Prevents duplicate keybinding assignment', async ({ page }) => {
    // Add first card with Ctrl+Shift+5
    await addCommandCard(page, 'Card 1', 'echo "1"', 'Ctrl+Shift+5');
    
    // Try to add second card with same keybinding
    await page.click('.btn-add');
    await page.waitForSelector('.modal', { state: 'visible' });
    
    await page.fill('input[name="description"]', 'Card 2');
    await page.fill('textarea[name="command"]', 'echo "2"');
    await page.fill('input[name="keyBinding"]', 'Ctrl+Shift+5');
    
    // Should show error message
    const errorMessage = page.locator('small', { hasText: 'already assigned' });
    await expect(errorMessage).toBeVisible();
    
    // Save button should be disabled
    const saveButton = page.locator('.modal-footer .btn-primary');
    await expect(saveButton).toBeDisabled();
    
    // Close modal
    await page.click('.btn-close');
  });

  test('Shows friendly error when all 20 slots are taken', async ({ page }) => {
    // Fill all 20 slots
    for (let i = 0; i < 20; i++) {
      await addCommandCard(page, `Card ${i + 1}`, `echo "${i + 1}"`);
    }

    // Try to add 21st card without specifying keybinding
    await page.click('.btn-add');
    await page.waitForSelector('.modal', { state: 'visible' });
    
    await page.fill('input[name="description"]', 'Card 21');
    await page.fill('textarea[name="command"]', 'echo "21"');
    
    // Should show warning about all slots taken
    const warning = page.locator('small', { hasText: 'All 20 default slots taken' });
    await expect(warning).toBeVisible();
    
    // Try to save without keybinding - should show toast error
    await page.click('.modal-footer .btn-primary');
    
    const toast = page.locator('.toast', { hasText: 'All 20 default keybindings are assigned' });
    await expect(toast).toBeVisible({ timeout: 3000 });
    
    // Modal should still be open
    await expect(page.locator('.modal')).toBeVisible();
  });

  test('Allows custom keybinding when all 20 slots taken', async ({ page }) => {
    // Fill all 20 slots
    for (let i = 0; i < 20; i++) {
      await addCommandCard(page, `Card ${i + 1}`, `echo "${i + 1}"`);
    }

    // Add 21st card with custom keybinding
    await addCommandCard(page, 'Card 21', 'echo "21"', 'Ctrl+Shift+A');
    
    // Verify card was added
    const badges = await getKeybindingBadges(page);
    expect(badges).toContain('Ctrl+Shift+A');
    expect(badges.length).toBe(21);
  });

  test('Skips missing slots when cards are deleted', async ({ page }) => {
    // Add 5 cards (Ctrl+Shift+0-4)
    for (let i = 0; i < 5; i++) {
      await addCommandCard(page, `Card ${i + 1}`, `echo "${i + 1}"`);
    }

    // Delete card with Ctrl+Shift+2 (third card)
    const deleteButtons = await page.locator('.action-icon.delete').all();
    await deleteButtons[2].click();
    await page.waitForTimeout(500);

    // Add new card - should get Ctrl+Shift+2 (the missing slot)
    await addCommandCard(page, 'New Card', 'echo "new"');
    
    const badges = await getKeybindingBadges(page);
    
    // Should have Ctrl+Shift+2 filled back in
    expect(badges).toContain('Ctrl+Shift+2');
    expect(badges.length).toBe(5);
  });

  test('Shows availability counter in modal', async ({ page }) => {
    // Add 5 cards
    for (let i = 0; i < 5; i++) {
      await addCommandCard(page, `Card ${i + 1}`, `echo "${i + 1}"`);
    }

    // Open modal for new card
    await page.click('.btn-add');
    await page.waitForSelector('.modal', { state: 'visible' });
    
    // Should show availability counter
    const availabilityText = page.locator('small', { hasText: 'Available: 15/20' });
    await expect(availabilityText).toBeVisible();
    
    await page.click('.btn-close');
  });

  test('Normalizes keybinding format on input', async ({ page }) => {
    // Add card with lowercase keybinding
    await page.click('.btn-add');
    await page.waitForSelector('.modal', { state: 'visible' });
    
    await page.fill('input[name="description"]', 'Test Card');
    await page.fill('textarea[name="command"]', 'echo "test"');
    await page.fill('input[name="keyBinding"]', 'ctrl+shift+7');
    
    // Should validate as duplicate since Ctrl+Shift+7 is auto-assigned
    await addCommandCard(page, 'Card 1', 'echo "1"');
    
    // Now try the lowercase version
    await page.click('.btn-add');
    await page.waitForSelector('.modal', { state: 'visible' });
    
    await page.fill('input[name="description"]', 'Test Card');
    await page.fill('textarea[name="command"]', 'echo "test"');
    await page.fill('input[name="keyBinding"]', 'ctrl+shift+0');
    
    // Should show duplicate error (normalized to Ctrl+Shift+0)
    const errorMessage = page.locator('small', { hasText: 'already assigned' });
    await expect(errorMessage).toBeVisible();
  });

  test('Editing card preserves keybinding validation', async ({ page }) => {
    // Add two cards
    await addCommandCard(page, 'Card 1', 'echo "1"');
    await addCommandCard(page, 'Card 2', 'echo "2"');
    
    // Edit second card and try to use first card's keybinding
    const editButtons = await page.locator('.action-icon', { hasText: '' }).filter({ has: page.locator('svg') }).all();
    
    // Find and click the edit button for card 2
    const cards = await page.locator('.card').all();
    await cards[1].locator('.action-icon').nth(1).click();
    
    await page.waitForSelector('.modal', { state: 'visible' });
    
    // Try to change to Ctrl+Shift+0 (card 1's keybinding)
    await page.fill('input[name="keyBinding"]', 'Ctrl+Shift+0');
    
    // Should show error
    const errorMessage = page.locator('small', { hasText: 'already assigned' });
    await expect(errorMessage).toBeVisible();
    
    // Save button should be disabled
    const saveButton = page.locator('.modal-footer .btn-primary');
    await expect(saveButton).toBeDisabled();
  });
});
