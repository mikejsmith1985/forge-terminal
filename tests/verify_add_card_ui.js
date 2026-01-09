const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('Starting Add Card UI Verification...');
  
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1000, height: 800 } // Typical laptop resolution
  });
  
  try {
    const page = await browser.newPage();
    
    console.log('Navigating to http://localhost:9999...');
    await page.goto('http://localhost:9999', { waitUntil: 'domcontentloaded' });
    
    // DISABLE TOUR
    await page.evaluate(() => {
        localStorage.setItem('tour_disabled', 'true');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));

    // Open Add Command modal
    console.log('Opening Add Command modal...');
    await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const addBtn = btns.find(b => b.innerText.includes('Add') && b.closest('.sidebar-header'));
        if (addBtn) addBtn.click();
        else throw new Error('Add button not found');
    });
    
    await page.waitForSelector('.modal-body', { timeout: 3000 });
    console.log('✅ Modal opened.');
    
    // Wait for animation
    await new Promise(r => setTimeout(r, 500));

    // Verify textarea height
    const textareaHeight = await page.evaluate(() => {
        const ta = document.querySelector('textarea[name="command"]');
        return ta.offsetHeight;
    });
    console.log(`Textarea height: ${textareaHeight}px`);
    
    if (textareaHeight < 110) { // Should be around 120 + padding
        console.warn(`WARNING: Textarea height ${textareaHeight}px seems small.`);
    }

    // Scroll to bottom to show all fields
    await page.evaluate(() => {
        const body = document.querySelector('.modal-body');
        body.scrollTop = body.scrollHeight;
    });
    
    // Highlight interesting elements
    await page.evaluate(() => {
        const ta = document.querySelector('textarea[name="command"]');
        if (ta) {
            ta.style.border = '2px solid #00ffff'; // Cyan for textarea
            ta.style.boxShadow = '0 0 10px #00ffff';
        }
        
        const macroPayload = document.querySelector('textarea[name="macro_payload"]');
        if (macroPayload) {
            macroPayload.style.border = '2px solid #ff00ff'; // Magenta for macro
            macroPayload.style.boxShadow = '0 0 10px #ff00ff';
        }
    });

    // Take Screenshot
    await page.screenshot({ path: 'modal-ui-proof.png' });
    console.log('✅ Modal UI screenshot captured.');

  } catch (error) {
    console.error('Puppeteer error:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
