import { renderHook, act } from '@testing-library/react';
import { useAssistantStream } from '../hooks/useAssistantStream';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock WebSocket
class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.send = vi.fn();
    this.close = vi.fn();
    this.addEventListener = vi.fn();
    this.removeEventListener = vi.fn();
    mockWebSocketInstance = this;
  }
}

let mockWebSocketInstance;
global.WebSocket = MockWebSocket;

describe('useAssistantStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWebSocketInstance = null;
  });

  it('should initialize with empty state', () => {
    const { result } = renderHook(() => useAssistantStream('tab-1'));
    expect(result.current.messages).toEqual([]);
    expect(result.current.isThinking).toBe(false);
    expect(result.current.isConnected).toBe(false);
  });

  it('should handle assistant_thinking event', () => {
    const { result } = renderHook(() => useAssistantStream('tab-1'));
    
    // Simulate WebSocket open
    const openHandler = mockWebSocketInstance.addEventListener.mock.calls.find(call => call[0] === 'open')[1];
    act(() => openHandler());

    // Simulate message
    const messageHandler = mockWebSocketInstance.addEventListener.mock.calls.find(call => call[0] === 'message')[1];
    const event = {
      data: JSON.stringify({
        type: 'assistant_thinking',
        tabId: 'tab-1',
        metadata: { content: 'Thinking...' }
      })
    };
    
    act(() => messageHandler(event));

    expect(result.current.isThinking).toBe(true);
    expect(result.current.thinkingContent).toBe('Thinking...');
  });

  it('should handle assistant_response event', () => {
    const { result } = renderHook(() => useAssistantStream('tab-1'));
    
    // Need to ensure WS is "connected" or at least the hook has run
    const messageHandler = mockWebSocketInstance.addEventListener.mock.calls.find(call => call[0] === 'message')[1];
    const event = {
      data: JSON.stringify({
        type: 'assistant_response',
        tabId: 'tab-1',
        metadata: { content: 'Hello' }
      })
    };
    
    act(() => messageHandler(event));

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].content).toBe('Hello');
    expect(result.current.isThinking).toBe(false);
  });
});
