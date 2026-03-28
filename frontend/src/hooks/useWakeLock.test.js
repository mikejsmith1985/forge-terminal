import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWakeLock } from './useWakeLock';

describe('useWakeLock', () => {
  let mockRelease;
  let mockWakeLock;
  let mockRequest;
  let releaseHandler;

  function installWakeLockMock() {
    mockRelease = vi.fn().mockResolvedValue(undefined);
    releaseHandler = null;
    mockWakeLock = {
      released: false,
      release: mockRelease,
      addEventListener: vi.fn((event, handler) => {
        if (event === 'release') releaseHandler = handler;
      }),
      removeEventListener: vi.fn(),
    };
    mockRequest = vi.fn().mockResolvedValue(mockWakeLock);
    Object.defineProperty(navigator, 'wakeLock', {
      value: { request: mockRequest },
      writable: true,
      configurable: true,
    });
  }

  function removeWakeLockMock() {
    if ('wakeLock' in navigator) {
      delete navigator.wakeLock;
    }
  }

  afterEach(() => {
    removeWakeLockMock();
    vi.restoreAllMocks();
  });

  // Test 1: isSupported=false when API not available
  it('returns isSupported=false when Wake Lock API not available', () => {
    removeWakeLockMock();
    const { result } = renderHook(() => useWakeLock());
    expect(result.current.isSupported).toBe(false);
    expect(result.current.isActive).toBe(false);
  });

  // Test 2: isSupported=true when API available
  it('returns isSupported=true when Wake Lock API available', async () => {
    installWakeLockMock();
    const { result } = renderHook(() => useWakeLock());
    // Wait for async auto-request to settle
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.isSupported).toBe(true);
  });

  // Test 3: requests wake lock on mount when enabled
  it('requests wake lock on mount when enabled', async () => {
    installWakeLockMock();
    const { result } = renderHook(() => useWakeLock(true));

    // Wait for the async requestLock to complete
    await act(async () => {
      await vi.waitFor(() => {
        expect(mockRequest).toHaveBeenCalledWith('screen');
      });
    });

    expect(result.current.isActive).toBe(true);
  });

  // Test 4: releases wake lock on unmount
  it('releases wake lock on unmount', async () => {
    installWakeLockMock();
    const { result, unmount } = renderHook(() => useWakeLock(true));

    await act(async () => {
      await vi.waitFor(() => {
        expect(mockRequest).toHaveBeenCalled();
      });
    });

    expect(result.current.isActive).toBe(true);

    await act(async () => {
      unmount();
    });

    expect(mockRelease).toHaveBeenCalled();
  });

  // Test 5: re-acquires on visibility change to visible
  it('re-acquires wake lock on visibility change to visible', async () => {
    installWakeLockMock();
    renderHook(() => useWakeLock(true));

    await act(async () => {
      await vi.waitFor(() => {
        expect(mockRequest).toHaveBeenCalledTimes(1);
      });
    });

    // Simulate tab becoming visible again
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    });

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Should have been called a second time
    await act(async () => {
      await vi.waitFor(() => {
        expect(mockRequest).toHaveBeenCalledTimes(2);
      });
    });
  });

  // Test 6: does not request when enabled=false
  it('does not request wake lock when enabled=false', async () => {
    installWakeLockMock();
    const { result } = renderHook(() => useWakeLock(false));

    // Give it a tick to ensure nothing fires
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(mockRequest).not.toHaveBeenCalled();
    expect(result.current.isActive).toBe(false);
    expect(result.current.isSupported).toBe(true);
  });

  // Test 7: gracefully handles request rejection
  it('gracefully handles request rejection', async () => {
    installWakeLockMock();
    mockRequest.mockRejectedValueOnce(new DOMException('Not allowed', 'NotAllowedError'));

    const { result } = renderHook(() => useWakeLock(true));

    await act(async () => {
      await vi.waitFor(() => {
        expect(mockRequest).toHaveBeenCalled();
      });
    });

    expect(result.current.isActive).toBe(false);
  });
});
