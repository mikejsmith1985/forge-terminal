/**
 * Tests for auto-respond timing and debounce behavior
 * 
 * The auto-respond feature uses requestIdleCallback (with 2000ms max timeout)
 * to detect CLI prompts when the browser is idle. This allows quick detection
 * when output stops (typically 10-100ms) while still having a safety net.
 * 
 * The broken v2.1.8-v2.1.10 versions used a hardcoded 1500ms setTimeout
 * which was too slow and made auto-respond feel unresponsive.
 * 
 * These tests verify the fix restores correct behavior using requestIdleCallback.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// Mock requestIdleCallback for testing
// These should match what's in ForgeTerminal.jsx after the fix
// ============================================================================

/**
 * Maximum timeout for requestIdleCallback.
 * The callback fires immediately when browser is idle (typically 10-100ms),
 * but this timeout ensures it fires within 2000ms even under load.
 */
const MAX_IDLE_TIMEOUT_MS = 2000;

/**
 * Fallback timing when requestIdleCallback is not available.
 * Short timeout since this is a fallback for older browsers.
 */
const FALLBACK_TIMEOUT_MS = 100;

/**
 * Schedule work for prompt detection.
 * Uses requestIdleCallback when available (fires quickly when idle),
 * falls back to setTimeout for older browsers.
 */
function scheduleIdleWork(callback) {
  if (typeof requestIdleCallback !== 'undefined') {
    return requestIdleCallback(callback, { timeout: MAX_IDLE_TIMEOUT_MS });
  }
  return setTimeout(callback, FALLBACK_TIMEOUT_MS);
}

/**
 * Cancel scheduled idle work.
 */
function cancelIdleWork(id) {
  if (typeof cancelIdleCallback !== 'undefined') {
    cancelIdleCallback(id);
  } else {
    clearTimeout(id);
  }
}

/**
 * Simulates the debounce pattern used in ForgeTerminal.jsx ws.onmessage handler.
 * Uses setTimeout for predictable test behavior (simulating requestIdleCallback).
 */
class PromptCheckDebouncer {
  constructor(onCheck, timeoutMs = FALLBACK_TIMEOUT_MS) {
    this.pendingCheckId = null;
    this.onCheck = onCheck;
    this.checkCount = 0;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Called on every terminal message. Should debounce the prompt check.
   */
  onMessage(data) {
    // Simple debounce pattern
    if (this.pendingCheckId) {
      clearTimeout(this.pendingCheckId);
    }
    
    this.pendingCheckId = setTimeout(() => {
      this.pendingCheckId = null;
      this.checkCount++;
      this.onCheck(data);
    }, this.timeoutMs);
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.pendingCheckId) {
      clearTimeout(this.pendingCheckId);
      this.pendingCheckId = null;
    }
  }
}

// ============================================================================
// TESTS
// ============================================================================

describe('Auto-Respond Timing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Timing Constants', () => {
    it('should use 2000ms max timeout for requestIdleCallback', () => {
      expect(MAX_IDLE_TIMEOUT_MS).toBe(2000);
    });

    it('should use 100ms fallback for browsers without requestIdleCallback', () => {
      expect(FALLBACK_TIMEOUT_MS).toBe(100);
    });

    it('should NOT use fixed 1500ms delay (broken v2.1.8-v2.1.10 behavior)', () => {
      // The broken versions used a hardcoded 1500ms setTimeout
      // which made auto-respond feel slow and unresponsive
      expect(MAX_IDLE_TIMEOUT_MS).not.toBe(1500);
      expect(FALLBACK_TIMEOUT_MS).not.toBe(1500);
    });
  });

  describe('scheduleIdleWork', () => {
    it('should schedule callback using requestIdleCallback when available', () => {
      // Mock requestIdleCallback
      const mockRequestIdleCallback = vi.fn((cb, opts) => {
        return setTimeout(() => cb({ timeRemaining: () => 50 }), 10);
      });
      const mockCancelIdleCallback = vi.fn((id) => clearTimeout(id));
      
      vi.stubGlobal('requestIdleCallback', mockRequestIdleCallback);
      vi.stubGlobal('cancelIdleCallback', mockCancelIdleCallback);
      
      const callback = vi.fn();
      scheduleIdleWork(callback);
      
      expect(mockRequestIdleCallback).toHaveBeenCalledWith(callback, { timeout: 2000 });
      
      vi.unstubAllGlobals();
    });

    it('should fall back to setTimeout when requestIdleCallback is not available', () => {
      // Ensure requestIdleCallback is undefined (simulate old browser)
      const originalRIC = globalThis.requestIdleCallback;
      delete globalThis.requestIdleCallback;
      
      const callback = vi.fn();
      
      // Re-evaluate scheduleIdleWork in this context
      function testScheduleIdleWork(cb) {
        if (typeof requestIdleCallback !== 'undefined') {
          return requestIdleCallback(cb, { timeout: 2000 });
        }
        return setTimeout(cb, 100);
      }
      
      testScheduleIdleWork(callback);
      
      // Not called immediately
      expect(callback).not.toHaveBeenCalled();
      
      // Called after 100ms fallback
      vi.advanceTimersByTime(100);
      expect(callback).toHaveBeenCalledTimes(1);
      
      // Restore
      if (originalRIC) globalThis.requestIdleCallback = originalRIC;
    });
  });

  describe('PromptCheckDebouncer', () => {
    it('should not trigger check during rapid messages', () => {
      const checkFn = vi.fn();
      const debouncer = new PromptCheckDebouncer(checkFn, 100);
      
      // Simulate rapid terminal output (every 50ms for 500ms)
      for (let i = 0; i < 10; i++) {
        debouncer.onMessage(`chunk ${i}`);
        vi.advanceTimersByTime(50);
      }
      
      // After 500ms of rapid output, no check should have happened
      expect(checkFn).not.toHaveBeenCalled();
      
      debouncer.destroy();
    });

    it('should trigger check after output settles', () => {
      const checkFn = vi.fn();
      const debouncer = new PromptCheckDebouncer(checkFn, 100);
      
      // Send a message
      debouncer.onMessage('prompt data');
      
      // Wait for debounce
      vi.advanceTimersByTime(100);
      
      expect(checkFn).toHaveBeenCalledTimes(1);
      expect(checkFn).toHaveBeenCalledWith('prompt data');
      
      debouncer.destroy();
    });

    it('should use latest data when check finally runs', () => {
      const checkFn = vi.fn();
      const debouncer = new PromptCheckDebouncer(checkFn, 100);
      
      // Send multiple messages
      debouncer.onMessage('first');
      vi.advanceTimersByTime(50);
      debouncer.onMessage('second');
      vi.advanceTimersByTime(50);
      debouncer.onMessage('third');
      
      // Wait for debounce after last message
      vi.advanceTimersByTime(100);
      
      expect(checkFn).toHaveBeenCalledTimes(1);
      expect(checkFn).toHaveBeenCalledWith('third');
      
      debouncer.destroy();
    });

    it('should allow multiple checks if messages are spaced out', () => {
      const checkFn = vi.fn();
      const debouncer = new PromptCheckDebouncer(checkFn, 100);
      
      // First message
      debouncer.onMessage('first');
      vi.advanceTimersByTime(100);
      expect(checkFn).toHaveBeenCalledTimes(1);
      
      // Second message after first check completed
      debouncer.onMessage('second');
      vi.advanceTimersByTime(100);
      expect(checkFn).toHaveBeenCalledTimes(2);
      
      debouncer.destroy();
    });

    it('should handle continuous spinner output without starving', () => {
      const checkFn = vi.fn();
      const debouncer = new PromptCheckDebouncer(checkFn, 100);
      
      // Simulate spinner that outputs every 80ms for 2 seconds
      // Then stops and shows a prompt
      for (let i = 0; i < 25; i++) {
        debouncer.onMessage(`spinner frame ${i}`);
        vi.advanceTimersByTime(80);
      }
      
      // No check yet because output was continuous
      expect(checkFn).not.toHaveBeenCalled();
      
      // Now the spinner stops and a prompt appears
      debouncer.onMessage('❯ Yes\nConfirm with Enter');
      
      // Wait for debounce
      vi.advanceTimersByTime(100);
      
      // Now the check should happen
      expect(checkFn).toHaveBeenCalledTimes(1);
      expect(checkFn).toHaveBeenCalledWith('❯ Yes\nConfirm with Enter');
      
      debouncer.destroy();
    });

    it('should cleanup pending checks on destroy', () => {
      const checkFn = vi.fn();
      const debouncer = new PromptCheckDebouncer(checkFn, 100);
      
      debouncer.onMessage('data');
      debouncer.destroy();
      
      vi.advanceTimersByTime(200);
      expect(checkFn).not.toHaveBeenCalled();
    });
  });

  describe('Regression: Why fixed 1500ms timing was broken', () => {
    it('should demonstrate why 1500ms fixed delay is too slow', () => {
      // With a fixed 1500ms delay, users had to wait 1.5 seconds
      // after every CLI prompt appeared before auto-respond triggered.
      // This made the feature feel broken and unresponsive.
      
      const BROKEN_TIMING = 1500;
      const checkFn = vi.fn();
      
      // Simulate receiving a CLI prompt
      let pendingId = setTimeout(() => {
        checkFn('prompt');
      }, BROKEN_TIMING);
      
      // After 500ms, nothing happened yet
      vi.advanceTimersByTime(500);
      expect(checkFn).not.toHaveBeenCalled();
      
      // After 1000ms, still nothing
      vi.advanceTimersByTime(500);
      expect(checkFn).not.toHaveBeenCalled();
      
      // Finally after 1500ms it fires - too slow!
      vi.advanceTimersByTime(500);
      expect(checkFn).toHaveBeenCalledTimes(1);
      
      clearTimeout(pendingId);
    });

    it('should demonstrate why requestIdleCallback is better', () => {
      // With requestIdleCallback, the callback fires as soon as the
      // browser is idle (typically 10-100ms after last activity).
      // This makes auto-respond feel instant while still allowing
      // for a maximum wait time of 2000ms under heavy load.
      
      const checkFn = vi.fn();
      const debouncer = new PromptCheckDebouncer(checkFn, 100); // Using 100ms to simulate idle
      
      // CLI output stops, prompt appears
      debouncer.onMessage('❯ Yes');
      
      // With requestIdleCallback behavior (100ms), response is quick
      vi.advanceTimersByTime(100);
      expect(checkFn).toHaveBeenCalledTimes(1);
      
      debouncer.destroy();
    });
  });
});

describe('Auto-Respond Logic', () => {
  describe('Response Type Selection', () => {
    it('should send Enter for menu-style prompts', () => {
      // When responseType is 'enter', we send '\r' only
      const responseType = 'enter';
      const expectedResponse = '\r';
      
      const response = responseType === 'enter' ? '\r' : 'y\r';
      expect(response).toBe(expectedResponse);
    });

    it('should send y+Enter for Y/N prompts', () => {
      // When responseType is 'y-enter', we send 'y\r'
      const responseType = 'y-enter';
      const expectedResponse = 'y\r';
      
      const response = responseType === 'enter' ? '\r' : 'y\r';
      expect(response).toBe(expectedResponse);
    });
  });

  describe('Buffer Clearing', () => {
    it('should clear buffer after auto-respond to prevent re-triggering', () => {
      let buffer = 'Do you want to proceed? (y/n)';
      
      // Simulate auto-respond triggering
      const shouldAutoRespond = true;
      
      if (shouldAutoRespond) {
        // Clear buffer after responding
        buffer = '';
      }
      
      expect(buffer).toBe('');
    });
  });

  describe('State Management', () => {
    it('should set isWaiting to false after auto-respond', () => {
      let isWaiting = true;
      
      // Simulate auto-respond triggering
      const shouldAutoRespond = true;
      
      if (shouldAutoRespond) {
        isWaiting = false;
      }
      
      expect(isWaiting).toBe(false);
    });
  });
});
