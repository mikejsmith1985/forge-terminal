import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

async function testTour() {
  const browser = await puppeteer.launch({ 
    headless: false,
    defaultViewport: { width: 1920, height: 1080 }
  });
  
  const page = await browser.newPage();
  
  // Clear tour completion
  await page.goto('http://localhost:8333');
  await page.evaluate(() => {
    localStorage.removeItem('forge_tour_completed');
  });
  await page.reload();
  
  console.log('Waiting for tour...');
  await page.waitForTimeout(3000);
  
  // Check if tour overlay exists
  const tourExists = await page.$('.tour-overlay');
  if (!tourExists) {
    console.log('❌ Tour overlay not found!');
    await browser.close();
    return;
  }
  
  console.log('✅ Tour overlay found');
  
  // Get tour z-index
  const tourZIndex = await page.evaluate(() => {
    const overlay = document.querySelector('.tour-overlay');
    return window.getComputedStyle(overlay).zIndex;
  });
  console.log(`Tour z-index: ${tourZIndex}`);
  
  let stepNum = 1;
  const resultsDir = './test-results';
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  
  while (true) {
    const tooltip = await page.$('.tour-tooltip');
    if (!tooltip) {
      console.log('No more tour steps');
      break;
    }
    
    // Get step title
    const title = await page.$eval('.tour-tooltip-title', el => el.textContent).catch(() => 'Unknown');
    console.log(`\nStep ${stepNum}: ${title}`);
    
    // Get tooltip position
    const tooltipBox = await tooltip.boundingBox();
    const viewport = page.viewport();
    
    console.log(`  Tooltip: x=${Math.round(tooltipBox.x)}, y=${Math.round(tooltipBox.y)}, w=${Math.round(tooltipBox.width)}, h=${Math.round(tooltipBox.height)}`);
    
    // Check for cutoffs
    if (tooltipBox.y < 0) {
      console.log(`  ❌ CUT OFF AT TOP! (y=${Math.round(tooltipBox.y)})`);
    }
    if (tooltipBox.y + tooltipBox.height > viewport.height) {
      console.log(`  ❌ CUT OFF AT BOTTOM!`);
    }
    if (tooltipBox.x < 0) {
      console.log(`  ❌ CUT OFF AT LEFT!`);
    }
    if (tooltipBox.x + tooltipBox.width > viewport.width) {
      console.log(`  ❌ CUT OFF AT RIGHT!`);
    }
    
    // Check for modals in front
    const forgeAssist = await page.$('.forge-assist-modal');
    const settings = await page.$('.settings-modal');
    
    if (forgeAssist && await forgeAssist.isVisible()) {
      const modalZIndex = await page.evaluate(() => {
        const modal = document.querySelector('.forge-assist-overlay');
        return window.getComputedStyle(modal).zIndex;
      });
      console.log(`  ⚠️  Forge Assist visible (z-index: ${modalZIndex})`);
    }
    
    if (settings && await settings.isVisible()) {
      const modalZIndex = await page.evaluate(() => {
        const modal = document.querySelector('.modal-overlay');
        return window.getComputedStyle(modal).zIndex;
      });
      console.log(`  ⚠️  Settings modal visible (z-index: ${modalZIndex})`);
    }
    
    // Take screenshot
    const filename = `tour-step-${stepNum}-${title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.png`;
    await page.screenshot({ path: path.join(resultsDir, filename), fullPage: true });
    console.log(`  📸 Screenshot saved: ${filename}`);
    
    // Click next
    const nextBtn = await page.$('.tour-btn-next');
    if (!nextBtn) {
      console.log('  No next button - tour complete');
      break;
    }
    
    await nextBtn.click();
    await page.waitForTimeout(1500);
    stepNum++;
    
    if (stepNum > 20) {
      console.log('Stopping after 20 steps');
      break;
    }
  }
  
  console.log(`\n✅ Test complete. Captured ${stepNum} steps.`);
  console.log(`Screenshots saved to: ${path.resolve(resultsDir)}`);
  
  await page.waitForTimeout(2000);
  await browser.close();
}

testTour().catch(console.error);
