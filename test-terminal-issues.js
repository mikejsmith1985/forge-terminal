// Test script to reproduce terminal issues
const { chromium } = require('playwright');

async function testForgeTerminal() {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('[TEST] Opening Forge at http://localhost:9999');
    await page.goto('http://localhost:9999');
    await page.waitForTimeout(3000);

    // Test 1: Create multiple tabs
    console.log('\n[TEST 1] Creating 3 terminal tabs...');
    
    // Wait for initial tab to load
    await page.waitForSelector('.terminal', { timeout: 10000 });
    console.log('  ✓ Tab 1 loaded');

    // Create tab 2
    await page.click('button[title="New Terminal Tab"]');
    await page.waitForTimeout(2000);
    console.log('  ✓ Tab 2 created');

    // Create tab 3
    await page.click('button[title="New Terminal Tab"]');
    await page.waitForTimeout(2000);
    console.log('  ✓ Tab 3 created');

    // Get all tab buttons
    const tabs = await page.$$('.tab-button');
    console.log(`  Total tabs: ${tabs.length}`);

    // Test 2: Switch to tab 2, then back to tab 1
    console.log('\n[TEST 2] Switching tabs to reproduce text cut-off...');
    
    // Click tab 2
    await tabs[1].click();
    await page.waitForTimeout(1000);
    console.log('  ✓ Switched to tab 2');

    // Click tab 1
    await tabs[0].click();
    await page.waitForTimeout(1000);
    console.log('  ✓ Switched back to tab 1');

    // Take screenshot of tab 1
    const screenshot1 = await page.screenshot({ path: 'test-tab1-cutoff.png' });
    console.log('  ✓ Screenshot saved: test-tab1-cutoff.png');

    // Measure terminal dimensions
    const terminalInfo = await page.evaluate(() => {
        const terminal = document.querySelector('.terminal');
        const xtermScreen = document.querySelector('.xterm-screen');
        const xtermViewport = document.querySelector('.xterm-viewport');
        
        if (!terminal) return { error: 'No terminal found' };
        
        const rect = terminal.getBoundingClientRect();
        const screenRect = xtermScreen?.getBoundingClientRect();
        const viewportRect = xtermViewport?.getBoundingClientRect();
        
        return {
            terminal: {
                width: rect.width,
                height: rect.height,
                left: rect.left,
                top: rect.top
            },
            screen: screenRect ? {
                width: screenRect.width,
                height: screenRect.height,
                left: screenRect.left
            } : null,
            viewport: viewportRect ? {
                width: viewportRect.width,
                height: viewportRect.height,
                left: viewportRect.left
            } : null
        };
    });
    
    console.log('  Terminal dimensions:', JSON.stringify(terminalInfo, null, 2));

    // Test 3: Test Ctrl+V paste
    console.log('\n[TEST 3] Testing Ctrl+V paste...');
    
    // Set clipboard content
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.evaluate(() => navigator.clipboard.writeText('echo "test paste"'));
    
    // Focus terminal
    await page.click('.xterm-helper-textarea');
    await page.waitForTimeout(500);
    
    // Press Ctrl+V
    await page.keyboard.press('Control+KeyV');
    await page.waitForTimeout(1000);
    
    // Check console for paste logs
    const pasteLogs = await page.evaluate(() => {
        const logs = [];
        const originalLog = console.log;
        console.log = (...args) => {
            logs.push(args.join(' '));
            originalLog(...args);
        };
        return logs.filter(log => log.includes('paste') || log.includes('Paste'));
    });
    
    console.log('  Paste console logs:', pasteLogs);
    
    // Take screenshot
    await page.screenshot({ path: 'test-paste.png' });
    console.log('  ✓ Screenshot saved: test-paste.png');

    // Test 4: Test right-click paste
    console.log('\n[TEST 4] Testing right-click paste...');
    
    // Right-click on terminal
    await page.click('.xterm-helper-textarea', { button: 'right' });
    await page.waitForTimeout(500);
    
    // Check if context menu appears
    const contextMenu = await page.$('.context-menu, [role="menu"]');
    console.log(`  Context menu found: ${contextMenu !== null}`);
    
    if (contextMenu) {
        // Look for paste option
        const pasteOption = await page.$('text=/paste/i');
        if (pasteOption) {
            await pasteOption.click();
            await page.waitForTimeout(1000);
            console.log('  ✓ Clicked paste from context menu');
        } else {
            console.log('  ⚠ No paste option in context menu');
        }
    } else {
        console.log('  ⚠ No context menu appeared');
    }

    // Take final screenshot
    await page.screenshot({ path: 'test-final.png' });
    console.log('  ✓ Screenshot saved: test-final.png');

    console.log('\n[TEST COMPLETE] Check screenshots for visual proof');
    console.log('  - test-tab1-cutoff.png: Terminal after tab switch');
    console.log('  - test-paste.png: After Ctrl+V');
    console.log('  - test-final.png: After right-click paste');

    // Keep browser open for manual inspection
    console.log('\n[WAITING] Browser will stay open for 60 seconds for manual inspection...');
    await page.waitForTimeout(60000);

    await browser.close();
}

testForgeTerminal().catch(console.error);
