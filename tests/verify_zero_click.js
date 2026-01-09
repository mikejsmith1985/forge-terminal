const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function checkApi() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:9999/api/commands', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const commands = JSON.parse(data);
          const freshCard = commands.find(c => c.description.includes('Copilot (Fresh)'));
          const resumeCard = commands.find(c => c.description.includes('Copilot (Resume)'));
          
          if (freshCard && resumeCard) {
            console.log('✅ API Check Passed: Both Copilot cards found.');
            if (freshCard.macro_payload && freshCard.macro_delay === 1500) {
               console.log('✅ API Check Passed: Fresh card has correct macro payload/delay.');
            } else {
               console.log('❌ API Check Failed: Fresh card missing macro fields.');
            }
            resolve(true);
          } else {
            console.log('❌ API Check Failed: Cards not found in API response.');
            console.log('Available cards:', commands.map(c => c.description));
            resolve(false);
          }
        } catch (e) {
          console.error('Failed to parse API response:', e);
          resolve(false);
        }
      });
    }).on('error', (err) => {
      console.error('API request failed:', err.message);
      resolve(false);
    });
  });
}

(async () => {
  console.log('Starting verification process...');
  
  // Start server
  const server = spawn('.\\forge-dev.exe', ['--port', '9999'], {
    stdio: 'ignore', // Keep it quiet
    detached: true
  });
  console.log('Server process spawned (PID: ' + server.pid + '). Waiting 5s...');
  
  await new Promise(r => setTimeout(r, 5000));

  // Check API first
  const apiSuccess = await checkApi();
  if (!apiSuccess) {
    console.error('API check failed. Aborting UI check.');
    process.kill(server.pid);
    process.exit(1);
  }

  // Check UI with Puppeteer
  console.log('Launching Puppeteer...');
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    
    console.log('Navigating to http://localhost:9999...');
    // Relaxed wait condition
    await page.goto('http://localhost:9999', { waitUntil: 'domcontentloaded' });
    
    // Wait for cards to render
    console.log('Waiting for command cards...');
    await page.waitForSelector('.command-cards-container', { timeout: 10000 });
    
    // Wait a bit more for React to hydrate
    await new Promise(r => setTimeout(r, 2000));

    // Find and highlight the cards
    const cardFound = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.card'));
        let foundCount = 0;
        
        cards.forEach(card => {
            const text = card.innerText;
            if (text.includes('Copilot (Fresh)') || text.includes('Copilot (Resume)')) {
                // Highlight found cards
                card.style.border = '4px solid #f00';
                card.style.boxShadow = '0 0 20px #f00';
                card.scrollIntoView({ behavior: 'instant', block: 'center' });
                foundCount++;
            }
        });
        return foundCount;
    });

    console.log(`Found and highlighted ${cardFound} target cards.`);
    
    if (cardFound === 0) {
        console.log("Dumping page text content for debugging:");
        const text = await page.evaluate(() => document.body.innerText);
        console.log(text.substring(0, 1000)); // First 1000 chars
        throw new Error("Cards not found in DOM");
    }

    // Take screenshot
    const screenshotPath = path.resolve('zero-click-proof.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`✅ Screenshot saved to: ${screenshotPath}`);
    
    // Check if the card text exists on page
    const content = await page.content();
    if (content.includes('Copilot (Fresh)') && content.includes('Copilot (Resume)')) {
       console.log('✅ UI Verification Passed: Card text found in DOM.');
    } else {
       console.log('❌ UI Verification Failed: Card text NOT found in DOM.');
    }

  } catch (error) {
    console.error('Puppeteer error:', error);
  } finally {
    await browser.close();
    process.kill(server.pid);
    console.log('Verification complete.');
  }
})();
