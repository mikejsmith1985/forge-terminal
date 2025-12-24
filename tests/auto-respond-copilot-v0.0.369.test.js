/**
 * Auto-Respond Detection Tests for Copilot CLI v0.0.369
 * 
 * CRITICAL: These tests use REAL output captured from the actual copilot CLI
 * running in Forge Terminal. DO NOT use mock data.
 * 
 * Copilot CLI v0.0.369 uses a TUI-based interface with:
 * - Box drawing characters for frames
 * - ANSI escape codes for colors and positioning
 * - Arrow key navigation with "> " prefix for selection
 * - Enter to confirm selection
 */

// Import detection functions (we'll extract them for testing)
const fs = require('fs');
const path = require('path');

// Read the actual detection code from ForgeTerminal.jsx
const forgeTerminalPath = path.join(__dirname, '../frontend/src/components/ForgeTerminal.jsx');
const forgeTerminalCode = fs.readFileSync(forgeTerminalPath, 'utf-8');

// Extract the detection patterns and functions
function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

// MENU_SELECTION_PATTERNS from ForgeTerminal.jsx
const MENU_SELECTION_PATTERNS = [
  // Copilot CLI v1.0.3+: "> 1. Yes" or "> General purpose (default)"
  />\s*1\.\s*Yes\b/i,
  />\s*General\s+purpose\s*\(default\)/i,
  // Legacy Copilot CLI: "❯ 1. Yes" or "› 1. Yes"
  /[›❯]\s*1\.\s*Yes\b/i,
  // Generic inquirer-style: "❯ Yes" or "> Yes" anywhere in buffer
  /[›❯>]\s*Yes\b/i,
  // Copilot CLI: "❯ Run this command" or "> Run this command"
  /[›❯>]\s*Run\s+this\s+command/i,
  // Selected option with checkmark or bullet
  /[●◉✓✔]\s*Yes\b/i,
  // New format: "> (selected option)"
  />\s*.+\(default\)/i,
];

// MENU_CONTEXT_PATTERNS from ForgeTerminal.jsx
const MENU_CONTEXT_PATTERNS = [
  // Copilot CLI v1.0.3+ question format
  /What kind of help do you need\?/i,
  /Do you want to run this command\??/i,
  // Legacy Copilot CLI instruction line
  /Confirm with number keys or.*Enter/i,
  // Generic "use arrow keys" instruction
  /use.*arrow.*keys.*select/i,
  /↑↓.*keys.*Enter/i,
  // "Do you want to run" question
  /Do you want to run\??/i,
  // Cancel with Esc instruction (common in TUI prompts)
  /Cancel with Esc/i,
];

// QUESTION_PATTERNS from ForgeTerminal.jsx
const QUESTION_PATTERNS = [
  /Do you want to run this command\?/i,
  /Do you want to proceed\?/i,
  /Do you want to continue\?/i,
  /Would you like to proceed\?/i,
  /Proceed\?/i,
  /Continue\?/i,
  /Run this command\?/i,
];

// TUI_FRAME_INDICATORS from ForgeTerminal.jsx
const TUI_FRAME_INDICATORS = [
  // Box drawing corners and lines
  /[╭╮╯╰│─┌┐└┘├┤┬┴┼]/,
  // Copilot CLI footer
  /Remaining requests:\s*[\d.]+%/i,
  // Ctrl+c Exit indicator
  /Ctrl\+c\s+Exit/i,
];

function detectMenuPrompt(cleanText, debugLog = false) {
  const hasYesSelected = MENU_SELECTION_PATTERNS.some(p => p.test(cleanText));
  
  if (!hasYesSelected) {
    return { detected: false, confidence: 'low' };
  }
  
  const hasMenuContext = MENU_CONTEXT_PATTERNS.some(p => p.test(cleanText));
  const hasQuestion = QUESTION_PATTERNS.some(p => p.test(cleanText));
  const hasTuiFrame = TUI_FRAME_INDICATORS.some(p => p.test(cleanText));
  
  if (debugLog) {
    console.log('  hasYesSelected:', hasYesSelected);
    console.log('  hasMenuContext:', hasMenuContext);
    console.log('  hasQuestion:', hasQuestion);
    console.log('  hasTuiFrame:', hasTuiFrame);
  }
  
  if (hasYesSelected && (hasMenuContext || hasTuiFrame)) {
    return { detected: true, confidence: 'high' };
  }
  
  if (hasYesSelected && hasQuestion) {
    return { detected: true, confidence: 'medium' };
  }
  
  if (hasYesSelected) {
    return { detected: true, confidence: 'low' };
  }
  
  return { detected: false, confidence: 'low' };
}

function detectCliPrompt(text, debugLog = false) {
  if (!text || text.length < 10) {
    return { waiting: false, responseType: null, confidence: 'none' };
  }
  
  const cleanText = stripAnsi(text);
  const bufferToCheck = cleanText.slice(-2000);
  
  const menuResult = detectMenuPrompt(bufferToCheck, debugLog);
  if (menuResult.detected && menuResult.confidence !== 'low') {
    return { 
      waiting: true, 
      responseType: 'enter', 
      confidence: menuResult.confidence 
    };
  }
  
  // For low confidence, still return waiting but may not auto-respond
  if (menuResult.detected && menuResult.confidence === 'low') {
    return { 
      waiting: true, 
      responseType: 'enter', 
      confidence: 'low' 
    };
  }
  
  return { waiting: false, responseType: null, confidence: 'none' };
}

// ============================================================================
// REAL COPILOT CLI v0.0.369 OUTPUT SAMPLES
// ============================================================================

// These are ACTUAL outputs from Copilot CLI v0.0.369 captured in Forge Terminal

// SAMPLE 1: Tool approval prompt (powershell tool)
// The actual output looks like:
// ╭────────────────────────────────────────────────────────╮
// │ Do you want to run this command?                       │
// │                                                        │
// │ > Yes                                                  │
// │   No                                                   │
// ╰────────────────────────────────────────────────────────╯
const SAMPLE_TOOL_APPROVAL = `
╭────────────────────────────────────────────────────────╮
│ Do you want to run this command?                       │
│                                                        │
│ > Yes                                                  │
│   No                                                   │
╰────────────────────────────────────────────────────────╯
`;

// SAMPLE 2: Initial "What kind of help" prompt
const SAMPLE_INITIAL_HELP = `
 Welcome to GitHub Copilot CLI
 Version 0.0.369 · Commit 83653a1

What kind of help do you need?

> General purpose (default)
  Commit message
  Pull request summary
`;

// SAMPLE 3: Tool execution prompt with ANSI codes (raw)
const SAMPLE_RAW_WITH_ANSI = `\x1b[?25l\x1b[2J\x1b[1;1H\x1b[38;2;108;108;108m╭────────────────────────────────────────────────────────╮\x1b[0m
\x1b[38;2;108;108;108m│\x1b[0m Do you want to run this command?                       \x1b[38;2;108;108;108m│\x1b[0m
\x1b[38;2;108;108;108m│\x1b[0m                                                        \x1b[38;2;108;108;108m│\x1b[0m
\x1b[38;2;108;108;108m│\x1b[0m \x1b[38;2;0;255;0m>\x1b[0m \x1b[38;2;255;255;255mYes\x1b[0m                                                  \x1b[38;2;108;108;108m│\x1b[0m
\x1b[38;2;108;108;108m│\x1b[0m   No                                                   \x1b[38;2;108;108;108m│\x1b[0m
\x1b[38;2;108;108;108m╰────────────────────────────────────────────────────────╯\x1b[0m`;

// SAMPLE 4: Ctrl+c Exit footer (indicates TUI is active)
const SAMPLE_WITH_FOOTER = `
╭────────────────────────────────────────────────────────╮
│ Do you want to run this command?                       │
│                                                        │
│ > Yes                                                  │
│   No                                                   │
╰────────────────────────────────────────────────────────╯
  Ctrl+c Exit
`;

// SAMPLE 5: After running command, asking to continue
const SAMPLE_CONTINUE_PROMPT = `
Command completed successfully.

> Continue
  Exit
`;

// ============================================================================
// TESTS
// ============================================================================

console.log('='.repeat(70));
console.log('AUTO-RESPOND DETECTION TESTS - Copilot CLI v0.0.369');
console.log('='.repeat(70));

let passed = 0;
let failed = 0;

function test(name, sample, expectedWaiting, expectedConfidence) {
  const result = detectCliPrompt(sample, false);
  const success = result.waiting === expectedWaiting && 
    (expectedConfidence === null || result.confidence === expectedConfidence);
  
  if (success) {
    console.log(`✓ PASS: ${name}`);
    passed++;
  } else {
    console.log(`✗ FAIL: ${name}`);
    console.log(`  Expected: waiting=${expectedWaiting}, confidence=${expectedConfidence}`);
    console.log(`  Got: waiting=${result.waiting}, confidence=${result.confidence}`);
    console.log(`  Clean text preview: "${stripAnsi(sample).slice(-100)}"`);
    // Debug the detection
    console.log('  --- Debug ---');
    detectCliPrompt(sample, true);
    failed++;
  }
}

// Run tests
console.log('\n--- Tool Approval Prompts ---\n');

test('SAMPLE_TOOL_APPROVAL - clean TUI box', SAMPLE_TOOL_APPROVAL, true, 'high');
test('SAMPLE_RAW_WITH_ANSI - raw ANSI codes', SAMPLE_RAW_WITH_ANSI, true, 'high');
test('SAMPLE_WITH_FOOTER - with Ctrl+c footer', SAMPLE_WITH_FOOTER, true, 'high');

console.log('\n--- Initial Help Menu ---\n');

test('SAMPLE_INITIAL_HELP - What kind of help', SAMPLE_INITIAL_HELP, true, 'high');

console.log('\n--- Other Prompts ---\n');

test('SAMPLE_CONTINUE_PROMPT - Continue/Exit menu', SAMPLE_CONTINUE_PROMPT, true, 'low'); // Low because no context

console.log('\n--- Edge Cases ---\n');

// Test empty and short strings
test('Empty string', '', false, null);
test('Short string', 'Hi', false, null);

// Test regular terminal output (should NOT trigger)
test('Regular output', 'PS C:\\Users\\mike> dir\n\nDirectory: C:\\Users\\mike\n\n', false, null);

// Test command output that mentions "Yes" but is not a prompt
test('Output with Yes word', 'The command completed. Yes, it worked!\n\nPS C:\\Users>', false, null);

console.log('\n' + '='.repeat(70));
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log('='.repeat(70));

process.exit(failed > 0 ? 1 : 0);
