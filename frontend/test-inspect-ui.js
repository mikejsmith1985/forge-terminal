import { test, expect } from '@playwright/test';

test('inspect app UI', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await page.waitForLoadState('networkidle');
  
  // Take screenshot
  await page.screenshot({ path: 'test-results/app-state.png', fullPage: true });
  console.log('✓ Screenshot saved to test-results/app-state.png');
  
  // Log the page HTML
  const html = await page.content();
  console.log('\n=== PAGE STRUCTURE (first 3000 chars) ===');
  console.log(html.substring(0, 3000));
  
  // Check for Feedback button
  const feedbackButton = await page.locator('button:has-text("Feedback")').or(page.locator('[aria-label*="Feedback"]')).or(page.locator('text=Feedback')).first();
  const feedbackExists = await feedbackButton.isVisible().catch(() => false);
  console.log('\n=== FEEDBACK BUTTON ===');
  console.log(`Feedback button visible: ${feedbackExists}`);
  if (feedbackExists) {
    console.log('Feedback button found!');
  }
  
  // Check for ForgeAssist modal or button
  const forgeAssistButton = await page.locator('button:has-text("ForgeAssist")').or(page.locator('[aria-label*="ForgeAssist"]')).or(page.locator('text=ForgeAssist')).first();
  const forgeAssistExists = await forgeAssistButton.isVisible().catch(() => false);
  console.log('\n=== FORGEASSIST ===');
  console.log(`ForgeAssist button visible: ${forgeAssistExists}`);
  
  // Check for Ctrl+/ or similar keyboard hints
  const keyboardHints = await page.locator('text=/Ctrl|Command|⌘|\//').all();
  console.log(`Keyboard hint elements found: ${keyboardHints.length}`);
  
  // Get all buttons on the page
  const buttons = await page.locator('button').all();
  console.log(`\n=== ALL BUTTONS (${buttons.length} found) ===`);
  for (let i = 0; i < Math.min(buttons.length, 15); i++) {
    const text = await buttons[i].textContent();
    const ariaLabel = await buttons[i].getAttribute('aria-label');
    const title = await buttons[i].getAttribute('title');
    console.log(`${i + 1}. Text: "${text?.trim()}" | Aria-label: "${ariaLabel}" | Title: "${title}"`);
  }
  
  // Get major elements
  console.log('\n=== MAJOR PAGE ELEMENTS ===');
  const headings = await page.locator('h1, h2, h3').all();
  console.log(`Headings found: ${headings.length}`);
  for (let i = 0; i < Math.min(headings.length, 5); i++) {
    const text = await headings[i].textContent();
    console.log(`  - ${text?.trim()}`);
  }
  
  // Check for input fields
  const inputs = await page.locator('input, textarea').all();
  console.log(`\nInput fields found: ${inputs.length}`);
  
  // Check for specific UI components
  const modals = await page.locator('[role="dialog"], .modal, [class*="modal"]').all();
  console.log(`Modal/dialog elements found: ${modals.length}`);
  
  // List all visible links
  const links = await page.locator('a').all();
  console.log(`\nLinks found: ${links.length}`);
  for (let i = 0; i < Math.min(links.length, 8); i++) {
    const text = await links[i].textContent();
    const href = await links[i].getAttribute('href');
    console.log(`  ${i + 1}. ${text?.trim()} -> ${href}`);
  }
  
  // Check page body content
  const bodyText = await page.locator('body').textContent();
  console.log(`\n=== BODY TEXT LENGTH ===`);
  console.log(`Total characters: ${bodyText?.length}`);
  console.log(`First 500 chars:\n${bodyText?.substring(0, 500)}`);
});
