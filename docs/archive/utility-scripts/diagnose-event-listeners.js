/**
 * Event Listener Diagnostic Tool
 * Run this in browser console when spacebar is broken
 * 
 * Usage:
 * 1. Open browser DevTools (F12)
 * 2. Copy this entire file contents
 * 3. Paste into Console tab
 * 4. Press Enter
 * 5. Try pressing spacebar
 * 6. Check the console output
 */

console.log('%c=== EVENT LISTENER DIAGNOSTIC ===', 'color: #0ea5e9; font-size: 16px; font-weight: bold');
console.log('Starting comprehensive event listener analysis...\n');

// ============================================================================
// PART 1: Document-level listeners that might intercept spacebar
// ============================================================================
console.log('%c[1] Document & Body Level Listeners', 'color: #f59e0b; font-weight: bold');

const docListeners = {
  document: getEventListeners(document),
  body: getEventListeners(document.body),
  window: getEventListeners(window)
};

console.log('Document listeners:', docListeners.document);
console.log('Body listeners:', docListeners.body);
console.log('Window listeners:', docListeners.window);

// Check for keydown/keypress/keyup
['keydown', 'keypress', 'keyup'].forEach(eventType => {
  const docCount = docListeners.document[eventType]?.length || 0;
  const bodyCount = docListeners.body[eventType]?.length || 0;
  const windowCount = docListeners.window[eventType]?.length || 0;
  
  if (docCount + bodyCount + windowCount > 0) {
    console.warn(`⚠️  Found ${docCount + bodyCount + windowCount} ${eventType} listeners at document/body/window level`);
  }
});

// ============================================================================
// PART 2: Find xterm's hidden textarea
// ============================================================================
console.log('\n%c[2] XTerm Textarea Detection', 'color: #f59e0b; font-weight: bold');

const textareas = document.querySelectorAll('textarea');
const xtermTextarea = Array.from(textareas).find(ta => 
  ta.className.includes('xterm-helper-textarea') || 
  ta.getAttribute('aria-label')?.includes('Terminal')
);

if (xtermTextarea) {
  console.log('✅ Found xterm textarea:', xtermTextarea);
  console.log('   - Class:', xtermTextarea.className);
  console.log('   - Focused:', document.activeElement === xtermTextarea);
  console.log('   - Visible:', xtermTextarea.offsetParent !== null);
  console.log('   - Position:', {
    top: xtermTextarea.offsetTop,
    left: xtermTextarea.offsetLeft,
    width: xtermTextarea.offsetWidth,
    height: xtermTextarea.offsetHeight
  });
  
  const taListeners = getEventListeners(xtermTextarea);
  console.log('   - Listeners on textarea:', taListeners);
} else {
  console.error('❌ Could not find xterm textarea!');
  console.log('   All textareas:', textareas);
}

// ============================================================================
// PART 3: Scan all elements with keyboard listeners
// ============================================================================
console.log('\n%c[3] All Elements With Keyboard Listeners', 'color: #f59e0b; font-weight: bold');

const elementsWithKeyListeners = [];
document.querySelectorAll('*').forEach(el => {
  const listeners = getEventListeners(el);
  const hasKeyListeners = ['keydown', 'keypress', 'keyup'].some(type => listeners[type]?.length > 0);
  
  if (hasKeyListeners) {
    elementsWithKeyListeners.push({
      element: el,
      tag: el.tagName,
      id: el.id,
      classes: el.className,
      listeners: {
        keydown: listeners.keydown?.length || 0,
        keypress: listeners.keypress?.length || 0,
        keyup: listeners.keyup?.length || 0
      }
    });
  }
});

console.log(`Found ${elementsWithKeyListeners.length} elements with keyboard listeners:`);
console.table(elementsWithKeyListeners.map(item => ({
  Tag: item.tag,
  ID: item.id || '(none)',
  Classes: item.classes.substring(0, 30),
  Keydown: item.listeners.keydown,
  Keypress: item.listeners.keypress,
  Keyup: item.listeners.keyup
})));

// ============================================================================
// PART 4: Live spacebar test
// ============================================================================
console.log('\n%c[4] Live Spacebar Test', 'color: #f59e0b; font-weight: bold');
console.log('Press SPACEBAR now within the next 10 seconds...');

let spacebarDetected = false;
const phases = ['capture', 'target', 'bubble'];

const testListener = (phase) => (e) => {
  if (e.key === ' ' || e.keyCode === 32) {
    spacebarDetected = true;
    console.log(`%c✓ SPACEBAR detected in ${phase} phase`, 'color: #10b981; font-weight: bold');
    console.log('   Event details:', {
      key: e.key,
      code: e.code,
      keyCode: e.keyCode,
      target: e.target.tagName + (e.target.className ? '.' + e.target.className : ''),
      currentTarget: e.currentTarget === document ? 'document' : e.currentTarget.tagName,
      defaultPrevented: e.defaultPrevented,
      cancelBubble: e.cancelBubble,
      propagationStopped: e.cancelBubble,
      timeStamp: e.timeStamp
    });
  }
};

// Add listeners in all phases
document.addEventListener('keydown', testListener('capture'), { capture: true });
document.addEventListener('keydown', testListener('bubble'), { capture: false });

setTimeout(() => {
  // Remove test listeners
  document.removeEventListener('keydown', testListener('capture'), { capture: true });
  document.removeEventListener('keydown', testListener('bubble'), { capture: false });
  
  if (!spacebarDetected) {
    console.error('%c❌ SPACEBAR WAS NOT DETECTED!', 'color: #ef4444; font-weight: bold; font-size: 14px');
    console.log('This means spacebar events are being completely blocked or prevented.');
  }
}, 10000);

// ============================================================================
// PART 5: Focus state monitoring
// ============================================================================
console.log('\n%c[5] Focus State Monitor (running for 10 seconds)', 'color: #f59e0b; font-weight: bold');

let focusChanges = [];
const originalActiveElement = document.activeElement;
console.log('Current focus:', originalActiveElement.tagName, originalActiveElement.className);

const focusMonitor = setInterval(() => {
  const current = document.activeElement;
  const last = focusChanges[focusChanges.length - 1];
  
  if (!last || last.element !== current) {
    focusChanges.push({
      timestamp: Date.now(),
      element: current,
      tag: current.tagName,
      class: current.className,
      isXtermTextarea: current === xtermTextarea
    });
    console.log('Focus changed to:', current.tagName, current.className);
  }
}, 100);

setTimeout(() => {
  clearInterval(focusMonitor);
  console.log('\n%c[Focus Change Summary]', 'color: #8b5cf6; font-weight: bold');
  console.table(focusChanges.map(fc => ({
    Time: new Date(fc.timestamp).toLocaleTimeString(),
    Tag: fc.tag,
    Class: fc.class.substring(0, 30),
    IsXtermTextarea: fc.isXtermTextarea ? '✓' : ''
  })));
}, 10000);

// ============================================================================
// PART 6: Check for overlays blocking input
// ============================================================================
console.log('\n%c[6] Overlay Detection', 'color: #f59e0b; font-weight: bold');

if (xtermTextarea) {
  const rect = xtermTextarea.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  
  const elementAtCenter = document.elementFromPoint(centerX, centerY);
  
  console.log('Element at textarea center:', elementAtCenter);
  if (elementAtCenter !== xtermTextarea && !xtermTextarea.contains(elementAtCenter)) {
    console.warn('⚠️  Something is covering the xterm textarea!');
    console.log('   Covering element:', elementAtCenter.tagName, elementAtCenter.className);
    console.log('   Its computed style:', window.getComputedStyle(elementAtCenter));
  } else {
    console.log('✅ No overlay detected - textarea is directly accessible');
  }
}

// ============================================================================
// SUMMARY
// ============================================================================
console.log('\n%c=== DIAGNOSTIC SUMMARY ===', 'color: #0ea5e9; font-size: 16px; font-weight: bold');
console.log('Waiting 10 seconds for spacebar test and focus monitoring to complete...');
console.log('After 10 seconds, scroll up to see all results.');
console.log('\nKey things to look for:');
console.log('  1. Are there multiple keydown listeners on document/body?');
console.log('  2. Is the xterm textarea actually focused?');
console.log('  3. Did spacebar get detected in the live test?');
console.log('  4. Did focus shift away from the textarea?');
console.log('  5. Is anything overlaying the textarea?');
