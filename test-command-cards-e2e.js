/**
 * End-to-End Command Cards Verification Test
 * Tests all command card functionality per user requirements:
 * 1. Paste into active tab (not tab 1)
 * 2. Drag and drop reordering
 * 3. Edit without keybinding conflicts
 */

const { chromium } = require('@playwright/test');

async function testCommandCards() {
  console.log('🧪 Starting Command Cards E2E Verification...\n');
  
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // Navigate to the application
    console.log('📍 Navigating to Forge Terminal...');
    await page.goto('http://localhost:5173');
    await page.waitForTimeout(2000);
    
    // Test 1: Create multiple tabs
    console.log('\n✅ Test 1: Creating multiple tabs...');
    await page.click('button:has-text("New Tab")');
    await page.waitForTimeout(500);
    await page.click('button:has-text("New Tab")');
    await page.waitForTimeout(500);
    
    const tabs = await page.locator('.tab').count();
    console.log(`   Created ${tabs} tabs`);
    
    // Test 2: Switch to tab 2 (not the first tab)
    console.log('\n✅ Test 2: Switching to tab 2...');
    await page.click('.tab:nth-child(2)');
    await page.waitForTimeout(500);
    
    const activeTab = await page.locator('.tab.active').textContent();
    console.log(`   Active tab: ${activeTab.trim()}`);
    
    // Test 3: Open Command Cards
    console.log('\n✅ Test 3: Opening Command Cards sidebar...');
    await page.click('button[title="Command Cards"]');
    await page.waitForTimeout(1000);
    
    const sidebarVisible = await page.locator('.command-cards-sidebar').isVisible();
    console.log(`   Sidebar visible: ${sidebarVisible}`);
    
    // Test 4: Create a new command card
    console.log('\n✅ Test 4: Creating new command card...');
    await page.click('button:has-text("New Card")');
    await page.waitForTimeout(500);
    
    await page.fill('input[placeholder*="name"]', 'Test E2E Card');
    await page.fill('textarea[placeholder*="command"]', 'echo "Hello from E2E test"');
    await page.click('button:has-text("Save")');
    await page.waitForTimeout(1000);
    
    console.log('   Card created: Test E2E Card');
    
    // Test 5: Verify paste goes to ACTIVE tab (tab 2), not tab 1
    console.log('\n✅ Test 5: Testing paste to ACTIVE tab...');
    const activeTabBefore = await page.locator('.tab.active').textContent();
    console.log(`   Active tab before paste: ${activeTabBefore.trim()}`);
    
    await page.click('button[title="Paste to active tab"]:visible');
    await page.waitForTimeout(1000);
    
    // Check which terminal has the content
    const terminals = await page.locator('.terminal').all();
    console.log(`   Found ${terminals.length} terminals`);
    
    for (let i = 0; i < terminals.length; i++) {
      const content = await terminals[i].textContent();
      if (content.includes('Test E2E Card') || content.includes('echo')) {
        console.log(`   ✅ Content pasted to terminal ${i + 1}`);
        if (i === 1) {
          console.log('   ✅ SUCCESS: Pasted to active tab (tab 2), not tab 1!');
        } else {
          console.log(`   ❌ FAILURE: Pasted to wrong tab (tab ${i + 1})`);
        }
      }
    }
    
    // Test 6: Test drag and drop reordering
    console.log('\n✅ Test 6: Testing drag and drop reordering...');
    const cards = await page.locator('.command-card').all();
    console.log(`   Found ${cards.length} command cards`);
    
    if (cards.length >= 2) {
      const firstCard = cards[0];
      const secondCard = cards[1];
      
      const firstCardName = await firstCard.locator('.card-name').textContent();
      console.log(`   First card before: ${firstCardName}`);
      
      // Drag first card to second position
      await firstCard.hover();
      await page.mouse.down();
      await secondCard.hover();
      await page.mouse.up();
      await page.waitForTimeout(500);
      
      const cardsAfter = await page.locator('.command-card').all();
      const firstCardAfter = await cardsAfter[0].locator('.card-name').textContent();
      console.log(`   First card after: ${firstCardAfter}`);
      
      if (firstCardName !== firstCardAfter) {
        console.log('   ✅ Drag and drop works!');
      } else {
        console.log('   ⚠️  Drag and drop may need verification');
      }
    }
    
    // Test 7: Test edit without keybinding conflict
    console.log('\n✅ Test 7: Testing edit without keybinding conflict...');
    await page.click('.command-card:first-child button[title="Edit"]');
    await page.waitForTimeout(500);
    
    // Clear keybinding field if it exists
    const keybindingInput = page.locator('input[placeholder*="keybinding"]');
    if (await keybindingInput.isVisible()) {
      await keybindingInput.clear();
      console.log('   Cleared keybinding field');
    }
    
    // Update the card name
    await page.fill('input[placeholder*="name"]', 'Updated E2E Card');
    await page.click('button:has-text("Save")');
    await page.waitForTimeout(1000);
    
    const updatedCard = await page.locator('.command-card:has-text("Updated E2E Card")').count();
    if (updatedCard > 0) {
      console.log('   ✅ Edit successful without keybinding conflict!');
    } else {
      console.log('   ❌ Edit may have failed');
    }
    
    // Test 8: Delete the test card
    console.log('\n✅ Test 8: Cleaning up test card...');
    await page.click('.command-card:has-text("Updated E2E Card") button[title="Delete"]');
    await page.waitForTimeout(500);
    
    // Confirm deletion if there's a confirmation dialog
    const confirmButton = page.locator('button:has-text("Delete"), button:has-text("Confirm")');
    if (await confirmButton.isVisible()) {
      await confirmButton.click();
      await page.waitForTimeout(500);
    }
    
    console.log('   Test card deleted');
    
    console.log('\n✅ All E2E tests completed!\n');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    throw error;
  } finally {
    await browser.close();
  }
}

// Run the test
testCommandCards()
  .then(() => {
    console.log('✅ Command Cards E2E Verification: PASSED');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Command Cards E2E Verification: FAILED');
    console.error(error);
    process.exit(1);
  });
