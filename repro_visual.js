const puppeteer = require('puppeteer');

(async () => {
  console.log('Starting visual reproduction test...');
  
  // Launch browser
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  // Capture console logs
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  
  // Navigate
  const url = 'http://localhost:8333';
  console.log(`Navigating to ${url}...`);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    console.error('Navigation warning:', e.message);
  }
  
  // Wait for app to stabilize
  await new Promise(r => setTimeout(r, 2000));

  // Check for Guided Tour and skip it
  try {
    console.log('Checking for Guided Tour...');
    const tourOverlay = await page.$('.tour-overlay');
    if (tourOverlay) {
      console.log('Tour overlay detected. Looking for skip button...');
      // Try to find a button with "Skip" text
      const skipBtn = await page.evaluateHandle(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        return btns.find(b => b.textContent.includes('Skip'));
      });
      
      if (skipBtn.asElement()) {
        await skipBtn.asElement().click();
        console.log('Clicked Skip Tour button');
        await new Promise(r => setTimeout(r, 1000));
      } else {
        console.log('Skip button not found, trying .tour-skip-btn');
        const btn = await page.$('.tour-skip-btn');
        if (btn) {
            await btn.click();
            console.log('Clicked .tour-skip-btn');
            await new Promise(r => setTimeout(r, 1000));
        }
      }
    }
  } catch (e) {
    console.log('Error handling tour:', e.message);
  }
  
  // Click "Files" tab in sidebar
  try {
    console.log('Looking for Files tab...');
    const filesTab = await page.waitForSelector('.sidebar-view-tab:nth-child(2)', { timeout: 5000 });
    
    if (filesTab) {
      // Force click via evaluate to avoid interception
      await page.evaluate(el => el.click(), filesTab);
      console.log('Clicked Files tab (via evaluate)');
      
      // Wait for state change
      await new Promise(r => setTimeout(r, 1000));
      
      // Verify active state
      const isActive = await page.evaluate(el => el.classList.contains('active'), filesTab);
      if (!isActive) {
          console.error('Files tab is NOT active after click. Retrying...');
          await filesTab.click();
          await new Promise(r => setTimeout(r, 1000));
      } else {
          console.log('Files tab is active');
      }
      
      // Check for File Access Prompt
      try {
        console.log('Checking for File Access Prompt...');
        // Look for modal with specific title
        const promptHeader = await page.evaluateHandle(() => {
            const headers = Array.from(document.querySelectorAll('.modal-header h3'));
            return headers.find(h => h.textContent.includes('File Access Permissions'));
        });

        if (promptHeader.asElement()) {
             console.log('File Access Prompt detected.');
             const modal = await page.evaluateHandle(header => header.closest('.modal'), promptHeader);
             
             if (modal.asElement()) {
                 const confirmBtn = await page.evaluateHandle(m => {
                     const btns = Array.from(m.querySelectorAll('button'));
                     return btns.find(b => b.textContent.includes('Confirm Selection'));
                 }, modal);
                 
                 if (confirmBtn.asElement()) {
                     await confirmBtn.asElement().click();
                     console.log('Clicked Confirm Selection');
                     await new Promise(r => setTimeout(r, 1000));
                     
                     // Click Files tab again
                     await filesTab.click();
                     console.log('Clicked Files tab again');
                 } else {
                     console.error('Confirm button not found');
                 }
             }
        } else {
            console.log('File Access Prompt header not found');
        }
      } catch (e) {
        console.log('Error checking access prompt:', e.message);
      }
      
    } else {
      console.error('Files tab not found');
    }
  } catch (e) {
    console.log('Error finding/clicking Files tab:', e.message);
  }
  
  // Wait for file list
  try {
    console.log('Waiting for file list...');
    
    // Check for error or empty states too
    try {
        const fileItem = await page.waitForSelector('.lens-file-item', { timeout: 10000 });
        console.log('File list loaded');
    } catch (e) {
        console.log('Timeout waiting for file items. Dumping sidebar content:');
        const sidebarHTML = await page.evaluate(() => {
            const sidebar = document.querySelector('.sidebar-content');
            return sidebar ? sidebar.innerHTML : 'Sidebar content not found';
        });
        console.log(sidebarHTML.substring(0, 1000)); 
        throw e;
    }
    
    // Find specific file
    const targetFile = 'copilot-instructions.md';
    
    // Use evaluate to find the element handle
    const fileHandle = await page.evaluateHandle((target) => {
        const items = Array.from(document.querySelectorAll('.lens-file-item'));
        return items.find(item => item.textContent.includes(target));
    }, targetFile);
    
    if (fileHandle.asElement()) {
        console.log(`Found target file: ${targetFile}`);
        // Double click
        await fileHandle.asElement().click({ count: 2 });
        console.log('Double clicked file');
        
        // Wait for editor
        console.log('Waiting for editor...');
        await page.waitForSelector('.monaco-editor-wrapper', { timeout: 5000 });
        console.log('Editor opened');
        
        // Wait a bit for content to load
        await new Promise(r => setTimeout(r, 3000));
        
        // Check content
        const lineCount = await page.evaluate(() => {
            return document.querySelectorAll('.view-line').length;
        });
        console.log(`Editor line count: ${lineCount}`);

        // Debug Dimensions
        const dimensions = await page.evaluate(() => {
            const panel = document.querySelector('.editor-panel');
            const container = document.querySelector('.monaco-editor-container');
            const wrapper = document.querySelector('.monaco-editor-wrapper');
            const editor = document.querySelector('.monaco-editor');
            
            return {
                panel: panel ? { width: panel.offsetWidth, height: panel.offsetHeight } : 'not found',
                container: container ? { width: container.offsetWidth, height: container.offsetHeight, styleHeight: container.style.height, styleDisplay: container.style.display } : 'not found',
                wrapper: wrapper ? { width: wrapper.offsetWidth, height: wrapper.offsetHeight, styleHeight: wrapper.style.height } : 'not found',
                editor: editor ? { width: editor.offsetWidth, height: editor.offsetHeight } : 'not found'
            };
        });
        console.log('DOM Dimensions:', JSON.stringify(dimensions, null, 2));

        // STRICTER CHECK: The file has 38 lines. 1 line means empty or failed to render.
        if (lineCount > 5) {
            console.log('SUCCESS: Editor has meaningful content.');
        } else {
            console.error('FAILURE: Editor line count is too low (' + lineCount + '). File likely failed to load.');
            // Capture screenshot on failure
            await page.screenshot({ path: 'failure_state.png' });
        }
        
    } else {
        console.error(`File ${targetFile} not found in list`);
    }
    
  } catch (e) {
    console.error('Error during interaction:', e.message);
    await page.screenshot({ path: 'error_state.png' });
  }
  
  await browser.close();
})();
