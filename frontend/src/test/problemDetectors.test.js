/**
 * @fileoverview Unit tests for Problem Detectors
 * 
 * Tests detection algorithms for the four known problems:
 * 1. Double paste
 * 2. Spacebar blocked
 * 3. AM stale (no file output)
 * 4. Hydration issue (keyboard fails after load)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  DoublePasteDetector,
  SpacebarBlockedDetector,
  AMStaleDetector,
  HydrationIssueDetector,
  ProblemDetectorManager
} from '../utils/problemDetectors';
import { EventType } from '../utils/diagnosticCore';

describe('DoublePasteDetector', () => {
  let detector;

  beforeEach(() => {
    detector = new DoublePasteDetector();
  });

  describe('Detection Logic', () => {
    it('should detect duplicate WebSocket sends within 100ms window', () => {
      // Arrange - simulate paste followed by two sends
      const events = [
        { type: EventType.PASTE, timestamp: 1000, data: { contentHash: 'abc123', contentLength: 10 } },
        { type: EventType.WEBSOCKET, timestamp: 1010, relativeMs: 10, data: { direction: 'send', payloadSize: 10 } },
        { type: EventType.WEBSOCKET, timestamp: 1050, relativeMs: 50, data: { direction: 'send', payloadSize: 10 } }, // Duplicate!
      ];

      // Act
      const result = detector.analyze(events);

      // Assert
      expect(result.detected).toBe(true);
      expect(result.problem).toBe('DOUBLE_PASTE');
      expect(result.explanation).toContain('TWO WebSocket sends');
    });

    it('should NOT detect when sends have different payload sizes', () => {
      const events = [
        { type: EventType.PASTE, timestamp: 1000, data: { contentHash: 'abc123', contentLength: 10 } },
        { type: EventType.WEBSOCKET, timestamp: 1010, data: { direction: 'send', payloadSize: 10 } },
        { type: EventType.WEBSOCKET, timestamp: 1050, data: { direction: 'send', payloadSize: 5 } }, // Different size
      ];

      const result = detector.analyze(events);
      expect(result.detected).toBe(false);
    });

    it('should NOT detect when sends are more than 100ms apart', () => {
      const events = [
        { type: EventType.PASTE, timestamp: 1000, data: { contentHash: 'abc123', contentLength: 10 } },
        { type: EventType.WEBSOCKET, timestamp: 1010, data: { direction: 'send', payloadSize: 10 } },
        { type: EventType.WEBSOCKET, timestamp: 1200, data: { direction: 'send', payloadSize: 10 } }, // Too late
      ];

      const result = detector.analyze(events);
      expect(result.detected).toBe(false);
    });

    it('should provide plain language explanation', () => {
      const events = [
        { type: EventType.PASTE, timestamp: 1000, relativeMs: 0, data: { contentHash: 'abc123', contentLength: 10 } },
        { type: EventType.WEBSOCKET, timestamp: 1010, relativeMs: 10, data: { direction: 'send', payloadSize: 10 } },
        { type: EventType.WEBSOCKET, timestamp: 1050, relativeMs: 50, data: { direction: 'send', payloadSize: 10 } },
      ];

      const result = detector.analyze(events);
      expect(result.explanation).toContain('Ctrl+V');
      expect(result.explanation).toContain('double paste');
    });
  });
});

describe('SpacebarBlockedDetector', () => {
  let detector;

  beforeEach(() => {
    detector = new SpacebarBlockedDetector();
  });

  describe('Detection Logic', () => {
    it('should detect when spacebar keydown fires but onData never receives it', () => {
      const events = [
        { type: EventType.KEYBOARD, timestamp: 1000, relativeMs: 0, data: { key: ' ', code: 'Space', subtype: 'keydown', prevented: false, target: 'TEXTAREA' } },
        { type: EventType.KEYBOARD, timestamp: 1020, data: { key: ' ', code: 'Space', subtype: 'keyup', target: 'TEXTAREA' } },
        // No TERMINAL_DATA event for space!
      ];

      const result = detector.analyze(events);
      expect(result.detected).toBe(true);
      expect(result.problem).toBe('SPACEBAR_BLOCKED');
    });

    it('should NOT detect when spacebar reaches terminal', () => {
      const events = [
        { type: EventType.KEYBOARD, timestamp: 1000, data: { key: ' ', code: 'Space', subtype: 'keydown', prevented: false, target: 'TEXTAREA' } },
        { type: EventType.TERMINAL_DATA, timestamp: 1010, data: { keyName: 'Spacebar' } }, // Space reached terminal
        { type: EventType.KEYBOARD, timestamp: 1020, data: { key: ' ', code: 'Space', subtype: 'keyup' } },
      ];

      const result = detector.analyze(events);
      expect(result.detected).toBe(false);
    });

    it('should detect when spacebar is preventDefault-ed', () => {
      const events = [
        { type: EventType.KEYBOARD, timestamp: 1000, data: { key: ' ', code: 'Space', subtype: 'keydown', prevented: true, target: 'TEXTAREA' } },
      ];

      const result = detector.analyze(events);
      expect(result.detected).toBe(true);
      expect(result.explanation).toContain('preventDefault');
    });

    it('should detect when focus is on wrong element', () => {
      const events = [
        { 
          type: EventType.KEYBOARD, 
          timestamp: 1000, 
          data: {
            key: ' ',
            code: 'Space',
            subtype: 'keydown',
            target: 'BODY', // Wrong!
            targetClass: '',
            prevented: false 
          }
        },
      ];

      const result = detector.analyze(events);
      expect(result.detected).toBe(true);
      expect(result.explanation).toContain('BODY');
    });
  });
});

describe('AMStaleDetector', () => {
  let detector;

  beforeEach(() => {
    detector = new AMStaleDetector();
  });

  describe('Detection Logic', () => {
    it('should detect when LLM activity exists but no file writes', () => {
      const events = [
        { type: EventType.AM, timestamp: 1000, data: { action: 'llm_detected', provider: 'github-copilot' } },
        { type: EventType.AM, timestamp: 2000, data: { action: 'input_captured', length: 50 } },
        { type: EventType.AM, timestamp: 5000, data: { action: 'output_captured', length: 200 } },
        // No file_write event!
      ];

      // Simulate 65 seconds passing
      const result = detector.analyze(events, { currentTime: 66000 });
      expect(result.detected).toBe(true);
      expect(result.problem).toBe('AM_NO_OUTPUT');
    });

    it('should NOT detect when file writes occur', () => {
      const events = [
        { type: EventType.AM, timestamp: 1000, data: { action: 'llm_detected', provider: 'github-copilot' } },
        { type: EventType.AM, timestamp: 5000, data: { action: 'file_write', path: 'conv-123.json', verified: true } },
      ];

      const result = detector.analyze(events, { currentTime: 10000 });
      expect(result.detected).toBe(false);
    });

    it('should detect when file write fails verification', () => {
      const events = [
        { type: EventType.AM, timestamp: 1000, data: { action: 'llm_detected', provider: 'github-copilot' } },
        { type: EventType.AM, timestamp: 5000, data: { action: 'file_write', path: 'conv-123.json', verified: false } },
      ];

      const result = detector.analyze(events);
      expect(result.detected).toBe(true);
      expect(result.explanation).toContain('verification');
    });

    it('should compare frontend and backend AM status', () => {
      const frontendEvents = [
        { type: EventType.AM, data: { action: 'conversation_active', conversationId: 'conv-123' } },
      ];
      
      const backendStatus = {
        activeConversations: 0, // Mismatch!
        lastFileWrite: null,
      };

      const result = detector.analyzeWithBackend(frontendEvents, backendStatus);
      expect(result.detected).toBe(true);
      expect(result.explanation).toContain('Frontend sees active conversation');
    });
  });
});

describe('HydrationIssueDetector', () => {
  let detector;

  beforeEach(() => {
    detector = new HydrationIssueDetector();
  });

  describe('Detection Logic', () => {
    it('should detect large gap between mount and first keyboard response', () => {
      const events = [
        { type: EventType.INIT, timestamp: 0, relativeMs: 0, data: { phase: 'app_mounted' } },
        { type: EventType.INIT, timestamp: 50, relativeMs: 50, data: { phase: 'terminal_mounted' } },
        { type: EventType.INIT, timestamp: 100, relativeMs: 100, data: { phase: 'xterm_created' } },
        { type: EventType.INIT, timestamp: 150, relativeMs: 150, data: { phase: 'handlers_attached' } },
        // First keyboard event much later
        { type: EventType.KEYBOARD, timestamp: 2000, relativeMs: 2000, data: { key: 'a', subtype: 'keydown' } },
      ];

      const result = detector.analyze(events);
      expect(result.detected).toBe(true);
      expect(result.problem).toBe('HYDRATION_DELAY');
      expect(result.explanation).toContain('gap');
    });

    it('should detect when first spacebar fails but later ones work', () => {
      const events = [
        { type: EventType.INIT, timestamp: 0, data: { phase: 'handlers_attached' } },
        { type: EventType.KEYBOARD, timestamp: 100, data: { key: ' ', code: 'Space', subtype: 'keydown', target: 'BODY' } },
        { type: EventType.KEYBOARD, timestamp: 200, data: { key: ' ', code: 'Space', subtype: 'keydown', target: 'BODY' } },
        { type: EventType.KEYBOARD, timestamp: 5000, data: { key: ' ', code: 'Space', subtype: 'keydown', target: 'TEXTAREA' } },
      ];

      const result = detector.analyze(events);
      expect(result.detected).toBe(true);
      expect(result.explanation).toContain('spacebar');
    });

    it('should NOT detect when keyboard works immediately', () => {
      const events = [
        { type: EventType.INIT, timestamp: 0, data: { phase: 'handlers_attached' } },
        { type: EventType.KEYBOARD, timestamp: 50, data: { key: ' ', code: 'Space', subtype: 'keydown', target: 'TEXTAREA' } },
        { type: EventType.TERMINAL_DATA, timestamp: 60, data: { keyName: 'Spacebar' } },
      ];

      const result = detector.analyze(events);
      expect(result.detected).toBe(false);
    });
  });
});

describe('ProblemDetectorManager', () => {
  it('should run all detectors and aggregate results', () => {
    const manager = new ProblemDetectorManager();
    const events = [
      { type: EventType.KEYBOARD, timestamp: 1000, data: { key: 'a', code: 'KeyA', subtype: 'keydown' } },
    ];
    
    const results = manager.analyzeAll(events);
    expect(results).toHaveProperty('doublePaste');
    expect(results).toHaveProperty('spacebarBlocked');
    expect(results).toHaveProperty('amStale');
    expect(results).toHaveProperty('hydrationIssue');
  });

  it('should provide summary of detected problems', () => {
    const manager = new ProblemDetectorManager();
    const events = [
      { type: EventType.PASTE, timestamp: 1000, data: { contentHash: 'abc', contentLength: 5 } },
      { type: EventType.WEBSOCKET, timestamp: 1010, relativeMs: 10, data: { direction: 'send', payloadSize: 5 } },
      { type: EventType.WEBSOCKET, timestamp: 1050, relativeMs: 50, data: { direction: 'send', payloadSize: 5 } },
    ];
    
    const summary = manager.getSummary(events);
    expect(summary.problemCount).toBeGreaterThanOrEqual(1);
    expect(summary.problems).toBeInstanceOf(Array);
  });
});
