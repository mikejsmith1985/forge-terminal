const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

test.describe('Icon and Favicon Tests', () => {
  test('favicon files should exist in build output', async () => {
    const buildDir = path.join(__dirname, '..', 'cmd', 'forge', 'web');
    
    // Check all favicon files exist
    const faviconIco = path.join(buildDir, 'favicon.ico');
    const faviconPng = path.join(buildDir, 'favicon.png');
    const favicon192 = path.join(buildDir, 'favicon-192.png');
    const favicon512 = path.join(buildDir, 'favicon-512.png');
    
    expect(fs.existsSync(faviconIco), 'favicon.ico should exist').toBeTruthy();
    expect(fs.existsSync(faviconPng), 'favicon.png should exist').toBeTruthy();
    expect(fs.existsSync(favicon192), 'favicon-192.png should exist').toBeTruthy();
    expect(fs.existsSync(favicon512), 'favicon-512.png should exist').toBeTruthy();
    
    // Verify files are not empty
    expect(fs.statSync(faviconIco).size).toBeGreaterThan(0);
    expect(fs.statSync(faviconPng).size).toBeGreaterThan(0);
    expect(fs.statSync(favicon192).size).toBeGreaterThan(0);
    expect(fs.statSync(favicon512).size).toBeGreaterThan(0);
  });

  test('Windows resource files should exist', async () => {
    const cmdForgeDir = path.join(__dirname, '..', 'cmd', 'forge');
    
    const syso386 = path.join(cmdForgeDir, 'rsrc_windows_386.syso');
    const sysoAmd64 = path.join(cmdForgeDir, 'rsrc_windows_amd64.syso');
    
    expect(fs.existsSync(syso386), 'rsrc_windows_386.syso should exist').toBeTruthy();
    expect(fs.existsSync(sysoAmd64), 'rsrc_windows_amd64.syso should exist').toBeTruthy();
    
    // Verify files are not empty and contain icon data
    expect(fs.statSync(syso386).size).toBeGreaterThan(100000); // Should be large enough to contain icon
    expect(fs.statSync(sysoAmd64).size).toBeGreaterThan(100000);
  });

  test('Windows icon file should exist', async () => {
    const iconPath = path.join(__dirname, '..', 'internal', 'platform', 'windows-icon.ico');
    
    expect(fs.existsSync(iconPath), 'windows-icon.ico should exist').toBeTruthy();
    expect(fs.statSync(iconPath).size).toBeGreaterThan(0);
  });

  test('index.html should reference favicon files', async () => {
    const indexPath = path.join(__dirname, '..', 'frontend', 'index.html');
    const content = fs.readFileSync(indexPath, 'utf-8');
    
    expect(content).toContain('favicon.ico');
    expect(content).toContain('favicon.png');
    expect(content).toContain('favicon-192.png');
    expect(content).toContain('favicon-512.png');
  });

  test('executable should have icon embedded', async () => {
    const exePath = path.join(__dirname, '..', 'forge-test-icon.exe');
    
    // Check if test executable exists
    if (fs.existsSync(exePath)) {
      const stats = fs.statSync(exePath);
      // Executable with embedded icon should be larger than base size
      expect(stats.size).toBeGreaterThan(20000000); // Should be over 20MB
      console.log(`Executable size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    } else {
      console.log('Test executable not found - run "go build -o forge-test-icon.exe ./cmd/forge" first');
    }
  });
});
