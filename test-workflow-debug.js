const { chromium } = require('playwright');

(async () => {
  // Create browser context with no cache
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    bypassCSP: true,
    // Disable cache
  });
  
  // Clear any existing cache
  await context.clearCookies();
  
  const page = await context.newPage();
  
  // Bypass cache for all requests
  await page.route('**/*', route => {
    const request = route.request();
    if (request.resourceType() === 'script' || request.resourceType() === 'stylesheet') {
      route.continue({
        headers: {
          ...request.headers(),
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
    } else {
      route.continue();
    }
  });
  
  // Capture ALL console messages
  page.on('console', msg => {
    console.log('BROWSER:', msg.type(), msg.text());
  });
  
  // Capture page errors
  page.on('pageerror', error => {
    console.log('PAGE ERROR:', error.message);
  });
  
  try {
    await page.goto('http://localhost:8080');
    await page.waitForSelector('.app', { timeout: 10000 });
    console.log('✓ App loaded');
    
    // Click Workflows tab
    const flowsTab = page.locator('button.sidebar-view-tab').filter({ hasText: 'Flows' });
    await flowsTab.click();
    await page.waitForTimeout(500);
    console.log('✓ Clicked Flows tab');
    
    // Look for the new workflow button
    const btnNewWorkflow = await page.locator('.btn-new-workflow').count();
    console.log('btn-new-workflow count:', btnNewWorkflow);
    
    const workflowCardCount = await page.locator('.workflow-card').count();
    console.log('Workflow cards visible:', workflowCardCount);
    
    if (btnNewWorkflow > 0) {
      // Click the first button with force
      const btn = page.locator('.btn-new-workflow').first();
      const btnText = await btn.textContent();
      console.log('Button text:', btnText);
      
      await btn.click({ force: true });
      console.log('✓ Clicked New Workflow button');
      
      // Wait longer and check for canvas
      await page.waitForTimeout(3000);
      
      const canvasVisible = await page.locator('.workflow-canvas-fullscreen').isVisible();
      console.log('Canvas visible after click:', canvasVisible);
      
      // Check what's rendered in the DOM
      const allWorkflowDivs = await page.locator('[class*="workflow"]').count();
      console.log('Total elements with "workflow" class:', allWorkflowDivs);
      
      if (canvasVisible) {
        console.log('✓ SUCCESS: Workflow canvas opened!');
      } else {
        console.log('✗ FAIL: Canvas not visible');
        await page.screenshot({ path: 'workflow-debug.png', fullPage: true });
        console.log('Screenshot saved');
      }
    } else {
      console.log('No new workflow button found');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
})();
