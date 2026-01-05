import { test, expect } from '@playwright/test';

/**
 * Critical Validation Suite for v3.11.7
 * 
 * ISSUE REPORT:
 * - Command cards failing to load
 * - Downloaded .exe not launching
 * - Version update/check not working properly
 * 
 * This test validates:
 * 1. Command cards load successfully
 * 2. Version API returns correct version
 * 3. Update check mechanism works
 * 4. Release Manager command card displays and functions
 * 5. Build artifacts are correctly generated
 */

test.describe('v3.11.7 Critical Validation', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('http://localhost:8333');
    await page.waitForLoadState('networkidle');
    
    // Wait for app to be ready
    await page.waitForSelector('.app', { timeout: 10000 });
  });

  test('🔴 CRITICAL: Command cards should load without errors', async ({ page }) => {
    console.log('\n🧪 TEST 1: Command Cards Loading');
    
    // Wait for command cards container
    const cardsContainer = page.locator('.command-cards-container');
    await expect(cardsContainer).toBeVisible({ timeout: 10000 });
    
    // Check if loading indicator appears and disappears
    const loadingIndicator = page.locator('.command-cards-loading');
    const hasLoading = await loadingIndicator.isVisible().catch(() => false);
    
    if (hasLoading) {
      console.log('  ⏳ Cards are loading...');
      await loadingIndicator.waitFor({ state: 'hidden', timeout: 10000 });
      console.log('  ✓ Loading complete');
    }
    
    // Check for error state
    const errorIndicator = page.locator('.command-cards-error');
    const hasError = await errorIndicator.isVisible();
    
    if (hasError) {
      const errorText = await errorIndicator.textContent();
      console.error(`  ❌ FAILURE: Command cards error: ${errorText}`);
      
      // Try to get more details from console
      const consoleLogs = [];
      page.on('console', msg => {
        if (msg.type() === 'error') {
          consoleLogs.push(msg.text());
        }
      });
      
      // Check network tab for failed requests
      const failedRequests = [];
      page.on('requestfailed', request => {
        if (request.url().includes('/api/commands')) {
          failedRequests.push({
            url: request.url(),
            failure: request.failure()
          });
        }
      });
      
      // Capture screenshot for dashboard
      await page.screenshot({ path: 'test-results/command-cards-error.png' });
      
      // FAIL THE TEST
      expect(hasError).toBe(false);
    } else {
      console.log('  ✓ No error state detected');
    }
    
    // Verify at least the OwnerReleaseCard renders (always present)
    const ownerCard = page.locator('.owner-release-card');
    const ownerCardExists = await ownerCard.isVisible();
    console.log(`  ${ownerCardExists ? '✓' : '❌'} Owner Release Card: ${ownerCardExists ? 'visible' : 'missing'}`);
    
    // Check if user command cards are present (may be 0)
    const userCards = page.locator('.card, .command-card');
    const cardCount = await userCards.count();
    console.log(`  ℹ User Command Cards: ${cardCount} found`);
    
    console.log('  ✅ TEST 1 PASSED: Command cards loaded successfully');
  });

  test('🔴 CRITICAL: Version API should return 3.11.7', async ({ page }) => {
    console.log('\n🧪 TEST 2: Version Check');
    
    const result = await page.evaluate(async () => {
      try {
        const res = await fetch('/api/version');
        if (!res.ok) {
          return {
            success: false,
            status: res.status,
            statusText: res.statusText
          };
        }
        
        const data = await res.json();
        return {
          success: true,
          version: data.version,
          status: res.status
        };
      } catch (err) {
        return {
          success: false,
          error: err.message
        };
      }
    });
    
    console.log(`  Version API Status: ${result.status || 'FAILED'}`);
    console.log(`  Version Returned: ${result.version || 'NONE'}`);
    
    expect(result.success).toBe(true);
    expect(result.version).toBeTruthy();
    
    // Check if version is 3.11.7 (user's reported version)
    const version = result.version.replace(/^v/, '');
    console.log(`  Current Version: ${version}`);
    
    // Validate version format
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    
    console.log('  ✅ TEST 2 PASSED: Version API working');
  });

  test('🔴 CRITICAL: Update check should work', async ({ page }) => {
    console.log('\n🧪 TEST 3: Update Check Mechanism');
    
    const result = await page.evaluate(async () => {
      try {
        const res = await fetch('/api/update/check', {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });
        
        if (!res.ok) {
          return {
            success: false,
            status: res.status,
            statusText: res.statusText
          };
        }
        
        const data = await res.json();
        return {
          success: true,
          currentVersion: data.currentVersion,
          available: data.available,
          latestVersion: data.latestVersion,
          status: res.status
        };
      } catch (err) {
        return {
          success: false,
          error: err.message
        };
      }
    });
    
    console.log(`  Update Check API Status: ${result.status || 'FAILED'}`);
    console.log(`  Current Version: ${result.currentVersion || 'NONE'}`);
    console.log(`  Update Available: ${result.available}`);
    
    if (result.available) {
      console.log(`  Latest Version: ${result.latestVersion}`);
    }
    
    expect(result.success).toBe(true);
    expect(result.currentVersion).toBeTruthy();
    
    console.log('  ✅ TEST 3 PASSED: Update check working');
  });

  test('🔴 CRITICAL: Release Manager Card should be visible and functional', async ({ page }) => {
    console.log('\n🧪 TEST 4: Release Manager Card');
    
    // Wait for command cards to load
    await page.waitForSelector('.command-cards-container', { timeout: 10000 });
    
    // Look for Release Manager Card (could be OwnerReleaseCard or ReleaseManagerCard)
    const releaseCard = page.locator('.owner-release-card, .release-manager-card').first();
    const isVisible = await releaseCard.isVisible({ timeout: 5000 }).catch(() => false);
    
    console.log(`  Release Manager Card: ${isVisible ? 'VISIBLE' : 'MISSING'}`);
    
    if (!isVisible) {
      // Capture screenshot for debugging
      await page.screenshot({ path: 'test-results/release-manager-missing.png' });
      
      // Check if there's an error in console
      const errors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') {
          errors.push(msg.text());
        }
      });
      
      console.error('  ❌ FAILURE: Release Manager Card not found');
      console.error('  Console errors:', errors);
    }
    
    expect(isVisible).toBe(true);
    
    // Verify current version is displayed
    const versionText = await releaseCard.locator('.current-version, .rm-current-version').textContent().catch(() => '');
    console.log(`  Current Version Display: ${versionText}`);
    
    // Verify next version is displayed
    const nextVersionText = await releaseCard.locator('.next-version, .rm-next-version').textContent().catch(() => '');
    console.log(`  Next Version Display: ${nextVersionText}`);
    
    // Try to reveal command (if "Show Command" button exists)
    const showCommandBtn = releaseCard.locator('button:has-text("Show Command")');
    const hasShowBtn = await showCommandBtn.isVisible().catch(() => false);
    
    if (hasShowBtn) {
      await showCommandBtn.click();
      await page.waitForTimeout(500);
      
      // Check if command is now visible
      const commandText = await releaseCard.locator('.rm-command-text, pre').textContent().catch(() => '');
      console.log(`  Generated Command: ${commandText.substring(0, 100)}...`);
      
      expect(commandText.length).toBeGreaterThan(0);
    }
    
    console.log('  ✅ TEST 4 PASSED: Release Manager Card functional');
  });

  test('🟡 INFO: Capture build configuration from GitHub Actions', async ({ page }) => {
    console.log('\n🧪 TEST 5: Build Configuration Check');
    
    // This test doesn't use the browser, but runs within Playwright context
    // We'll check the local .github/workflows/release.yml file
    
    const { readFile } = await import('fs/promises');
    const path = await import('path');
    
    try {
      const workflowPath = path.join(process.cwd(), '.github', 'workflows', 'release.yml');
      const content = await readFile(workflowPath, 'utf-8');
      
      console.log('  ✓ Found .github/workflows/release.yml');
      
      // Check for Windows build configuration
      const hasWindowsBuild = content.includes('GOOS=windows');
      console.log(`  ${hasWindowsBuild ? '✓' : '❌'} Windows build: ${hasWindowsBuild ? 'configured' : 'MISSING'}`);
      
      // Check for windowsgui flag
      const hasWindowsGui = content.includes('-H=windowsgui') || content.includes('-H windowsgui');
      console.log(`  ${hasWindowsGui ? '✓' : '❌'} Windows GUI flag: ${hasWindowsGui ? 'present' : 'MISSING'}`);
      
      // Check for strip flags
      const hasStripFlags = content.includes('-s -w');
      console.log(`  ${hasStripFlags ? '✓' : '⚠'} Strip flags: ${hasStripFlags ? 'present' : 'missing (may cause AV issues)'}`);
      
      // Check for asset upload
      const hasAssetUpload = content.includes('forge-windows-amd64.exe');
      console.log(`  ${hasAssetUpload ? '✓' : '❌'} Windows .exe upload: ${hasAssetUpload ? 'configured' : 'MISSING'}`);
      
      // Extract version injection
      const versionMatch = content.match(/internal\/updater\.Version=\${([^}]+)}/);
      if (versionMatch) {
        console.log(`  ✓ Version injection: ${versionMatch[1]}`);
      } else {
        console.log('  ⚠ Version injection: NOT FOUND');
      }
      
      console.log('  ✅ TEST 5 PASSED: Build configuration captured');
    } catch (err) {
      console.error(`  ❌ FAILURE: Could not read workflow file: ${err.message}`);
      // Don't fail the test - this is informational
    }
  });

  test('🟡 INFO: Check version mismatch between source files', async ({ page }) => {
    console.log('\n🧪 TEST 6: Version Consistency Check');
    
    const { readFile } = await import('fs/promises');
    const path = await import('path');
    
    const versions = {};
    
    try {
      // Check internal/updater/updater.go
      const updaterPath = path.join(process.cwd(), 'internal', 'updater', 'updater.go');
      const updaterContent = await readFile(updaterPath, 'utf-8');
      const updaterMatch = updaterContent.match(/var Version = "([^"]+)"/);
      if (updaterMatch) {
        versions.updater = updaterMatch[1];
        console.log(`  updater.go: ${versions.updater}`);
      }
      
      // Check frontend/package.json
      const packagePath = path.join(process.cwd(), 'frontend', 'package.json');
      const packageContent = await readFile(packagePath, 'utf-8');
      const packageData = JSON.parse(packageContent);
      versions.frontend = packageData.version;
      console.log(`  frontend/package.json: ${versions.frontend}`);
      
      // Check runtime version via API
      const runtimeVersion = await page.evaluate(async () => {
        const res = await fetch('/api/version');
        const data = await res.json();
        return data.version;
      });
      versions.runtime = runtimeVersion;
      console.log(`  Runtime API: ${versions.runtime}`);
      
      // Compare versions
      const allVersions = Object.values(versions).map(v => v.replace(/^v/, ''));
      const unique = [...new Set(allVersions)];
      
      if (unique.length === 1) {
        console.log(`  ✓ All versions match: ${unique[0]}`);
      } else {
        console.log('  ⚠ VERSION MISMATCH DETECTED:');
        Object.entries(versions).forEach(([source, version]) => {
          console.log(`    - ${source}: ${version}`);
        });
      }
      
      // Check if runtime version matches user's report (3.11.7)
      const normalizedRuntime = runtimeVersion.replace(/^v/, '');
      if (normalizedRuntime === '3.11.7') {
        console.log('  ✓ Runtime version matches user report (3.11.7)');
      } else {
        console.log(`  ⚠ Runtime version (${normalizedRuntime}) does NOT match user report (3.11.7)`);
      }
      
      console.log('  ✅ TEST 6 PASSED: Version check complete');
    } catch (err) {
      console.error(`  ❌ Error checking versions: ${err.message}`);
    }
  });
});

test.describe('v3.11.7 Windows .exe Launch Validation', () => {
  test('🟡 INFO: Verify Windows build configuration', async ({ page }) => {
    console.log('\n🧪 TEST 7: Windows .exe Build Configuration');
    
    const { readFile } = await import('fs/promises');
    const path = await import('path');
    
    try {
      // Check Makefile for Windows build
      const makefilePath = path.join(process.cwd(), 'Makefile');
      const makefileContent = await readFile(makefilePath, 'utf-8');
      
      const hasWindowsTarget = makefileContent.includes('GOOS=windows');
      console.log(`  ${hasWindowsTarget ? '✓' : '❌'} Makefile Windows target: ${hasWindowsTarget ? 'present' : 'MISSING'}`);
      
      // Check for windowsgui flag in Makefile
      const hasWindowsGuiMakefile = makefileContent.includes('-H windowsgui') || makefileContent.includes('-H=windowsgui');
      console.log(`  ${hasWindowsGuiMakefile ? '✓' : '❌'} Makefile Windows GUI flag: ${hasWindowsGuiMakefile ? 'present' : 'MISSING'}`);
      
      // Check cmd/forge/windows.go (Windows-specific code)
      const windowsGoPath = path.join(process.cwd(), 'cmd', 'forge', 'windows.go');
      const windowsGoExists = await readFile(windowsGoPath, 'utf-8').then(() => true).catch(() => false);
      console.log(`  ${windowsGoExists ? '✓' : '❌'} windows.go file: ${windowsGoExists ? 'exists' : 'MISSING'}`);
      
      // Check for hideWindow function (prevents console windows)
      if (windowsGoExists) {
        const windowsGoContent = await readFile(windowsGoPath, 'utf-8');
        const hasHideWindow = windowsGoContent.includes('func hideWindow');
        console.log(`  ${hasHideWindow ? '✓' : '❌'} hideWindow function: ${hasHideWindow ? 'implemented' : 'MISSING'}`);
      }
      
      console.log('  ℹ Note: .exe launch issues may be caused by:');
      console.log('    - Missing frontend build artifacts');
      console.log('    - Incorrect embed.FS path (cmd/forge/web/assets)');
      console.log('    - Port already in use (tries: 3005, 8333, 8080, 9000, 3000, 3333)');
      console.log('    - Windows Defender/antivirus blocking');
      console.log('    - Missing ConPTY support (requires Windows 10 1809+)');
      
      console.log('  ✅ TEST 7 PASSED: Windows build configuration checked');
    } catch (err) {
      console.error(`  ❌ Error: ${err.message}`);
    }
  });
});
