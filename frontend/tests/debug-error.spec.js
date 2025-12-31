import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.use({ baseURL: 'http://localhost:3005' });

test('Capture frontend initialization error', async ({ page }) => {
  const consoleErrors = [];
  const pageErrors = [];

  // Capture console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  // Capture page errors
  page.on('pageerror', error => {
    pageErrors.push({
      message: error.message,
      stack: error.stack
    });
  });

  // Navigate to the app - use relative URL since we set baseURL
  await page.goto('/', { 
    waitUntil: 'networkidle',
    timeout: 10000 
  });

  // Wait a bit for any errors to appear
  await page.waitForTimeout(2000);

  // Take screenshot
  await page.screenshot({ 
    path: 'debug-screenshot-error.png',
    fullPage: true 
  });

  // Log all errors
  console.log('\n=== CONSOLE ERRORS ===');
  consoleErrors.forEach(err => console.log(err));
  
  console.log('\n=== PAGE ERRORS ===');
  pageErrors.forEach(err => {
    console.log('Message:', err.message);
    console.log('Stack:', err.stack);
  });

  // Save errors to file
  const errorReport = {
    timestamp: new Date().toISOString(),
    consoleErrors,
    pageErrors,
    url: page.url(),
    title: await page.title()
  };

  fs.writeFileSync(
    path.join(__dirname, '../debug-error-report.json'),
    JSON.stringify(errorReport, null, 2)
  );

  console.log('\n=== Screenshot saved to debug-screenshot-error.png ===');
  console.log('=== Error report saved to debug-error-report.json ===\n');
});
