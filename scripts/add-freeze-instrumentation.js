/**
 * Add freeze instrumentation to ForgeTerminal.jsx
 * This script injects timing code into the ws.onmessage handler
 */

const fs = require('fs');
const path = require('path');

const terminalPath = path.join(__dirname, '../frontend/src/components/ForgeTerminal.jsx');
const backupPath = path.join(__dirname, '../frontend/src/components/ForgeTerminal.jsx.backup');

// Read the file
let content = fs.readFileSync(terminalPath, 'utf8');

// Create backup
fs.writeFileSync(backupPath, content);
console.log('✓ Backup created:', backupPath);

// Find the ws.onmessage handler
const wsOnMessageRegex = /(ws\.onmessage\s*=\s*\(event\)\s*=>\s*\{)/;

if (!wsOnMessageRegex.test(content)) {
  console.error('❌ Could not find ws.onmessage handler');
  process.exit(1);
}

// Add instrumentation at the start of the handler
const instrumentationCode = `
        // FREEZE INSTRUMENTATION - Added by add-freeze-instrumentation.js
        const messageStart = performance.now();
        const dataSize = event.data instanceof ArrayBuffer ? event.data.byteLength :
                         typeof event.data === 'string' ? event.data.length : 0;
        
        // Track message processing
        if (!window.__wsMessageStats) {
          window.__wsMessageStats = { count: 0, totalTime: 0, maxTime: 0 };
        }
        window.__wsMessageStats.count++;
        
        try {
`;

const cleanupCode = `
        } finally {
          // Record timing
          const duration = performance.now() - messageStart;
          window.__wsMessageStats.totalTime += duration;
          window.__wsMessageStats.maxTime = Math.max(window.__wsMessageStats.maxTime, duration);
          
          // Log slow messages immediately
          if (duration > 50) {
            console.warn(\`[Freeze Debug] Slow message: \${duration.toFixed(0)}ms, size: \${dataSize} bytes\`);
          }
          
          // Critical freeze detection - RED ALERT
          if (duration > 500) {
            console.error(\`%c🔴 FREEZE DETECTED: \${duration.toFixed(0)}ms message processing\`, 
              'background: red; color: white; font-size: 16px; padding: 8px;');
            window.__lastFreezeCause = {
              type: 'websocket_message',
              duration,
              dataSize,
              timestamp: Date.now()
            };
          }
        }
`;

// Replace ws.onmessage = (event) => { with instrumented version
content = content.replace(
  wsOnMessageRegex,
  `$1${instrumentationCode}`
);

// Find the closing of ws.onmessage handler (before ws.onerror)
// This is a bit tricky - we need to find the }; before ws.onerror
const wsOnErrorIndex = content.indexOf('ws.onerror');
if (wsOnErrorIndex === -1) {
  console.error('❌ Could not find ws.onerror');
  process.exit(1);
}

// Find the }; before ws.onerror
const beforeError = content.substring(0, wsOnErrorIndex);
const lastBrace = beforeError.lastIndexOf('};');
if (lastBrace === -1) {
  console.error('❌ Could not find closing brace before ws.onerror');
  process.exit(1);
}

// Insert cleanup code before the closing brace
content = content.substring(0, lastBrace) + cleanupCode + content.substring(lastBrace);

// Write the instrumented version
fs.writeFileSync(terminalPath, content);

console.log('✓ Instrumentation added to ForgeTerminal.jsx');
console.log('✓ Run the app and watch console for "[Freeze Debug]" messages');
console.log('✓ Check window.__wsMessageStats in browser console');
console.log('✓ To revert: cp frontend/src/components/ForgeTerminal.jsx.backup frontend/src/components/ForgeTerminal.jsx');
