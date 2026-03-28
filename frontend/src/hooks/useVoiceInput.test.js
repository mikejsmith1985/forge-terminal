import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVoiceInput } from './useVoiceInput';

describe('useVoiceInput', () => {
  let mockRecognition;
  let MockSpeechRecognition;

  beforeEach(() => {
    mockRecognition = {
      start: vi.fn(),
      stop: vi.fn(),
      abort: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      continuous: false,
      interimResults: false,
      lang: '',
    };
    MockSpeechRecognition = vi.fn(function () { return mockRecognition; });
    global.webkitSpeechRecognition = MockSpeechRecognition;
  });

  afterEach(() => {
    delete global.webkitSpeechRecognition;
    delete global.SpeechRecognition;
  });

  it('returns isSupported=true when SpeechRecognition available', () => {
    const { result } = renderHook(() => useVoiceInput());
    expect(result.current.isSupported).toBe(true);
  });

  it('returns isSupported=false when SpeechRecognition unavailable', () => {
    delete global.webkitSpeechRecognition;
    const { result } = renderHook(() => useVoiceInput());
    expect(result.current.isSupported).toBe(false);
  });

  it('starts recognition on startListening', () => {
    const { result } = renderHook(() => useVoiceInput());
    act(() => {
      result.current.startListening();
    });
    expect(mockRecognition.start).toHaveBeenCalled();
  });

  it('sets isListening=true when started', () => {
    const { result } = renderHook(() => useVoiceInput());
    act(() => {
      result.current.startListening();
    });
    expect(result.current.isListening).toBe(true);
  });

  it('stops recognition on stopListening', () => {
    const { result } = renderHook(() => useVoiceInput());
    act(() => {
      result.current.startListening();
    });
    act(() => {
      result.current.stopListening();
    });
    expect(mockRecognition.stop).toHaveBeenCalled();
  });

  it('calls onResult with transcript', () => {
    const onResult = vi.fn();
    const { result } = renderHook(() => useVoiceInput({ onResult }));
    
    act(() => {
      result.current.startListening();
    });

    // Find and call the 'result' event handler
    const resultHandler = mockRecognition.addEventListener.mock.calls.find(
      c => c[0] === 'result'
    )?.[1];
    
    if (resultHandler) {
      act(() => {
        resultHandler({
          results: [[{ transcript: 'hello world' }]],
          resultIndex: 0,
        });
      });
      expect(onResult).toHaveBeenCalledWith('hello world');
    }
  });

  it('does nothing when unsupported and startListening called', () => {
    delete global.webkitSpeechRecognition;
    const { result } = renderHook(() => useVoiceInput());
    act(() => {
      result.current.startListening();
    });
    expect(result.current.isListening).toBe(false);
  });
});
