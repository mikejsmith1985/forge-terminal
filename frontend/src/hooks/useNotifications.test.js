import { renderHook, act } from '@testing-library/react';
import { useNotifications } from './useNotifications';

describe('useNotifications', () => {
  let mockNotificationInstance;

  beforeEach(() => {
    mockNotificationInstance = {
      close: vi.fn(),
      onclick: null,
    };

    global.Notification = vi.fn(function () {
      Object.assign(this, mockNotificationInstance);
      return this;
    });
    global.Notification.permission = 'default';
    global.Notification.requestPermission = vi.fn().mockResolvedValue('granted');
  });

  afterEach(() => {
    delete global.Notification;
  });

  // Test 1: isSupported=false when Notification not available
  it('returns isSupported=false when Notification not available', () => {
    delete global.Notification;
    const { result } = renderHook(() => useNotifications());
    expect(result.current.isSupported).toBe(false);
  });

  // Test 2: isSupported=true when Notification available
  it('returns isSupported=true when Notification available', () => {
    const { result } = renderHook(() => useNotifications());
    expect(result.current.isSupported).toBe(true);
  });

  // Test 3: returns current permission state
  describe('returns current permission state', () => {
    it('returns "default" permission', () => {
      global.Notification.permission = 'default';
      const { result } = renderHook(() => useNotifications());
      expect(result.current.permission).toBe('default');
    });

    it('returns "granted" permission', () => {
      global.Notification.permission = 'granted';
      const { result } = renderHook(() => useNotifications());
      expect(result.current.permission).toBe('granted');
    });

    it('returns "denied" permission', () => {
      global.Notification.permission = 'denied';
      const { result } = renderHook(() => useNotifications());
      expect(result.current.permission).toBe('denied');
    });
  });

  // Test 4: requestPermission calls Notification.requestPermission
  it('requestPermission calls Notification.requestPermission', async () => {
    const { result } = renderHook(() => useNotifications());

    await act(async () => {
      await result.current.requestPermission();
    });

    expect(global.Notification.requestPermission).toHaveBeenCalledTimes(1);
  });

  // Test 5: requestPermission updates permission state
  it('requestPermission updates permission state', async () => {
    global.Notification.requestPermission = vi.fn().mockResolvedValue('granted');
    const { result } = renderHook(() => useNotifications());

    expect(result.current.permission).toBe('default');

    await act(async () => {
      const res = await result.current.requestPermission();
      expect(res).toBe('granted');
    });

    expect(result.current.permission).toBe('granted');
  });

  // Test 6: notify creates Notification when permission granted and tab hidden
  it('notify creates a Notification when permission granted and tab hidden', () => {
    global.Notification.permission = 'granted';
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });

    const { result } = renderHook(() => useNotifications());
    let notification;
    act(() => {
      notification = result.current.notify('Test Title', { body: 'Test body' });
    });

    expect(global.Notification).toHaveBeenCalledWith('Test Title', {
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      body: 'Test body',
    });
    expect(notification).not.toBeNull();
    expect(notification.close).toBeDefined();

    // Restore
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
  });

  // Test 7: notify returns null when permission not granted
  it('notify returns null when permission not granted', () => {
    global.Notification.permission = 'denied';
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });

    const { result } = renderHook(() => useNotifications());
    let notification;
    act(() => {
      notification = result.current.notify('Test', { body: 'body' });
    });

    expect(notification).toBeNull();

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
  });

  // Test 8: notify returns null when tab is visible
  it('notify returns null when tab is visible', () => {
    global.Notification.permission = 'granted';
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });

    const { result } = renderHook(() => useNotifications());
    let notification;
    act(() => {
      notification = result.current.notify('Test', { body: 'body' });
    });

    expect(notification).toBeNull();
  });

  // Test 9: notifyCommandComplete formats success message correctly
  it('notifyCommandComplete formats success message correctly', () => {
    global.Notification.permission = 'granted';
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });

    const { result } = renderHook(() => useNotifications());
    act(() => {
      result.current.notifyCommandComplete('npm test', 0);
    });

    expect(global.Notification).toHaveBeenCalledWith('✅ Command Complete', {
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      body: 'npm test (exit 0)',
      tag: 'forge-command',
    });

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
  });

  // Test 10: notifyCommandComplete formats failure message correctly
  it('notifyCommandComplete formats failure message correctly', () => {
    global.Notification.permission = 'granted';
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });

    const { result } = renderHook(() => useNotifications());
    act(() => {
      result.current.notifyCommandComplete('make build', 1);
    });

    expect(global.Notification).toHaveBeenCalledWith('❌ Command Failed', {
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      body: 'make build (exit 1)',
      tag: 'forge-command',
    });

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
  });
});
