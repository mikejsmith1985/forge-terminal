/**
 * @fileoverview Performance Instrumentation for UI Freeze Detection
 * 
 * This module provides deep instrumentation to capture the root cause of
 * UI freezes that completely block the JavaScript main thread.
 * 
 * Key features:
 * - Long Task Observer: Captures any operation taking >50ms
 * - Visibility tracking: Detects if tab was backgrounded
 * - Terminal write timing: Measures xterm.write() performance
 * - WebSocket message timing: Measures message processing time
 * - Automatic freeze capture: Saves diagnostics when freeze detected
 * 
 * @example
 * import { performanceInstrumentation } from './performanceInstrumentation';
 * performanceInstrumentation.start();
 */

// ============================================================================
// TYPES & INTERFACES (JSDoc for type hints)
// ============================================================================

/**
 * @typedef {Object} LongTaskEntry
 * @property {number} startTime - When the task started (relative to page load)
 * @property {number} duration - How long the task took in ms
 * @property {string} name - Task name (usually 'self' for same-origin)
 * @property {string} visibilityState - Document visibility when task occurred
 * @property {boolean} hasFocus - Whether document had focus
 */

/**
 * @typedef {Object} FreezeCapture
 * @property {number} timestamp - When freeze was detected
 * @property {number} duration - Freeze duration in ms
 * @property {string} visibilityState - Document visibility state
 * @property {boolean} hasFocus - Whether document had focus
 * @property {LongTaskEntry[]} recentLongTasks - Long tasks before freeze
 * @property {Object} memoryInfo - Memory usage if available
 * @property {Object} lastTerminalWrite - Info about last terminal write
 * @property {Object} lastWebSocketMessage - Info about last WS message
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const LONG_TASK_THRESHOLD_MS = 50;   // Browser standard for "long task"
const FREEZE_THRESHOLD_MS = 1000;    // 1 second = definite freeze
const CRITICAL_FREEZE_MS = 5000;     // 5 seconds = critical freeze
const MAX_LONG_TASK_HISTORY = 100;   // Keep last 100 long tasks
const MAX_TERMINAL_WRITE_HISTORY = 50;
const MAX_WEBSOCKET_MESSAGE_HISTORY = 50;

// ============================================================================
// PERFORMANCE INSTRUMENTATION CLASS
// ============================================================================

class PerformanceInstrumentation {
  constructor() {
    /** @type {LongTaskEntry[]} */
    this._longTasks = [];
    
    /** @type {PerformanceObserver|null} */
    this._longTaskObserver = null;
    
    /** @type {boolean} */
    this._isRunning = false;
    
    /** @type {Function[]} */
    this._freezeCallbacks = [];
    
    /** @type {Object[]} */
    this._terminalWriteHistory = [];
    
    /** @type {Object[]} */
    this._webSocketMessageHistory = [];
    
    /** @type {number} */
    this._startTime = 0;
    
    // Visibility change tracking
    this._visibilityChanges = [];
    this._handleVisibilityChange = this._handleVisibilityChange.bind(this);
  }

  // --------------------------------------------------------------------------
  // LIFECYCLE
  // --------------------------------------------------------------------------

  /**
   * Start performance instrumentation
   */
  start() {
    if (this._isRunning) {
      console.log('[PerfInst] Already running');
      return;
    }

    this._isRunning = true;
    this._startTime = performance.now();
    this._longTasks = [];
    this._visibilityChanges = [];
    
    // Start Long Task Observer
    this._startLongTaskObserver();
    
    // Track visibility changes
    document.addEventListener('visibilitychange', this._handleVisibilityChange);
    
    console.log('[PerfInst] Started - monitoring for freezes');
  }

  /**
   * Stop performance instrumentation
   */
  stop() {
    if (!this._isRunning) return;
    
    this._isRunning = false;
    
    if (this._longTaskObserver) {
      this._longTaskObserver.disconnect();
      this._longTaskObserver = null;
    }
    
    document.removeEventListener('visibilitychange', this._handleVisibilityChange);
    
    console.log('[PerfInst] Stopped');
  }

  /**
   * Check if instrumentation is running
   * @returns {boolean}
   */
  isRunning() {
    return this._isRunning;
  }

  // --------------------------------------------------------------------------
  // LONG TASK OBSERVER
  // --------------------------------------------------------------------------

  /**
   * Start the Long Task Observer
   * @private
   */
  _startLongTaskObserver() {
    if (!('PerformanceObserver' in window)) {
      console.warn('[PerfInst] PerformanceObserver not supported');
      return;
    }

    try {
      this._longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this._recordLongTask(entry);
        }
      });

      this._longTaskObserver.observe({ entryTypes: ['longtask'] });
      console.log('[PerfInst] Long Task Observer started');
    } catch (e) {
      console.warn('[PerfInst] Long Task Observer not supported:', e.message);
    }
  }

  /**
   * Record a long task entry
   * @private
   * @param {PerformanceEntry} entry
   */
  _recordLongTask(entry) {
    const taskEntry = {
      startTime: entry.startTime,
      duration: entry.duration,
      name: entry.name,
      visibilityState: document.visibilityState,
      hasFocus: document.hasFocus(),
      timestamp: Date.now(),
    };

    // Add to history (circular buffer)
    this._longTasks.push(taskEntry);
    if (this._longTasks.length > MAX_LONG_TASK_HISTORY) {
      this._longTasks.shift();
    }

    // Log significant long tasks
    if (entry.duration > 100) {
      console.warn(`[PerfInst] Long task: ${entry.duration.toFixed(0)}ms`, {
        visibilityState: taskEntry.visibilityState,
        hasFocus: taskEntry.hasFocus,
      });
    }

    // Detect freeze (>1 second)
    if (entry.duration >= FREEZE_THRESHOLD_MS) {
      this._handleFreezeDetected(taskEntry);
    }
  }

  // --------------------------------------------------------------------------
  // FREEZE DETECTION
  // --------------------------------------------------------------------------

  /**
   * Handle freeze detection
   * @private
   * @param {LongTaskEntry} taskEntry
   */
  _handleFreezeDetected(taskEntry) {
    const isCritical = taskEntry.duration >= CRITICAL_FREEZE_MS;
    const level = isCritical ? 'CRITICAL' : 'WARNING';
    
    console.error(`[PerfInst] ${level} FREEZE DETECTED: ${taskEntry.duration.toFixed(0)}ms`, {
      visibilityState: taskEntry.visibilityState,
      hasFocus: taskEntry.hasFocus,
      startTime: taskEntry.startTime,
    });

    // Capture full diagnostic state
    const capture = this._captureFreezeDiagnostics(taskEntry);
    
    // Notify callbacks
    this._freezeCallbacks.forEach(cb => {
      try {
        cb(capture);
      } catch (e) {
        console.error('[PerfInst] Freeze callback error:', e);
      }
    });

    // Auto-save to console for debugging
    console.log('[PerfInst] Freeze capture:', JSON.stringify(capture, null, 2));
    
    // Store in window for manual retrieval
    window.__lastFreezeCapture = capture;
    
    // Alert user if critical (>5 seconds) - helps with debugging
    if (isCritical) {
      console.error(
        `%c FREEZE: ${taskEntry.duration.toFixed(0)}ms - Check window.__lastFreezeCapture for details`,
        'background: red; color: white; font-size: 14px; padding: 4px;'
      );
    }
  }

  /**
   * Capture full diagnostic state when freeze detected
   * @private
   * @param {LongTaskEntry} taskEntry
   * @returns {FreezeCapture}
   */
  _captureFreezeDiagnostics(taskEntry) {
    const capture = {
      timestamp: Date.now(),
      duration: taskEntry.duration,
      visibilityState: taskEntry.visibilityState,
      hasFocus: taskEntry.hasFocus,
      taskStartTime: taskEntry.startTime,
      
      // Recent long tasks (before this one)
      recentLongTasks: this._longTasks.slice(-10),
      
      // Visibility change history
      visibilityChanges: this._visibilityChanges.slice(-10),
      
      // Terminal write history
      lastTerminalWrites: this._terminalWriteHistory.slice(-5),
      
      // WebSocket message history
      lastWebSocketMessages: this._webSocketMessageHistory.slice(-5),
      
      // Memory info (Chrome only)
      memoryInfo: this._getMemoryInfo(),
      
      // Runtime info
      runtimeMs: performance.now() - this._startTime,
      
      // User agent for debugging
      userAgent: navigator.userAgent,
    };

    return capture;
  }

  /**
   * Get memory info if available
   * @private
   * @returns {Object|null}
   */
  _getMemoryInfo() {
    // @ts-ignore - Chrome-specific API
    if (performance.memory) {
      return {
        // @ts-ignore
        usedJSHeapSize: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
        // @ts-ignore
        totalJSHeapSize: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
        // @ts-ignore
        jsHeapSizeLimit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024),
      };
    }
    return null;
  }

  // --------------------------------------------------------------------------
  // VISIBILITY TRACKING
  // --------------------------------------------------------------------------

  /**
   * Handle visibility change events
   * @private
   */
  _handleVisibilityChange() {
    const entry = {
      timestamp: Date.now(),
      visibilityState: document.visibilityState,
      hasFocus: document.hasFocus(),
    };
    
    this._visibilityChanges.push(entry);
    if (this._visibilityChanges.length > 20) {
      this._visibilityChanges.shift();
    }
    
    console.log(`[PerfInst] Visibility changed: ${entry.visibilityState}, hasFocus: ${entry.hasFocus}`);
  }

  // --------------------------------------------------------------------------
  // TERMINAL WRITE INSTRUMENTATION
  // --------------------------------------------------------------------------

  /**
   * Record a terminal write operation
   * @param {number} dataSize - Size of data written
   * @param {number} durationMs - Time taken to write
   */
  recordTerminalWrite(dataSize, durationMs) {
    const entry = {
      timestamp: Date.now(),
      dataSize,
      durationMs,
      visibilityState: document.visibilityState,
    };
    
    this._terminalWriteHistory.push(entry);
    if (this._terminalWriteHistory.length > MAX_TERMINAL_WRITE_HISTORY) {
      this._terminalWriteHistory.shift();
    }
    
    // Log slow writes
    if (durationMs > 50) {
      console.warn(`[PerfInst] Slow terminal write: ${durationMs.toFixed(0)}ms for ${dataSize} bytes`);
    }
  }

  /**
   * Wrap a terminal's write method to measure performance
   * @param {Object} terminal - XTerm terminal instance
   * @returns {Object} - The same terminal with wrapped write method
   */
  wrapTerminalWrite(terminal) {
    if (!terminal || !terminal.write) {
      console.warn('[PerfInst] Invalid terminal - cannot wrap write');
      return terminal;
    }

    const originalWrite = terminal.write.bind(terminal);
    const self = this;

    terminal.write = function(data) {
      const start = performance.now();
      originalWrite(data);
      const duration = performance.now() - start;
      
      const dataSize = typeof data === 'string' ? data.length : 
                       data instanceof Uint8Array ? data.length : 0;
      
      self.recordTerminalWrite(dataSize, duration);
    };

    console.log('[PerfInst] Terminal write wrapped for performance monitoring');
    return terminal;
  }

  // --------------------------------------------------------------------------
  // WEBSOCKET INSTRUMENTATION
  // --------------------------------------------------------------------------

  /**
   * Record a WebSocket message processing
   * @param {string} direction - 'send' or 'receive'
   * @param {number} dataSize - Size of message
   * @param {number} processingMs - Time to process
   */
  recordWebSocketMessage(direction, dataSize, processingMs) {
    const entry = {
      timestamp: Date.now(),
      direction,
      dataSize,
      processingMs,
      visibilityState: document.visibilityState,
    };
    
    this._webSocketMessageHistory.push(entry);
    if (this._webSocketMessageHistory.length > MAX_WEBSOCKET_MESSAGE_HISTORY) {
      this._webSocketMessageHistory.shift();
    }
    
    // Log slow processing
    if (processingMs > 50) {
      console.warn(`[PerfInst] Slow WS ${direction}: ${processingMs.toFixed(0)}ms for ${dataSize} bytes`);
    }
  }

  // --------------------------------------------------------------------------
  // CALLBACKS
  // --------------------------------------------------------------------------

  /**
   * Register callback for freeze events
   * @param {Function} callback - Called with FreezeCapture when freeze detected
   * @returns {Function} - Unsubscribe function
   */
  onFreeze(callback) {
    this._freezeCallbacks.push(callback);
    return () => {
      const idx = this._freezeCallbacks.indexOf(callback);
      if (idx >= 0) this._freezeCallbacks.splice(idx, 1);
    };
  }

  // --------------------------------------------------------------------------
  // GETTERS
  // --------------------------------------------------------------------------

  /**
   * Get recent long tasks
   * @returns {LongTaskEntry[]}
   */
  getLongTasks() {
    return [...this._longTasks];
  }

  /**
   * Get current system state
   * @returns {Object}
   */
  getSystemState() {
    return {
      visibilityState: document.visibilityState,
      hasFocus: document.hasFocus(),
      memoryInfo: this._getMemoryInfo(),
      longTaskCount: this._longTasks.length,
      terminalWriteCount: this._terminalWriteHistory.length,
      wsMessageCount: this._webSocketMessageHistory.length,
      runtimeMs: performance.now() - this._startTime,
    };
  }

  /**
   * Export all instrumentation data
   * @returns {Object}
   */
  exportData() {
    return {
      isRunning: this._isRunning,
      startTime: this._startTime,
      runtimeMs: performance.now() - this._startTime,
      systemState: this.getSystemState(),
      longTasks: this.getLongTasks(),
      visibilityChanges: [...this._visibilityChanges],
      terminalWriteHistory: [...this._terminalWriteHistory],
      webSocketMessageHistory: [...this._webSocketMessageHistory],
      lastFreezeCapture: window.__lastFreezeCapture || null,
    };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const performanceInstrumentation = new PerformanceInstrumentation();

// Expose on window for debugging
if (typeof window !== 'undefined') {
  window.performanceInstrumentation = performanceInstrumentation;
}

export default performanceInstrumentation;
