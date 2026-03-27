import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useClipboardBridge } from './useClipboardBridge';

describe('useClipboardBridge', () => {
  let mockWs;

  beforeEach(() => {
    mockWs = {
      send: vi.fn(),
      readyState: 1, // OPEN
    };
  });

  it('copyToServer sends CLIPBOARD_WRITE message', () => {
    const { result } = renderHook(() => useClipboardBridge(mockWs));
    act(() => {
      result.current.copyToServer('test content');
    });
    expect(mockWs.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'CLIPBOARD_WRITE', content: 'test content' })
    );
  });

  it('requestFromServer sends CLIPBOARD_READ message', () => {
    const { result } = renderHook(() => useClipboardBridge(mockWs));
    act(() => {
      result.current.requestFromServer();
    });
    expect(mockWs.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'CLIPBOARD_READ' })
    );
  });

  it('does not send when WebSocket is not open', () => {
    mockWs.readyState = 3; // CLOSED
    const { result } = renderHook(() => useClipboardBridge(mockWs));
    act(() => {
      result.current.copyToServer('test');
    });
    expect(mockWs.send).not.toHaveBeenCalled();
  });

  it('does not send when ws is null', () => {
    const { result } = renderHook(() => useClipboardBridge(null));
    act(() => {
      result.current.copyToServer('test');
    });
    // Should not throw
  });

  it('handleMessage processes CLIPBOARD_CONTENT response', () => {
    const { result } = renderHook(() => useClipboardBridge(mockWs));
    act(() => {
      result.current.handleMessage({ type: 'CLIPBOARD_CONTENT', content: 'from server' });
    });
    expect(result.current.serverClipboard).toBe('from server');
  });
});
