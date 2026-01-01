/**
 * Comprehensive AM Logging Test
 * Tests the complete AM logging system with real LLM conversation
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function testAMLogging() {
  console.log('🚀 Starting AM Logging Test\n');
  
  const browser = await chromium.launch({ 
    headless: false,
    args: ['--start-maximized']
  });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  try {
    // Step 1: Open Forge Terminal
    console.log('📱 Step 1: Opening Forge Terminal...');
    await page.goto('http://localhost:8333', { timeout: 60000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    // Take screenshot
    await page.screenshot({ path: './test-results/am-test-1-initial.png', fullPage: true });
    console.log('   ✅ Forge Terminal loaded\n');
    
    // Step 2: Check AM Monitor initial state
    console.log('📊 Step 2: Checking AM Monitor...');
    const amMonitor = page.locator('.am-monitor');
    
    if (await amMonitor.isVisible()) {
      const statusText = await amMonitor.textContent();
      console.log(`   Current status: ${statusText}`);
      
      await page.screenshot({ path: './test-results/am-test-2-monitor-initial.png' });
      console.log('   ✅ AM Monitor visible\n');
    } else {
      console.log('   ⚠️  AM Monitor not visible\n');
    }
    
    // Step 3: Wait for terminal to be ready
    console.log('⌨️  Step 3: Waiting for terminal...');
    await page.waitForSelector('.xterm', { timeout: 10000 });
    await page.waitForTimeout(2000);
    console.log('   ✅ Terminal ready\n');
    
    // Step 4: Start copilot with gpt-5-mini
    console.log('🤖 Step 4: Starting Copilot CLI...');
    await page.keyboard.type('copilot --model gpt-5-mini');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(5000);
    
    await page.screenshot({ path: './test-results/am-test-3-copilot-start.png', fullPage: true });
    console.log('   ✅ Copilot started\n');
    
    // Step 5: Have a real conversation
    console.log('💬 Step 5: Having LLM conversation...');
    
    const prompts = [
      'What is 2+2?',
      'Tell me a short joke',
      'What is the capital of France?'
    ];
    
    for (let i = 0; i < prompts.length; i++) {
      console.log(`   Prompt ${i + 1}: "${prompts[i]}"`);
      await page.keyboard.type(prompts[i]);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(8000); // Wait for response
      
      await page.screenshot({ 
        path: `./test-results/am-test-4-conversation-${i + 1}.png`,
        fullPage: true 
      });
    }
    console.log('   ✅ Conversation complete\n');
    
    // Step 6: Check AM Monitor status
    console.log('📊 Step 6: Checking AM Monitor after conversation...');
    await page.waitForTimeout(2000);
    
    if (await amMonitor.isVisible()) {
      const statusText = await amMonitor.textContent();
      const statusColor = await amMonitor.evaluate(el => {
        return window.getComputedStyle(el).backgroundColor;
      });
      
      console.log(`   Status text: ${statusText}`);
      console.log(`   Status color: ${statusColor}`);
      
      await page.screenshot({ path: './test-results/am-test-5-monitor-after.png' });
    }
    console.log('');
    
    // Step 7: Check if log files were created
    console.log('📁 Step 7: Checking for AM log files...');
    const amLogDir = path.join(process.env.USERPROFILE || process.env.HOME, '.forge', 'am');
    
    if (fs.existsSync(amLogDir)) {
      const files = fs.readdirSync(amLogDir);
      const recentFiles = files
        .map(f => ({
          name: f,
          time: fs.statSync(path.join(amLogDir, f)).mtime
        }))
        .filter(f => Date.now() - f.time < 60000) // Files from last minute
        .sort((a, b) => b.time - a.time);
      
      console.log(`   Found ${recentFiles.length} recent files:`);
      recentFiles.forEach(f => {
        console.log(`     - ${f.name} (${new Date(f.time).toLocaleTimeString()})`);
      });
      
      if (recentFiles.length > 0) {
        console.log('   ✅ AM logs are being created!\n');
      } else {
        console.log('   ❌ No recent log files found!\n');
      }
    } else {
      console.log(`   ❌ AM log directory does not exist: ${amLogDir}\n`);
    }
    
    // Step 8: Check Forge error logs
    console.log('📋 Step 8: Checking Forge error logs...');
    const errorLogPath = path.join(__dirname, 'forge-error.log');
    if (fs.existsSync(errorLogPath)) {
      const errorLog = fs.readFileSync(errorLogPath, 'utf-8');
      const recentErrors = errorLog.split('\n').slice(-20).join('\n');
      
      if (recentErrors.includes('AM') || recentErrors.includes('error')) {
        console.log('   ⚠️  Found errors in log:');
        console.log(recentErrors);
      } else {
        console.log('   ✅ No AM-related errors in log\n');
      }
    }
    
    // Final screenshot
    await page.screenshot({ path: './test-results/am-test-6-final.png', fullPage: true });
    
    console.log('\n✅ AM Logging Test Complete!');
    console.log(`📸 Screenshots saved to: ${path.resolve('./test-results')}`);
    
    await page.waitForTimeout(5000);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    await page.screenshot({ path: './test-results/am-test-ERROR.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

testAMLogging();
