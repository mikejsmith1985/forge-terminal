import { chromium } from 'playwright';

(async () => {
  try {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    console.log('\n🔍 Navigating to http://localhost:5173...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
    
    console.log('📸 Taking screenshot...');
    await page.screenshot({ path: 'test-results/app-state.png', fullPage: true });
    console.log('✓ Screenshot saved to test-results/app-state.png\n');
    
    // Get page title
    const title = await page.title();
    console.log('=== PAGE TITLE ===');
    console.log(title);
    
    // Get page URL
    console.log('\n=== PAGE URL ===');
    console.log(page.url());
    
    // Check for Feedback button
    const feedbackVisible = await page.locator('button:has-text("Feedback")').isVisible().catch(() => 
      page.locator('[aria-label*="Feedback"]').isVisible().catch(() => 
        page.locator('text=Feedback').isVisible().catch(() => false)
      )
    );
    console.log('\n=== FEEDBACK BUTTON ===');
    console.log('✓ Feedback button visible: ' + feedbackVisible);
    
    // Check for ForgeAssist
    const forgeAssistVisible = await page.locator('button:has-text("ForgeAssist")').isVisible().catch(() => 
      page.locator('[aria-label*="ForgeAssist"]').isVisible().catch(() => false)
    );
    console.log('\n=== FORGEASSIST ===');
    console.log('✓ ForgeAssist button visible: ' + forgeAssistVisible);
    
    // Check for keyboard shortcut hints
    const keyboardHints = await page.locator('text=/Ctrl|⌘|Command|Cmd/').all();
    console.log('\n=== KEYBOARD SHORTCUTS ===');
    console.log('Keyboard hint elements found: ' + keyboardHints.length);
    
    // Get all buttons
    const buttons = await page.locator('button').all();
    console.log('\n=== ALL BUTTONS (' + buttons.length + ' found) ===');
    for (let i = 0; i < Math.min(buttons.length, 15); i++) {
      const text = await buttons[i].textContent().catch(() => '(error)');
      const ariaLabel = await buttons[i].getAttribute('aria-label').catch(() => null);
      console.log('  ' + (i + 1) + '. Text: "' + (text?.trim() || '') + '" | Aria-label: "' + (ariaLabel || '') + '"');
    }
    
    // Get major headings
    const headings = await page.locator('h1, h2, h3').all();
    console.log('\n=== PAGE STRUCTURE ===');
    console.log('Headings found: ' + headings.length);
    for (let i = 0; i < Math.min(headings.length, 5); i++) {
      const text = await headings[i].textContent();
      console.log('  - ' + (text?.trim() || ''));
    }
    
    // Get input fields
    const inputs = await page.locator('input, textarea').all();
    console.log('\nInput fields: ' + inputs.length);
    
    // Get links
    const links = await page.locator('a').all();
    console.log('Links: ' + links.length);
    
    // Check for modals
    const modals = await page.locator('[role="dialog"]').all();
    console.log('Modal elements: ' + modals.length);
    
    // Get page structure (HTML)
    const html = await page.content();
    console.log('\n=== PAGE HTML STRUCTURE (first 2000 chars) ===');
    console.log(html.substring(0, 2000));
    
    // Check body text content
    const bodyText = await page.locator('body').textContent();
    console.log('\n=== PAGE TEXT CONTENT ===');
    console.log('Total characters: ' + (bodyText?.length || 0));
    console.log('\nFirst 1000 chars:');
    console.log(bodyText?.substring(0, 1000));
    
    await browser.close();
    console.log('\n✓ Inspection complete!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();
