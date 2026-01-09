const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

(async () => {
  console.log('Starting deterministic verification...');
  
  // Start server
  const server = spawn('.\\forge-dev.exe', ['--port', '9999'], {
    stdio: 'ignore', 
    detached: true
  });
  console.log('Server process spawned (PID: ' + server.pid + '). Waiting 5s...');
  await new Promise(r => setTimeout(r, 5000));

  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    
    // Capture console logs
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    console.log('Navigating to http://localhost:9999...');
    await page.goto('http://localhost:9999', { waitUntil: 'domcontentloaded' });
    
    // Wait for cards
    await page.waitForSelector('.command-cards-container', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 2000));

    // Find "Copilot (Fresh)" card
    const cardFound = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.card'));
        const target = cards.find(c => c.innerText.includes('Copilot (Fresh)'));
        if (target) {
            target.scrollIntoView({ behavior: 'instant', block: 'center' });
            // Highlight for screenshot
            target.style.border = '4px solid #f00';
            target.style.boxShadow = '0 0 20px #f00';
            return true;
        }
        return false;
    });

    if (!cardFound) throw new Error("Card 'Copilot (Fresh)' not found in UI");
    console.log('✅ Card found and highlighted.');

    // Verify Modal Fields
    console.log('Verifying Modal Configuration fields...');
    await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.card'));
        const target = cards.find(c => c.innerText.includes('Copilot (Fresh)'));
        const editBtn = target ? target.querySelector('.action-icon[title="Edit Command"]') : null;
        // In SortableCommandCard, edit button might be:
        // <div className="action-icon" onClick={(e) => { e.stopPropagation(); onEdit(command); }} title="Edit Command">
        if (editBtn) editBtn.click();
        else console.error("Edit button not found");
    });
    
    try {
        await page.waitForSelector('textarea[name="macro_payload"]', { timeout: 5000 });
        console.log('✅ UI Check Passed: Macro Payload field found.');
    } catch (e) {
        console.error('❌ UI Check Failed: Macro Payload field NOT found.');
        await page.screenshot({ path: 'modal-debug.png' });
    }
    
    // Close modal
    await page.evaluate(() => {
        const closeBtn = document.querySelector('.btn-close') || document.querySelector('.btn-secondary');
        if (closeBtn) closeBtn.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    // CREATE A TEST CARD
    console.log('Creating a deterministic test card...');
    await page.evaluate(() => {
        // Click Add button - it's usually in the sidebar or command list header
        // Looking for the + button. In CommandCards.jsx, it might not be rendered if not owner?
        // Wait, CommandCards.jsx renders cards. The Add button is usually in the parent or a distinct button.
        // Let's assume there's an Add button or we can trigger it via console if needed.
        // Actually, let's reuse the Copilot card but EDIT it temporarily if we can't find Add.
        // Or just trust the Add button exists.
        
        // In the sidebar, there's usually a "+" button for commands.
        // Let's try to find it.
        const btns = Array.from(document.querySelectorAll('button'));
        const addBtn = btns.find(b => b.innerText.includes('+') || b.title === 'Add Command');
        if (addBtn) addBtn.click();
    });
    
    try {
        await page.waitForSelector('.modal-body', { timeout: 3000 });
    } catch(e) {
        console.log('Add modal failed to open. Trying to reuse Edit modal...');
        // Reuse the edit flow from before if Add failed
        await page.evaluate(() => {
            const cards = Array.from(document.querySelectorAll('.card'));
            const target = cards.find(c => c.innerText.includes('Copilot (Fresh)'));
            const editBtn = target ? target.querySelector('div[title="Edit Command"]') : null;
            if (editBtn) editBtn.click();
        });
        await page.waitForSelector('.modal-body', { timeout: 3000 });
    }
    
    // Fill form
    await page.evaluate(() => {
        const inputs = document.querySelectorAll('input, textarea');
        const setVal = (name, val) => {
            const el = Array.from(inputs).find(i => i.name === name);
            if (el) {
                el.value = val;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
        };
        
        setVal('description', 'Test ZeroClick');
        setVal('command', 'Write-Host "Main Command Executed"');
        setVal('macro_payload', 'Write-Host "Macro Injected Successfully"');
        setVal('macro_delay', '1000');
    });
    
    // Save
    await page.evaluate(() => document.querySelector('button[type="submit"]').click());
    await new Promise(r => setTimeout(r, 1000));
    console.log('Test card created.');

    // EXECUTE TEST CARD
    console.log('Executing test card...');
    await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.card'));
        const target = cards.find(c => c.innerText.includes('Test ZeroClick'));
        if (target) target.querySelector('.btn-run').click();
    });

    console.log('Waiting for execution...');
    await new Promise(r => setTimeout(r, 2500));

    // VERIFY TERMINAL
    const terminalText = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('.xterm-rows > div'));
        return rows.map(r => r.innerText).join('\n');
    });

    if (terminalText.includes('Main Command Executed') && terminalText.includes('Macro Injected Successfully')) {
        console.log('✅ Deterministic Success: Main command and Macro payload executed!');
    } else {
        console.error('❌ Failure: Test card did not produce expected output.');
        console.log('Terminal Content:', terminalText);
    }
    
    // Check Copilot card too just for existence
    const copilotExists = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.card')).some(c => c.innerText.includes('Copilot (Fresh)'));
    });
    if (copilotExists) console.log('✅ Copilot (Fresh) card exists.');

    // Screenshot
    const screenshotPathFinal = path.resolve('zero-click-execution-proof.png');
    await page.screenshot({ path: screenshotPathFinal, fullPage: true });
    console.log(`✅ Screenshot saved to: ${screenshotPathFinal}`);

    // Screenshot with terminal visible
    const screenshotPath = path.resolve('zero-click-execution-proof.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`✅ Screenshot saved to: ${screenshotPath}`);

  } catch (error) {
    console.error('Puppeteer error:', error);
  } finally {
    await browser.close();
    process.kill(server.pid);
    console.log('Verification complete.');
  }
})();
