/**
 * Keyboard Diagnostics Module
 * 
 * Comprehensive event logging for debugging keyboard input issues.
 * Captures the complete lifecycle of keyboard events through all browser layers.
 * 
 * CRITICAL: This module is designed for zero memory leaks:
 * - Uses a fixed-size circular buffer (no array growth)
 * - Weak references for DOM elements where possible
 * - Single event listeners with proper cleanup
 * - No closures that capture large objects
 */

// Configuration
const CONFIG = {
  MAX_EVENTS: 100,           // Circular buffer size
  LOG_TO_CONSOLE: true,      // Enable/disable console output
  TRACK_KEYS: ['Space', ' ', 'Enter', 'Backspace', 'Tab'],  // Keys to track in detail
  CAPTURE_ALL_KEYS: false,   // Set true to capture all keys (verbose)
};

// Circular buffer for events (fixed size, no memory growth)
let eventBuffer = new Array(CONFIG.MAX_EVENTS).fill(null);
let eventIndex = 0;
let totalEvents = 0;

// State tracking
let isInitialized = false;
let terminalTextarea = null;
let sessionStartTime = Date.now();
let lastEventTime = 0;

// Statistics (primitive values only - no object growth)
let stats = {
  keydownCount: 0,
  keyupCount: 0,
  keypressCount: 0,
  spaceKeydowns: 0,
  spaceReachedOnData: 0,
  enterKeydowns: 0,
  enterReachedOnData: 0,
  backspaceKeydowns: 0,
  backspaceReachedOnData: 0,
  preventedEvents: 0,
  stoppedEvents: 0,
  focusOnBody: 0,
  focusOnTextarea: 0,
  focusElsewhere: 0,
};

/**
 * Add event to circular buffer
 */
function logEvent(event) {
  eventBuffer[eventIndex] = event;
  eventIndex = (eventIndex + 1) % CONFIG.MAX_EVENTS;
  totalEvents++;
}

/**
 * Get current focus target info
 */
function getFocusInfo() {
  const active = document.activeElement;
  const tagName = active?.tagName || 'null';
  const className = active?.className || '';
  const isXtermTextarea = className.includes('xterm-helper-textarea');
  const isBody = tagName === 'BODY';
  
  // Update stats
  if (isBody) stats.focusOnBody++;
  else if (isXtermTextarea) stats.focusOnTextarea++;
  else stats.focusElsewhere++;
  
  return {
    tagName,
    className: className.slice(0, 50),
    isXtermTextarea,
    isBody,
    id: active?.id || '',
  };
}

/**
 * Create event snapshot (minimal object, reuses structure)
 */
function createEventSnapshot(type, e, source) {
  const now = Date.now();
  const gap = now - lastEventTime;
  lastEventTime = now;
  
  return {
    ts: now - sessionStartTime,  // Relative timestamp (smaller number)
    type,
    source,
    key: e?.key || '',
    code: e?.code || '',
    gap,  // Time since last event
    prevented: e?.defaultPrevented || false,
    target: e?.target?.tagName || '',
    focus: getFocusInfo(),
    phase: e?.eventPhase || 0,  // 1=capture, 2=target, 3=bubble
    trusted: e?.isTrusted ?? true,
  };
}

/**
 * Console output with structured formatting
 */
function consoleLog(snapshot) {
  if (!CONFIG.LOG_TO_CONSOLE) return;
  
  const { ts, type, source, key, code, gap, prevented, focus } = snapshot;
  const focusIcon = focus.isXtermTextarea ? '✓' : focus.isBody ? '⚠' : '?';
  const preventIcon = prevented ? '🚫' : '✓';
  
  // Color coding based on key type
  const isTrackedKey = CONFIG.TRACK_KEYS.includes(key) || CONFIG.TRACK_KEYS.includes(code);
  const style = isTrackedKey 
    ? 'color: #ff6b6b; font-weight: bold' 
    : 'color: #888';
  
  console.log(
    `%c[KB ${ts}ms] ${type} ${source}: "${key}" (${code}) | gap:${gap}ms | focus:${focusIcon}${focus.tagName} | prevented:${preventIcon}`,
    style
  );
}

/**
 * Document-level keydown handler (capture phase - sees everything first)
 */
function handleKeydownCapture(e) {
  stats.keydownCount++;
  
  const shouldTrack = CONFIG.CAPTURE_ALL_KEYS || 
    CONFIG.TRACK_KEYS.includes(e.key) || 
    CONFIG.TRACK_KEYS.includes(e.code);
  
  if (!shouldTrack) return;
  
  // Track specific keys
  if (e.code === 'Space' || e.key === ' ') {
    stats.spaceKeydowns++;
    // Log target details for Space key
    console.log('[KB CAPTURE] Space key - target:', e.target.tagName, e.target.className, 'defaultPrevented:', e.defaultPrevented);
  }
  if (e.key === 'Enter') stats.enterKeydowns++;
  if (e.key === 'Backspace') stats.backspaceKeydowns++;
  
  const snapshot = createEventSnapshot('keydown', e, 'doc-capture');
  logEvent(snapshot);
  consoleLog(snapshot);
}

/**
 * Document-level keydown handler (bubble phase - sees what wasn't stopped)
 */
function handleKeydownBubble(e) {
  const shouldTrack = CONFIG.CAPTURE_ALL_KEYS || 
    CONFIG.TRACK_KEYS.includes(e.key) || 
    CONFIG.TRACK_KEYS.includes(e.code);
  
  if (!shouldTrack) return;
  
  // Log if Space was prevented between capture and bubble
  if ((e.code === 'Space' || e.key === ' ') && e.defaultPrevented) {
    console.log('[KB BUBBLE] Space PREVENTED between capture→bubble! Target:', e.target.tagName, e.target.className);
  }
  
  const snapshot = createEventSnapshot('keydown', e, 'doc-bubble');
  logEvent(snapshot);
  consoleLog(snapshot);
  
  if (e.defaultPrevented) stats.preventedEvents++;
}

/**
 * Document-level keyup handler
 */
function handleKeyup(e) {
  stats.keyupCount++;
  
  const shouldTrack = CONFIG.CAPTURE_ALL_KEYS || 
    CONFIG.TRACK_KEYS.includes(e.key) || 
    CONFIG.TRACK_KEYS.includes(e.code);
  
  if (!shouldTrack) return;
  
  const snapshot = createEventSnapshot('keyup', e, 'doc');
  logEvent(snapshot);
  consoleLog(snapshot);
}

/**
 * Track when xterm.js onData receives input
 * Call this from ForgeTerminal.jsx onData handler
 */
export function logOnDataReceived(data) {
  // Check what key this corresponds to
  if (data === ' ') {
    stats.spaceReachedOnData++;
    const snapshot = createEventSnapshot('onData', { key: 'Space', code: 'Space' }, 'xterm');
    snapshot.data = 'SPACE';
    logEvent(snapshot);
    consoleLog(snapshot);
  } else if (data === '\r') {
    stats.enterReachedOnData++;
    const snapshot = createEventSnapshot('onData', { key: 'Enter', code: 'Enter' }, 'xterm');
    snapshot.data = 'ENTER';
    logEvent(snapshot);
    consoleLog(snapshot);
  } else if (data === '\x7f' || data === '\b') {
    stats.backspaceReachedOnData++;
    const snapshot = createEventSnapshot('onData', { key: 'Backspace', code: 'Backspace' }, 'xterm');
    snapshot.data = 'BACKSPACE';
    logEvent(snapshot);
    consoleLog(snapshot);
  }
}

/**
 * Log terminal focus events
 */
function handleFocusChange(e) {
  const snapshot = createEventSnapshot(e.type, e, 'focus');
  logEvent(snapshot);
  
  if (CONFIG.LOG_TO_CONSOLE) {
    const focusInfo = getFocusInfo();
    console.log(
      `%c[KB] ${e.type}: now on ${focusInfo.tagName} (${focusInfo.className.slice(0, 30)})`,
      'color: #4ecdc4'
    );
  }
}

/**
 * Initialize keyboard diagnostics
 * Call once when terminal mounts
 */
export function initKeyboardDiagnostics() {
  if (isInitialized) {
    console.warn('[KB Diagnostics] Already initialized');
    return;
  }
  
  sessionStartTime = Date.now();
  lastEventTime = sessionStartTime;
  
  // Reset stats
  Object.keys(stats).forEach(k => stats[k] = 0);
  
  // Add listeners
  document.addEventListener('keydown', handleKeydownCapture, true);  // Capture phase
  document.addEventListener('keydown', handleKeydownBubble, false);  // Bubble phase
  document.addEventListener('keyup', handleKeyup, true);
  document.addEventListener('focusin', handleFocusChange, true);
  document.addEventListener('focusout', handleFocusChange, true);
  
  // Find xterm textarea
  terminalTextarea = document.querySelector('.xterm-helper-textarea');
  
  isInitialized = true;
  
  // Expose to window for console access (must be after initialization)
  if (typeof window !== 'undefined') {
    window.kbDiag = {
      init: initKeyboardDiagnostics,
      cleanup: cleanupKeyboardDiagnostics,
      summary: getDiagnosticSummary,
      report: printDiagnosticReport,
      events: getRecentEvents,
      stats: () => ({ ...stats }),
    };
  }
  
  console.log('%c[KB Diagnostics] Initialized - tracking Space, Enter, Backspace', 'color: #4ecdc4; font-weight: bold');
  console.log('%c[KB Diagnostics] Focus currently on:', 'color: #4ecdc4', getFocusInfo());
  console.log('%c[KB Diagnostics] Available via window.kbDiag.report()', 'color: #888');
}

/**
 * Cleanup keyboard diagnostics
 * Call when terminal unmounts
 */
export function cleanupKeyboardDiagnostics() {
  if (!isInitialized) return;
  
  document.removeEventListener('keydown', handleKeydownCapture, true);
  document.removeEventListener('keydown', handleKeydownBubble, false);
  document.removeEventListener('keyup', handleKeyup, true);
  document.removeEventListener('focusin', handleFocusChange, true);
  document.removeEventListener('focusout', handleFocusChange, true);
  
  terminalTextarea = null;
  isInitialized = false;
  
  console.log('%c[KB Diagnostics] Cleaned up', 'color: #4ecdc4');
}

/**
 * Get diagnostic summary
 * Call to dump current state
 */
export function getDiagnosticSummary() {
  const summary = {
    sessionDuration: Date.now() - sessionStartTime,
    totalEvents,
    stats: { ...stats },
    focusInfo: getFocusInfo(),
    xtermTextareaFound: !!document.querySelector('.xterm-helper-textarea'),
    xtermTextareaCount: document.querySelectorAll('.xterm-helper-textarea').length,
    recentEvents: getRecentEvents(20),
    
    // Critical metrics
    spaceDeliveryRate: stats.spaceKeydowns > 0 
      ? Math.round((stats.spaceReachedOnData / stats.spaceKeydowns) * 100) 
      : 'N/A',
    enterDeliveryRate: stats.enterKeydowns > 0 
      ? Math.round((stats.enterReachedOnData / stats.enterKeydowns) * 100) 
      : 'N/A',
    backspaceDeliveryRate: stats.backspaceKeydowns > 0 
      ? Math.round((stats.backspaceReachedOnData / stats.backspaceKeydowns) * 100) 
      : 'N/A',
  };
  
  return summary;
}

/**
 * Get recent events from circular buffer
 */
export function getRecentEvents(count = 20) {
  const events = [];
  const start = Math.max(0, totalEvents - count);
  
  for (let i = 0; i < Math.min(count, totalEvents); i++) {
    const idx = (eventIndex - 1 - i + CONFIG.MAX_EVENTS) % CONFIG.MAX_EVENTS;
    if (eventBuffer[idx]) {
      events.unshift(eventBuffer[idx]);
    }
  }
  
  return events;
}

/**
 * Print diagnostic report to console
 */
export function printDiagnosticReport() {
  const summary = getDiagnosticSummary();
  
  console.log('%c╔══════════════════════════════════════════════════════════════╗', 'color: #ff6b6b');
  console.log('%c║           KEYBOARD DIAGNOSTICS REPORT                        ║', 'color: #ff6b6b; font-weight: bold');
  console.log('%c╚══════════════════════════════════════════════════════════════╝', 'color: #ff6b6b');
  
  console.log('\n%c📊 SESSION STATS:', 'color: #4ecdc4; font-weight: bold');
  console.log(`   Duration: ${Math.round(summary.sessionDuration / 1000)}s`);
  console.log(`   Total events tracked: ${summary.totalEvents}`);
  
  console.log('\n%c🎹 KEYBOARD EVENTS:', 'color: #4ecdc4; font-weight: bold');
  console.log(`   Keydowns: ${summary.stats.keydownCount}`);
  console.log(`   Keyups: ${summary.stats.keyupCount}`);
  console.log(`   Prevented: ${summary.stats.preventedEvents}`);
  
  console.log('\n%c🔑 KEY DELIVERY RATES:', 'color: #ff6b6b; font-weight: bold');
  console.log(`   Space:     ${summary.stats.spaceKeydowns} keydowns → ${summary.stats.spaceReachedOnData} reached onData (${summary.spaceDeliveryRate}%)`);
  console.log(`   Enter:     ${summary.stats.enterKeydowns} keydowns → ${summary.stats.enterReachedOnData} reached onData (${summary.enterDeliveryRate}%)`);
  console.log(`   Backspace: ${summary.stats.backspaceKeydowns} keydowns → ${summary.stats.backspaceReachedOnData} reached onData (${summary.backspaceDeliveryRate}%)`);
  
  console.log('\n%c🎯 FOCUS DISTRIBUTION:', 'color: #4ecdc4; font-weight: bold');
  console.log(`   On xterm textarea: ${summary.stats.focusOnTextarea}`);
  console.log(`   On BODY: ${summary.stats.focusOnBody}`);
  console.log(`   Elsewhere: ${summary.stats.focusElsewhere}`);
  
  console.log('\n%c📍 CURRENT STATE:', 'color: #4ecdc4; font-weight: bold');
  console.log(`   Focus on: ${summary.focusInfo.tagName} (${summary.focusInfo.className})`);
  console.log(`   xterm-helper-textarea found: ${summary.xtermTextareaFound}`);
  console.log(`   xterm-helper-textarea count: ${summary.xtermTextareaCount}`);
  
  if (summary.recentEvents.length > 0) {
    console.log('\n%c📜 RECENT EVENTS (last 20):', 'color: #4ecdc4; font-weight: bold');
    console.table(summary.recentEvents.map(e => ({
      time: `${e.ts}ms`,
      type: e.type,
      source: e.source,
      key: e.key,
      gap: `${e.gap}ms`,
      focus: e.focus?.tagName || '',
      prevented: e.prevented ? '🚫' : '✓',
    })));
  }
  
  console.log('\n%c💡 DIAGNOSIS:', 'color: #ff6b6b; font-weight: bold');
  
  // Analyze and provide diagnosis
  if (summary.spaceDeliveryRate !== 'N/A' && summary.spaceDeliveryRate < 100) {
    console.log(`   ⚠️  Only ${summary.spaceDeliveryRate}% of Space keys reached xterm - something is blocking!`);
  }
  if (summary.stats.focusOnBody > summary.stats.focusOnTextarea) {
    console.log('   ⚠️  Focus is frequently on BODY instead of terminal - focus management issue');
  }
  if (summary.xtermTextareaCount > 1) {
    console.log(`   ⚠️  Multiple xterm textareas found (${summary.xtermTextareaCount}) - possible zombie instances`);
  }
  if (summary.xtermTextareaCount === 0) {
    console.log('   ❌ No xterm-helper-textarea found - terminal not properly initialized');
  }
  if (summary.stats.preventedEvents > 0) {
    console.log(`   ⚠️  ${summary.stats.preventedEvents} events had preventDefault called`);
  }
  
  return summary;
}

// Note: window.kbDiag is set up in initKeyboardDiagnostics() to ensure all functions are available
