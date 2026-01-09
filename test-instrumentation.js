
const recast = require('recast');
const fs = require('fs');
const InstrumentationEngine = require('./scripts/instrumentation-engine');

// Test case
const source = `
function add(a, b) {
    if (a > 0) return a + b;
    return b;
}

const arrow = (x) => x * 2;

function voidFunc() {
    return;
}

function complex(x) {
    if (x > 10) {
        return x;
    } else if (x > 5) {
        return 5;
    } else {
        return 0;
    }
}
`;

const engine = new InstrumentationEngine();
const output = engine.process(source);

console.log('--- Original ---');
console.log(source);
console.log('--- Instrumenting ---');
console.log(output);

// Simple check
if (!output.includes('[FORGE_PROBE]')) {
    console.log('FAIL: No probes injected');
    process.exit(1);
}
if (!output.includes('ENTRY')) {
    console.log('FAIL: No ENTRY probes');
    process.exit(1);
}
if (!output.includes('BRANCH')) {
    console.log('FAIL: No BRANCH probes');
    process.exit(1);
}
if (!output.includes('RETURN')) {
    console.log('FAIL: No RETURN probes');
    process.exit(1);
}
// Check return value capture
if (!output.includes('const __forge_ret')) {
    console.log('FAIL: Return value capture variable not found');
    process.exit(1);
}
// Check else probe
if (!output.includes('if-alternate')) {
    console.log('FAIL: Else branch probe not found');
    process.exit(1);
}

console.log('PASS');

// --- Reversion Test ---
console.log('--- Reverting ---');
const restored = engine.removeProbes(output);
console.log(restored);

if (restored.includes('[FORGE_PROBE]')) {
    console.log('FAIL: Probes still present');
    process.exit(1);
}
if (restored.includes('__forge_ret')) {
    console.log('FAIL: Return capture not cleaned up');
    process.exit(1);
}
if (!restored.includes('return a + b;')) {
    console.log('FAIL: Original return logic not restored (add)');
    process.exit(1);
}
if (!restored.includes('return x * 2;')) {
     console.log('FAIL: Original return logic not restored (arrow)');
     process.exit(1);
}

// Check for syntax validity
try {
    recast.parse(restored);
} catch (e) {
    console.log('FAIL: Restored code is invalid syntax', e);
    process.exit(1);
}

console.log('PASS REVERSION');

