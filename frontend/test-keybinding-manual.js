/**
 * Manual test script for keybinding assignment
 * Run with: node test-keybinding-manual.js
 */

// Test the keybinding utility functions directly
import { 
  KEYBINDING_POOL,
  getNextAvailableKeybinding,
  isDuplicateKeybinding,
  getKeybindingAvailability,
  validateKeybinding
} from './src/utils/keybindingManager.js';

console.log('🧪 Testing Keybinding Manager\n');

// Test 1: Check pool structure
console.log('Test 1: Keybinding Pool Structure');
console.log('Pool has 20 slots:', KEYBINDING_POOL.length === 20 ? '✅' : '❌');
console.log('First 10 are Ctrl+Shift+0-9:', 
  KEYBINDING_POOL.slice(0, 10).every(kb => kb.startsWith('Ctrl+Shift+')) ? '✅' : '❌');
console.log('Next 10 are Ctrl+Alt+0-9:', 
  KEYBINDING_POOL.slice(10, 20).every(kb => kb.startsWith('Ctrl+Alt+')) ? '✅' : '❌');
console.log();

// Test 2: Next available keybinding
console.log('Test 2: Next Available Keybinding');
const emptyCommands = [];
const next1 = getNextAvailableKeybinding(emptyCommands);
console.log('First keybinding for empty list:', next1, next1 === 'Ctrl+Shift+0' ? '✅' : '❌');

const commands5 = [
  { id: 1, keyBinding: 'Ctrl+Shift+0' },
  { id: 2, keyBinding: 'Ctrl+Shift+1' },
  { id: 3, keyBinding: 'Ctrl+Shift+2' },
  { id: 4, keyBinding: 'Ctrl+Shift+3' },
  { id: 5, keyBinding: 'Ctrl+Shift+4' },
];
const next6 = getNextAvailableKeybinding(commands5);
console.log('6th keybinding:', next6, next6 === 'Ctrl+Shift+5' ? '✅' : '❌');
console.log();

// Test 3: Duplicate detection
console.log('Test 3: Duplicate Detection');
const isDup = isDuplicateKeybinding('Ctrl+Shift+2', commands5);
console.log('Detects duplicate:', isDup ? '✅' : '❌');
const isNotDup = isDuplicateKeybinding('Ctrl+Shift+7', commands5);
console.log('Detects non-duplicate:', !isNotDup ? '✅' : '❌');
console.log();

// Test 4: Case normalization
console.log('Test 4: Case Normalization');
const isDupLower = isDuplicateKeybinding('ctrl+shift+2', commands5);
console.log('Normalizes lowercase:', isDupLower ? '✅' : '❌');
console.log();

// Test 5: Full pool
console.log('Test 5: Full Pool Handling');
const fullCommands = KEYBINDING_POOL.map((kb, idx) => ({ id: idx, keyBinding: kb }));
const nextFull = getNextAvailableKeybinding(fullCommands);
console.log('Returns null when full:', nextFull === null ? '✅' : '❌');
console.log();

// Test 6: Availability
console.log('Test 6: Availability Calculation');
const avail5 = getKeybindingAvailability(commands5);
console.log('Available count:', avail5.available, avail5.available === 15 ? '✅' : '❌');
console.log('Assigned count:', avail5.assigned, avail5.assigned === 5 ? '✅' : '❌');
console.log();

// Test 7: Validation
console.log('Test 7: Validation');
const validNew = validateKeybinding('Ctrl+Shift+9', commands5);
console.log('Validates new keybinding:', validNew.valid ? '✅' : '❌');
const validDup = validateKeybinding('Ctrl+Shift+2', commands5);
console.log('Rejects duplicate:', !validDup.valid ? '✅' : '❌');
const validEmpty = validateKeybinding('', commands5);
console.log('Allows empty (auto-assign):', validEmpty.valid ? '✅' : '❌');
console.log();

// Test 8: Transition from Ctrl+Shift to Ctrl+Alt
console.log('Test 8: Transition to Ctrl+Alt Pool');
const commands10 = KEYBINDING_POOL.slice(0, 10).map((kb, idx) => ({ id: idx, keyBinding: kb }));
const next11 = getNextAvailableKeybinding(commands10);
console.log('11th keybinding:', next11, next11 === 'Ctrl+Alt+0' ? '✅' : '❌');
console.log();

console.log('✨ All utility function tests complete!\n');
console.log('Next: Test UI integration in browser at http://localhost:8080');
