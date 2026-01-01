/**
 * Quick manual validation script for AM Monitor
 * Run in browser console while Forge is open
 */

console.log('=== AM Monitor Debug ===');

// 1. Check if DevMode is on
const devMode = localStorage.getItem('devMode');
console.log('DevMode:', devMode);

// 2. Check if AM monitor exists in DOM
const amMonitor = document.querySelector('.am-monitor');
console.log('AM Monitor element:', amMonitor);

if (amMonitor) {
  console.log('✓ AM Monitor found!');
  console.log('  - Classes:', amMonitor.className);
  console.log('  - Text:', amMonitor.textContent);
  console.log('  - Parent:', amMonitor.parentElement.className);
  console.log('  - Visible:', window.getComputedStyle(amMonitor).display !== 'none');
} else {
  console.log('✗ AM Monitor NOT found in DOM');
  console.log('Checking sidebar structure...');
  
  const sidebarHeader = document.querySelector('.sidebar-header');
  if (sidebarHeader) {
    console.log('Sidebar header content:', sidebarHeader.innerHTML.substring(0, 200));
  }
}

// 3. Check React state (if accessible)
console.log('\n=== Enabling DevMode ===');
localStorage.setItem('devMode', 'true');
console.log('✓ DevMode set to true - reload page to see AM Monitor');
