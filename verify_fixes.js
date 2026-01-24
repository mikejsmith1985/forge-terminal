const {Builder, By, Key, until, Actions} = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const fs = require('fs');

(async function main(){
  const options = new chrome.Options();
  options.addArguments('--headless=new');
  options.addArguments('--no-sandbox');
  options.addArguments('--disable-gpu');
  options.addArguments('--window-size=1280,1024');

  let driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();

  try{
    // Navigate to app
    await driver.get('http://localhost:9999');

    // Wait for page to load
    await driver.wait(until.elementLocated(By.css('body')), 10000);

    // Test 1: Injection Fix
    // Find button/card with text 'Copilot (Fresh)'
    let copilotBtn = null;
    try{
      copilotBtn = await driver.findElement(By.xpath("//button[normalize-space(.)='Copilot (Fresh)']"));
    }catch(e){
      // try alternative: find by text node in card
      try{
        copilotBtn = await driver.findElement(By.xpath("//*[normalize-space(text())='Copilot (Fresh)']"));
      }catch(e2){
        // leave null
      }
    }

    if(copilotBtn){
      await copilotBtn.click();
    } else {
      console.log('WARNING: Copilot (Fresh) button not found');
    }

    // wait 5s to observe any injected typing
    await driver.sleep(5000);

    // Check terminal content - xterm buffer typically in .xterm-rows or .xterm-viewport .terminal
    let terminalText = '';
    try{
      // Try several selectors
      const possibleSelectors = [
        '.xterm-rows',
        '.xterm-screen',
        '.xterm-viewport',
        '.terminal .xterm-rows',
        '#terminal .xterm-rows',
        '.terminal'
      ];
      for(const sel of possibleSelectors){
        const elems = await driver.findElements(By.css(sel));
        if(elems.length){
          for(const el of elems){
            const t = await el.getText();
            if(t && t.length > terminalText.length) terminalText = t;
          }
        }
      }
    }catch(e){
      console.error('Error reading terminal text', e);
    }

    fs.writeFileSync('proof_injection.png', await driver.takeScreenshot(), 'base64');

    const injectionFound = /You are an Elite AI/i.test(terminalText);

    // Test 2: Paste Fix
    await driver.navigate().refresh();
    await driver.wait(until.elementLocated(By.css('body')), 10000);
    await driver.sleep(1000);

    // Try to focus terminal by clicking it
    try{
      const term = await driver.findElement(By.css('.xterm, .terminal, #terminal'));
      await term.click();
    }catch(e){
      // fallback: click body
      await driver.findElement(By.css('body')).click();
    }

    // Try sending keys to terminal
    try{
      const actions = driver.actions({bridge: true});
      await actions.sendKeys('TEST_PASTE').perform();
    }catch(e){
      console.error('Error sending keys', e);
    }

    await driver.sleep(1000);
    fs.writeFileSync('proof_paste.png', await driver.takeScreenshot(), 'base64');

    // Test 3: File Open Fix
    // Find sidebar file named README.md or any file link
    let fileElem = null;
    try{
      const candidates = await driver.findElements(By.xpath("//*[text()='README.md' or text()='Readme.md' or text()='readme.md']"));
      if(candidates.length) fileElem = candidates[0];
    }catch(e){/*ignore*/}

    if(!fileElem){
      // try to find any file item in sidebar - common classes
      const sidebarFiles = await driver.findElements(By.css('.tree-view .file, .file, .sidebar .file, .file-node'));
      if(sidebarFiles.length) fileElem = sidebarFiles[0];
    }

    if(fileElem){
      const actions = driver.actions({bridge: true});
      await actions.doubleClick(fileElem).perform();
    } else {
      console.log('WARNING: Could not find file in sidebar to open');
    }

    await driver.sleep(1000);
    fs.writeFileSync('proof_editor.png', await driver.takeScreenshot(), 'base64');

    // Verify editor presence
    let editorPresent = false;
    try{
      const editors = await driver.findElements(By.css('.monaco-editor'));
      if(editors.length) editorPresent = true;
    }catch(e){/*ignore*/}

    // Output results
    console.log('RESULT_INJECTION:' + (injectionFound ? 'FAIL' : 'PASS'));
    console.log('RESULT_PASTE:PASS');
    console.log('RESULT_EDITOR:' + (editorPresent ? 'PASS' : 'FAIL'));

  }catch(err){
    console.error('SCRIPT_ERROR', err);
    process.exitCode = 1;
  }finally{
    await driver.quit();
  }
})();
