/**
 * @fileoverview DiagnosticCore - Central event collection and formatting system
 * 
 * This module provides comprehensive diagnostic event collection for debugging
 * keyboard, paste, focus, WebSocket, and AM pipeline issues in Forge Terminal.
 * 
 * Design principles:
 * - Fixed-size circular buffer to prevent memory growth
 * - Plain language formatting for user-readable diagnostics
 * - Privacy-conscious: stores content hashes, not actual content
 * - Enable/disable toggle for performance
 * 
 * @example
 * import { diagnosticCore } from './diagnosticCore';
 * diagnosticCore.enable();
 * diagnosticCore.recordKeyboardEvent(event);
 * const report = diagnosticCore.exportSession();
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_BUFFER_SIZE = 2000; // Increased from 500 to capture longer sessions
const DUPLICATE_WINDOW_MS = 100;

/**
 * Event type constants for categorization
 * @readonly
 * @enum {string}
 */
export const EventType = {
  KEYBOARD: 'KEYBOARD',
  PASTE: 'PASTE',
  FOCUS: 'FOCUS',
  WEBSOCKET: 'WEBSOCKET',
  AM: 'AM',
  INIT: 'INIT',
  TERMINAL_DATA: 'TERMINAL_DATA',
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Creates a simple hash of content for comparison without storing actual content
 * Uses a fast non-cryptographic hash suitable for diagnostic comparison
 * @param {string} content - Content to hash
 * @returns {string} - Hash string
 */
function hashContent(content) {
  if (!content) return '';
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}

/**
 * Formats a key name for display
 * @param {string} key - Raw key value
 * @param {string} code - Key code
 * @returns {string} - Formatted key name
 */
function formatKeyName(key, code) {
  if (code === 'Space' || key === ' ') return 'Spacebar';
  if (key === 'Enter' || code === 'Enter') return 'Enter';
  if (key === 'Backspace') return 'Backspace';
  if (key === 'Tab') return 'Tab';
  if (key === 'Escape') return 'Escape';
  if (key?.length === 1) return `'${key}'`;
  return key || code || 'unknown';
}

// ============================================================================
// DIAGNOSTIC EVENT CLASS
// ============================================================================

/**
 * Represents a single diagnostic event
 * @typedef {Object} DiagnosticEvent
 * @property {string} type - Event type (from EventType enum)
 * @property {string} subtype - Event subtype (e.g., 'keydown', 'send')
 * @property {number} timestamp - Absolute timestamp (ms since epoch)
 * @property {number} relativeMs - Relative to session start
 * @property {number} gapMs - Gap since previous event
 * @property {Object} data - Event-specific data
 * @property {string} plainText - Human-readable description
 */

// ============================================================================
// DIAGNOSTIC CORE CLASS
// ============================================================================

/**
 * Central diagnostic event collection and management
 */
export class DiagnosticCore {
  constructor() {
    /** @type {DiagnosticEvent[]} */
    this._buffer = new Array(MAX_BUFFER_SIZE).fill(null);
    this._bufferIndex = 0;
    this._totalEventCount = 0;
    this._sessionStartTime = Date.now();
    this._lastEventTime = this._sessionStartTime;
    this._enabled = false;
    this._sessionId = this._generateSessionId();
    
    // Subscribers for real-time updates
    /** @type {Function[]} */
    this._subscribers = [];
  }

  // --------------------------------------------------------------------------
  // LIFECYCLE
  // --------------------------------------------------------------------------

  /**
   * Enable diagnostic collection
   */
  enable() {
    this._enabled = true;
    this._sessionStartTime = Date.now();
    this._lastEventTime = this._sessionStartTime;
    this._sessionId = this._generateSessionId();
    console.log('[DiagnosticCore] Enabled - session:', this._sessionId);
  }

  /**
   * Disable diagnostic collection
   */
  disable() {
    this._enabled = false;
    console.log('[DiagnosticCore] Disabled');
  }

  /**
   * Check if diagnostics are enabled
   * @returns {boolean}
   */
  isEnabled() {
    return this._enabled;
  }

  /**
   * Clear all events and reset session
   */
  reset() {
    this._buffer.fill(null);
    this._bufferIndex = 0;
    this._totalEventCount = 0;
    this._sessionStartTime = Date.now();
    this._lastEventTime = this._sessionStartTime;
    this._sessionId = this._generateSessionId();
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    this.disable();
    this._subscribers = [];
    this._buffer.fill(null);
  }

  // --------------------------------------------------------------------------
  // EVENT RECORDING
  // --------------------------------------------------------------------------

  /**
   * Record a keyboard event
   * @param {KeyboardEvent|Object} event - Native or synthetic keyboard event
   */
  recordKeyboardEvent(event) {
    if (!this._enabled) return;

    const data = {
      key: event.key || '',
      code: event.code || '',
      subtype: event.type || 'keydown',
      target: event.target?.tagName || 'unknown',
      targetClass: event.target?.className?.slice?.(0, 50) || '',
      prevented: event.defaultPrevented || false,
      ctrlKey: event.ctrlKey || false,
      altKey: event.altKey || false,
      shiftKey: event.shiftKey || false,
      metaKey: event.metaKey || false,
      isTrusted: event.isTrusted ?? true,
    };

    const plainText = this._formatKeyboardEvent(data);
    this._recordEvent(EventType.KEYBOARD, data.subtype, data, plainText);
  }

  /**
   * Record a paste event
   * @param {string} content - Pasted content (will be hashed, not stored)
   * @param {string} source - Source of paste (e.g., 'clipboard-read', 'native')
   */
  recordPasteEvent(content, source = 'clipboard-read') {
    if (!this._enabled) return;

    const data = {
      contentLength: content?.length || 0,
      contentHash: hashContent(content),
      source,
    };

    const plainText = `Paste from ${source}: ${data.contentLength} chars`;
    this._recordEvent(EventType.PASTE, source, data, plainText);
  }

  /**
   * Record a focus event
   * @param {FocusEvent|Object} event - Native or synthetic focus event
   */
  recordFocusEvent(event) {
    if (!this._enabled) return;

    const data = {
      subtype: event.type || 'focus',
      targetTag: event.target?.tagName || 'unknown',
      targetClass: event.target?.className?.slice?.(0, 50) || '',
      relatedTag: event.relatedTarget?.tagName || null,
    };

    const isXterm = data.targetClass.includes('xterm');
    const icon = isXterm ? '✓' : '⚠️';
    const plainText = `${icon} Focus ${data.subtype}: ${data.targetTag}`;
    this._recordEvent(EventType.FOCUS, data.subtype, data, plainText);
  }

  /**
   * Record a WebSocket event
   * @param {string} direction - 'send', 'receive', 'open', 'close', 'error'
   * @param {Object} details - Event details
   */
  recordWebSocketEvent(direction, details = {}) {
    if (!this._enabled) return;

    const data = {
      direction,
      payloadSize: details.length || details.payloadSize || 0,
      payloadHash: details.content ? hashContent(details.content) : null,
      type: details.type || 'text',
      readyState: details.readyState,
    };

    let plainText = `WebSocket ${direction}`;
    if (data.payloadSize > 0) {
      plainText += `: ${data.payloadSize} bytes`;
    }

    // Check for duplicate sends (for double-paste detection)
    if (direction === 'send') {
      const recent = this._getRecentEvents(5);
      const recentSend = recent.find(e => 
        e.type === EventType.WEBSOCKET && 
        e.data.direction === 'send' &&
        e.data.payloadSize === data.payloadSize &&
        (Date.now() - e.timestamp) < DUPLICATE_WINDOW_MS
      );
      if (recentSend) {
        plainText = `⚠️ DUPLICATE WebSocket send: ${data.payloadSize} bytes (within ${DUPLICATE_WINDOW_MS}ms)`;
        data.isDuplicate = true;
      }
    }

    this._recordEvent(EventType.WEBSOCKET, direction, data, plainText);
  }

  /**
   * Record an AM (Artificial Memory) pipeline event
   * @param {string} action - AM action (e.g., 'llm_detected', 'file_write')
   * @param {Object} details - Action details
   */
  recordAMEvent(action, details = {}) {
    if (!this._enabled) return;

    const data = {
      action,
      conversationId: details.conversationId,
      provider: details.provider,
      path: details.path,
      verified: details.verified,
      turnCount: details.turnCount,
      length: details.length,
    };

    let plainText = `AM: ${action}`;
    if (details.provider) plainText += ` (${details.provider})`;
    if (details.path) {
      const filename = details.path.split('/').pop();
      const verified = details.verified ? '✓ verified' : '✗ NOT verified';
      plainText = `AM wrote file: ${filename} ${verified}`;
    }
    if (details.length) plainText += ` (${details.length} chars)`;

    this._recordEvent(EventType.AM, action, data, plainText);
  }

  /**
   * Record an initialization/lifecycle event
   * @param {string} phase - Init phase (e.g., 'app_mounted', 'terminal_mounted')
   * @param {Object} details - Phase details
   */
  recordInitEvent(phase, details = {}) {
    if (!this._enabled) return;

    const data = {
      phase,
      tabId: details.tabId,
      component: details.component,
    };

    const plainText = `Init: ${phase}${details.tabId ? ` (tab: ${details.tabId})` : ''}`;
    this._recordEvent(EventType.INIT, phase, data, plainText);
  }

  /**
   * Record terminal data received (from xterm onData)
   * @param {string} data - Data received
   */
  recordTerminalData(data) {
    if (!this._enabled) return;

    let keyName = 'text';
    if (data === ' ') keyName = 'Spacebar';
    else if (data === '\r' || data === '\n') keyName = 'Enter';
    else if (data === '\x7f' || data === '\b') keyName = 'Backspace';
    else if (data === '\t') keyName = 'Tab';
    else if (data.length === 1) keyName = `'${data}'`;
    else if (data.length > 1) keyName = `text (${data.length} chars)`;

    const eventData = {
      keyName,
      dataLength: data.length,
      dataHash: hashContent(data),
    };

    const plainText = `Terminal received: ${keyName}`;
    this._recordEvent(EventType.TERMINAL_DATA, 'input', eventData, plainText);
  }

  // --------------------------------------------------------------------------
  // EVENT RETRIEVAL
  // --------------------------------------------------------------------------

  /**
   * Get all recorded events (most recent first)
   * @returns {DiagnosticEvent[]}
   */
  getEvents() {
    const events = [];
    for (let i = 0; i < Math.min(this._totalEventCount, MAX_BUFFER_SIZE); i++) {
      const idx = (this._bufferIndex - 1 - i + MAX_BUFFER_SIZE) % MAX_BUFFER_SIZE;
      if (this._buffer[idx]) {
        events.push(this._buffer[idx]);
      }
    }
    return events.reverse(); // Return in chronological order
  }

  /**
   * Get events with plain text formatting
   * @returns {DiagnosticEvent[]}
   */
  getFormattedEvents() {
    return this.getEvents();
  }

  /**
   * Get total event count (including those that overflowed)
   * @returns {number}
   */
  getTotalEventCount() {
    return this._totalEventCount;
  }

  /**
   * Get session start time
   * @returns {number}
   */
  getSessionStartTime() {
    return this._sessionStartTime;
  }

  // --------------------------------------------------------------------------
  // EXPORT & PERSISTENCE
  // --------------------------------------------------------------------------

  /**
   * Export current session as JSON
   * @returns {string} - JSON string
   */
  exportSession() {
    const session = {
      sessionId: this._sessionId,
      startTime: new Date(this._sessionStartTime).toISOString(),
      exportTime: new Date().toISOString(),
      durationMs: Date.now() - this._sessionStartTime,
      totalEvents: this._totalEventCount,
      platform: this._getPlatformInfo(),
      events: this.getEvents(),
    };

    return JSON.stringify(session, null, 2);
  }

  /**
   * Get platform information for debugging
   * @returns {Object}
   */
  _getPlatformInfo() {
    if (typeof window === 'undefined') {
      return { environment: 'node' };
    }

    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      screenWidth: window.screen?.width,
      screenHeight: window.screen?.height,
      devicePixelRatio: window.devicePixelRatio,
      isWSL: navigator.userAgent.includes('WSL') || 
             navigator.userAgent.includes('Linux') && 
             navigator.platform?.includes('Win'),
    };
  }

  // --------------------------------------------------------------------------
  // SUBSCRIPTION (for UI updates)
  // --------------------------------------------------------------------------

  /**
   * Subscribe to new events
   * @param {Function} callback - Called with new event
   * @returns {Function} - Unsubscribe function
   */
  subscribe(callback) {
    this._subscribers.push(callback);
    return () => {
      const index = this._subscribers.indexOf(callback);
      if (index > -1) {
        this._subscribers.splice(index, 1);
      }
    };
  }

  // --------------------------------------------------------------------------
  // INTERNAL METHODS
  // --------------------------------------------------------------------------

  /**
   * Record an event to the circular buffer
   * @private
   */
  _recordEvent(type, subtype, data, plainText) {
    const now = Date.now();
    const gapMs = now - this._lastEventTime;
    this._lastEventTime = now;

    const event = {
      type,
      subtype,
      timestamp: now,
      relativeMs: now - this._sessionStartTime,
      gapMs,
      data,
      plainText,
    };

    // Add to circular buffer
    this._buffer[this._bufferIndex] = event;
    this._bufferIndex = (this._bufferIndex + 1) % MAX_BUFFER_SIZE;
    this._totalEventCount++;

    // Notify subscribers
    this._subscribers.forEach(cb => {
      try {
        cb(event);
      } catch (e) {
        console.error('[DiagnosticCore] Subscriber error:', e);
      }
    });
  }

  /**
   * Get recent events from buffer
   * @private
   */
  _getRecentEvents(count) {
    const events = [];
    for (let i = 0; i < Math.min(count, this._totalEventCount); i++) {
      const idx = (this._bufferIndex - 1 - i + MAX_BUFFER_SIZE) % MAX_BUFFER_SIZE;
      if (this._buffer[idx]) {
        events.push(this._buffer[idx]);
      }
    }
    return events;
  }

  /**
   * Generate a unique session ID
   * @private
   */
  _generateSessionId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `diag-${timestamp}-${random}`;
  }

  /**
   * Format a keyboard event for plain text display
   * @private
   */
  _formatKeyboardEvent(data) {
    const keyName = formatKeyName(data.key, data.code);
    const modifiers = [];
    if (data.ctrlKey) modifiers.push('Ctrl');
    if (data.altKey) modifiers.push('Alt');
    if (data.shiftKey) modifiers.push('Shift');
    if (data.metaKey) modifiers.push('Meta');

    let prefix = modifiers.length > 0 ? modifiers.join('+') + '+' : '';
    let action = data.subtype === 'keydown' ? 'pressed' : 'released';
    let target = data.target === 'TEXTAREA' ? '→ reached TEXTAREA' : `→ target: ${data.target}`;
    let prevented = data.prevented ? ' (PREVENTED)' : '';

    return `${prefix}${keyName} ${action} ${target}${prevented}`;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Global diagnostic core instance
 * @type {DiagnosticCore}
 */
export const diagnosticCore = new DiagnosticCore();

// Expose to window for console debugging
if (typeof window !== 'undefined') {
  window.diagnosticCore = diagnosticCore;
}

export default diagnosticCore;
