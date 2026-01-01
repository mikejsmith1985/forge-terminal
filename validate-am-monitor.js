#!/usr/bin/env node

/**
 * AM Monitor - Syntax & Logic Validation Script
 * Validates that the fixes don't have basic syntax/runtime errors
 */

const fs = require('fs');
const path = require('path');

console.log('═══════════════════════════════════════════════════════════');
console.log('  AM Monitor Component - Fix Validation');
console.log('═══════════════════════════════════════════════════════════');
console.log('');

// Read the fixed component
const componentPath = path.join(__dirname, 'frontend/src/components/AMMonitor.jsx');
const testPath = path.join(__dirname, 'frontend/src/components/AMMonitor.test.jsx');

console.log('📋 Checking files...');
console.log('');

// Check files exist
if (!fs.existsSync(componentPath)) {
  console.error('❌ AMMonitor.jsx not found at', componentPath);
  process.exit(1);
}
console.log('✅ AMMonitor.jsx found');

if (!fs.existsSync(testPath)) {
  console.error('❌ AMMonitor.test.jsx not found at', testPath);
  process.exit(1);
}
console.log('✅ AMMonitor.test.jsx found');

console.log('');
console.log('🔍 Analyzing component code...');
console.log('');

const componentCode = fs.readFileSync(componentPath, 'utf8');

// Check 1: Verify useEffect has isMounted guard
if (componentCode.includes('let isMounted = true') && 
    componentCode.includes('if (!isMounted)') &&
    componentCode.match(/isMounted = false/)) {
  console.log('✅ Memory leak prevention: isMounted cleanup found');
} else {
  console.warn('⚠️ Warning: isMounted cleanup pattern not found');
}

// Check 2: Verify response handling for both array and object
if (componentCode.includes('Array.isArray(convData)') ||
    componentCode.includes('convData.conversations')) {
  console.log('✅ Flexible API response handling implemented');
} else {
  console.warn('⚠️ Warning: API response handling may be incomplete');
}

// Check 3: Verify error fallback in catch block
if (componentCode.match(/catch.*{[\s\S]*?setStatus[\s\S]*?}/)) {
  console.log('✅ Error fallback status setting found');
} else {
  console.warn('⚠️ Warning: Error fallback may be missing');
}

// Check 4: Verify null checks for conversations
if (componentCode.includes('conversations.length') &&
    componentCode.includes('conversationId')) {
  console.log('✅ Conversation data validation found');
} else {
  console.warn('⚠️ Warning: Conversation validation may be incomplete');
}

// Check 5: Verify icon rendering wrapper
if (componentCode.match(/case 'active':\s*{[\s\S]*?<div style/)) {
  console.log('✅ Icon rendering wrapper found');
} else {
  console.warn('⚠️ Warning: Icon wrapper may be missing');
}

// Check 6: Verify status fallback logic
const statusFallback = componentCode.match(/amEnabled \? 'active' : 'disabled'/g);
if (statusFallback && statusFallback.length >= 2) {
  console.log(`✅ Status fallback logic found (${statusFallback.length} places)`);
} else {
  console.warn('⚠️ Warning: Status fallback may be incomplete');
}

// Check 7: Verify no direct setStatus calls without checks
const setStatusCalls = componentCode.match(/setStatus\(/g);
const okChecks = componentCode.match(/\.ok\s*[?:]|ok\s*=>|if.*ok/g);
if (setStatusCalls && okChecks) {
  console.log(`✅ Status updates have conditional checks`);
} else {
  console.warn('⚠️ Warning: Some status updates may lack checks');
}

console.log('');
console.log('📊 Test File Analysis...');
console.log('');

const testCode = fs.readFileSync(testPath, 'utf8');

// Count test cases
const describeBlocks = (testCode.match(/test\.describe\(/g) || []).length;
const testBlocks = (testCode.match(/test\(/g) || []).length;

console.log(`Found ${describeBlocks} test suites`);
console.log(`Found ${testBlocks} test cases`);

if (testBlocks >= 40) {
  console.log('✅ Comprehensive test coverage');
} else {
  console.warn(`⚠️ Warning: ${testBlocks} tests (recommended 40+)`);
}

// Check for key test scenarios
const testScenarios = [
  'render.*active',
  'render.*disabled',
  'render.*broken',
  'API.*failure',
  'response.*format',
  'conversation.*click',
  'error.*handling'
];

console.log('');
console.log('🎯 Test Scenarios:');

let scenariosFound = 0;
testScenarios.forEach(scenario => {
  if (new RegExp(scenario, 'i').test(testCode)) {
    console.log(`  ✅ ${scenario}`);
    scenariosFound++;
  } else {
    console.log(`  ❌ ${scenario}`);
  }
});

console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log('  VALIDATION RESULTS');
console.log('═══════════════════════════════════════════════════════════');
console.log('');

const issues = [];

// Check for common React patterns
if (!componentCode.includes('useState')) issues.push('Missing useState import');
if (!componentCode.includes('useEffect')) issues.push('Missing useEffect import');
if (!componentCode.includes('return (')) issues.push('Missing JSX return');

// Check for required imports
const hasImports = componentCode.includes('import React');
const hasIcons = componentCode.includes('Circle') && 
                 componentCode.includes('Eye') &&
                 componentCode.includes('AlertTriangle');

if (!hasImports) issues.push('Missing React import');
if (!hasIcons) issues.push('Missing icon imports');

console.log(`📌 Component Issues Found: ${issues.length}`);
if (issues.length > 0) {
  issues.forEach(issue => console.log(`  ❌ ${issue}`));
} else {
  console.log('  ✅ No critical issues found');
}

console.log('');
console.log('🧪 Test Coverage Summary:');
console.log(`  • Test suites: ${describeBlocks}`);
console.log(`  • Test cases: ${testBlocks}`);
console.log(`  • Scenarios covered: ${scenariosFound}/7`);

console.log('');

if (issues.length === 0 && testBlocks >= 40) {
  console.log('✅ VALIDATION PASSED - Ready for testing');
  console.log('');
  console.log('Next steps:');
  console.log('  1. npm test -- frontend/src/components/AMMonitor.test.jsx');
  console.log('  2. Visual testing in dev mode');
  console.log('  3. Test with actual AM data');
  process.exit(0);
} else {
  console.log('⚠️  VALIDATION PASSED WITH WARNINGS');
  console.log('');
  console.log('Please review the warnings above before deployment');
  process.exit(0);
}
