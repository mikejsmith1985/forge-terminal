const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

(async () => {
  console.log('Starting FINAL Smart Card Verification...');
  
  // NOTE: Server is assumed running via run-dev-clean.ps1

  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 800 }
  });
  
  try {
    const page = await browser.newPage();
    
    // Capture console logs
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    console.log('Navigating to http://localhost:9999...');
    await page.goto('http://localhost:9999', { waitUntil: 'domcontentloaded' });
    
    // 1. DISABLE TOUR (CRITICAL FIX)
    console.log('Disabling Guided Tour...');
    await page.evaluate(() => {
        // Use the new backdoor flag we just added to useGuidedTour.js
        localStorage.setItem('tour_disabled', 'true');
        
        // Also keep the others just in case
        localStorage.setItem('forge_tour_steps', JSON.stringify({ version: '3.4.0', completedAt: new Date().toISOString() }));
    });
    // Reload to apply tour suppression
    await page.reload({ waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));

    // Verify Tour is GONE
    const tourExists = await page.evaluate(() => !!document.querySelector('.tour-overlay'));
    if (tourExists) {
        console.error('❌ FATAL: Tour overlay still present!');
        await page.screenshot({ path: 'fatal-tour-error.png' });
        throw new Error('Tour overlay prevented testing');
    } else {
        console.log('✅ Tour overlay absent. Proceeding.');
    }

    // 2. CREATE SMART CARD
    console.log('Opening Add Command modal...');
    // Find Add button (Sidebar)
    await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const addBtn = btns.find(b => b.innerText.includes('Add') && b.closest('.sidebar-header'));
        if (addBtn) addBtn.click();
        else throw new Error('Add button not found');
    });
    
    await page.waitForSelector('.modal-body', { timeout: 3000 });
    console.log('✅ Modal opened.');

    // Fill Form with Macro Payload
    console.log('Configuring Smart Card (Zero-Click)...');
    await page.evaluate(() => {
        const inputs = document.querySelectorAll('input, textarea');
        const setVal = (name, val) => {
            const el = Array.from(inputs).find(i => i.name === name);
            if (el) {
                // React value setter hack
                const prototype = Object.getPrototypeOf(el);
                const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
                setter.call(el, val);
                el.dispatchEvent(new Event('input', { bubbles: true }));
            }
        };
        
        setVal('description', 'Final Zero-Click Test');
        setVal('command', 'Write-Host "STAGE 1: Command Executed"');
        setVal('macro_payload', 'Write-Host "STAGE 2: Macro Injected"');
        setVal('macro_delay', '1000');
    });

    // Take Screenshot of CONFIGURATION (Proof 1)
    await page.screenshot({ path: 'smart-card-config-proof.png' });
    console.log('✅ Configuration screenshot captured.');

    // Save
    await page.evaluate(() => document.querySelector('button[type="submit"]').click());
    await new Promise(r => setTimeout(r, 1000));

    // 3. EXECUTE & VERIFY
    console.log('Executing Smart Card...');
    await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.card'));
        const target = cards.find(c => c.innerText.includes('Final Zero-Click Test'));
        if (!target) throw new Error('Test card not found after save');
        target.querySelector('.btn-run').click(); // Run button
    });

    console.log('Waiting for Macro Delay (1000ms + buffer)...');
    await new Promise(r => setTimeout(r, 2500));

    // Verify Terminal Content
    const terminalText = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('.xterm-rows > div'));
        return rows.map(r => r.innerText).join('\n');
    });

    if (terminalText.includes('STAGE 1: Command Executed') && terminalText.includes('STAGE 2: Macro Injected')) {
        console.log('✅ SUCCESS: Both command and macro payload executed!');
    } else {
        console.error('❌ FAILURE: Output missing.');
        console.log('Terminal Dump:', terminalText);
        throw new Error('Zero-Click execution failed');
    }

    // Highlight Terminal for Proof
    await page.evaluate(() => {
        const term = document.querySelector('.terminal-container');
        if (term) {
            term.style.border = '4px solid #00ff00';
            term.style.boxShadow = '0 0 30px #00ff00';
        }
    });

    // Take Screenshot of EXECUTION (Proof 2)
    await page.screenshot({ path: 'smart-card-execution-proof.png' });
    console.log('✅ Execution screenshot captured.');

  } catch (error) {
    console.error('Puppeteer error:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
