/**
 * @fileoverview Unit tests for DiagnosticCore
 * 
 * Tests the core diagnostic event collection, buffering, and formatting system.
 * Written first following TDD principles.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DiagnosticCore, EventType } from '../utils/diagnosticCore';

describe('DiagnosticCore', () => {
  let diagnosticCore;

  beforeEach(() => {
    diagnosticCore = new DiagnosticCore();
    diagnosticCore.enable();
  });

  afterEach(() => {
    diagnosticCore?.cleanup();
  });

  describe('Event Collection', () => {
    it('should collect keyboard events with correct structure', () => {
      // Arrange
      const mockEvent = {
        type: 'keydown',
        key: ' ',
        code: 'Space',
        target: { tagName: 'TEXTAREA', className: 'xterm-helper-textarea' },
        defaultPrevented: false,
        ctrlKey: false,
        isTrusted: true,
      };

      // Act
      diagnosticCore.recordKeyboardEvent(mockEvent);
      const events = diagnosticCore.getEvents();

      // Assert
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'KEYBOARD',
        subtype: 'keydown',
      });
      expect(events[0].data.key).toBe(' ');
      expect(events[0].data.target).toBe('TEXTAREA');
      expect(events[0].data.prevented).toBe(false);
    });

    it('should collect paste events with content hash (not full content for privacy)', () => {
      // Arrange
      const pastedText = 'sensitive password 123';

      // Act
      diagnosticCore.recordPasteEvent(pastedText, 'clipboard-read');
      const events = diagnosticCore.getEvents();

      // Assert
      expect(events[0].data.contentLength).toBe(22);
      expect(events[0].data.contentHash).toBeDefined();
      expect(events[0].data.content).toBeUndefined(); // Should NOT store actual content
    });

    it('should collect focus events', () => {
      // Arrange
      const mockEvent = {
        type: 'focusin',
        target: { tagName: 'TEXTAREA', className: 'xterm-helper-textarea' },
      };

      // Act
      diagnosticCore.recordFocusEvent(mockEvent);
      const events = diagnosticCore.getEvents();

      // Assert
      expect(events[0].type).toBe('FOCUS');
      expect(events[0].data.targetTag).toBe('TEXTAREA');
    });

    it('should collect WebSocket events', () => {
      // Act
      diagnosticCore.recordWebSocketEvent('send', { length: 100, type: 'text' });
      const events = diagnosticCore.getEvents();

      // Assert
      expect(events[0].type).toBe('WEBSOCKET');
      expect(events[0].data.direction).toBe('send');
      expect(events[0].data.payloadSize).toBe(100);
    });

    it('should collect AM pipeline events', () => {
      // Act
      diagnosticCore.recordAMEvent('conversation_start', { 
        conversationId: 'conv-123',
        provider: 'github-copilot' 
      });
      const events = diagnosticCore.getEvents();

      // Assert
      expect(events[0].type).toBe('AM');
      expect(events[0].data.action).toBe('conversation_start');
    });

    it('should collect init/lifecycle events', () => {
      // Act
      diagnosticCore.recordInitEvent('terminal_mounted', { tabId: 'tab-1' });
      const events = diagnosticCore.getEvents();

      // Assert
      expect(events[0].type).toBe('INIT');
      expect(events[0].data.phase).toBe('terminal_mounted');
    });
  });

  describe('Circular Buffer', () => {
    it('should maintain maximum buffer size of 500 events', () => {
      // Arrange - record 600 events
      for (let i = 0; i < 600; i++) {
        diagnosticCore.recordKeyboardEvent({ key: 'a', code: 'KeyA', type: 'keydown' });
      }

      // Assert
      expect(diagnosticCore.getEvents().length).toBe(500);
      expect(diagnosticCore.getTotalEventCount()).toBe(600);
    });

    it('should preserve most recent events when buffer overflows', () => {
      // Arrange - record events with identifiable keys
      for (let i = 0; i < 510; i++) {
        diagnosticCore.recordKeyboardEvent({ 
          key: String(i), 
          code: `Key${i}`, 
          type: 'keydown' 
        });
      }

      // Assert - oldest 10 should be gone, newest should be present
      const events = diagnosticCore.getEvents();
      expect(events[0].data.key).toBe('10'); // First 10 were dropped
      expect(events[events.length - 1].data.key).toBe('509');
    });
  });

  describe('Plain Language Formatting', () => {
    it('should format keyboard events in plain language', () => {
      // Arrange
      diagnosticCore.recordKeyboardEvent({
        type: 'keydown',
        key: ' ',
        code: 'Space',
        target: { tagName: 'TEXTAREA' },
        defaultPrevented: false,
      });

      // Act
      const formatted = diagnosticCore.getFormattedEvents()[0];

      // Assert
      expect(formatted.plainText).toContain('Spacebar');
      expect(formatted.plainText).toContain('TEXTAREA');
    });

    it('should format paste events with duplicate warning', () => {
      // Arrange - simulate paste followed by two sends (duplicate detection uses timing)
      diagnosticCore.recordPasteEvent('hello', 'clipboard-read');
      diagnosticCore.recordWebSocketEvent('send', { length: 5 });
      // Immediate second send should be flagged as duplicate
      diagnosticCore.recordWebSocketEvent('send', { length: 5 });

      // Act
      const formatted = diagnosticCore.getFormattedEvents();

      // Assert - third event should have duplicate warning
      expect(formatted[2].plainText).toContain('DUPLICATE');
    });

    it('should format AM events with file verification', () => {
      // Arrange
      diagnosticCore.recordAMEvent('file_write', { 
        path: '~/.forge/am/conv-123.json',
        verified: true 
      });

      // Act
      const formatted = diagnosticCore.getFormattedEvents()[0];

      // Assert
      expect(formatted.plainText).toContain('conv-123.json');
      expect(formatted.plainText).toContain('verified');
    });
  });

  describe('Session Persistence', () => {
    it('should export session to JSON', () => {
      // Arrange
      diagnosticCore.recordKeyboardEvent({ key: 'a', code: 'KeyA', type: 'keydown' });

      // Act
      const json = diagnosticCore.exportSession();
      const parsed = JSON.parse(json);

      // Assert
      expect(parsed.events).toHaveLength(1);
      expect(parsed.sessionId).toBeDefined();
      expect(parsed.startTime).toBeDefined();
    });

    it('should include platform info in export', () => {
      // Act
      const json = diagnosticCore.exportSession();
      const parsed = JSON.parse(json);

      // Assert
      expect(parsed.platform).toBeDefined();
    });
  });

  describe('Enable/Disable Toggle', () => {
    it('should not collect events when disabled', () => {
      // Arrange
      diagnosticCore.disable();

      // Act
      diagnosticCore.recordKeyboardEvent({ key: 'a', code: 'KeyA', type: 'keydown' });

      // Assert
      expect(diagnosticCore.getEvents()).toHaveLength(0);
    });

    it('should resume collection when re-enabled', () => {
      // Arrange
      diagnosticCore.disable();
      diagnosticCore.enable();

      // Act
      diagnosticCore.recordKeyboardEvent({ key: 'a', code: 'KeyA', type: 'keydown' });

      // Assert
      expect(diagnosticCore.getEvents()).toHaveLength(1);
    });
  });
});

describe('EventTimestamps', () => {
  it('should record relative timestamps from session start', async () => {
    const core = new DiagnosticCore();
    core.enable();
    
    // Wait a bit then record event
    await new Promise(r => setTimeout(r, 50));
    core.recordKeyboardEvent({ key: 'a', code: 'KeyA', type: 'keydown' });
    
    const event = core.getEvents()[0];
    expect(event.relativeMs).toBeGreaterThanOrEqual(45); // Allow some tolerance
    expect(event.relativeMs).toBeLessThan(150);
    
    core.cleanup();
  });

  it('should record gap between consecutive events', async () => {
    const core = new DiagnosticCore();
    core.enable();
    
    core.recordKeyboardEvent({ key: 'a', code: 'KeyA', type: 'keydown' });
    await new Promise(r => setTimeout(r, 30));
    core.recordKeyboardEvent({ key: 'b', code: 'KeyB', type: 'keydown' });
    
    const events = core.getEvents();
    expect(events[1].gapMs).toBeGreaterThanOrEqual(25); // Allow some tolerance
    
    core.cleanup();
  });
});
