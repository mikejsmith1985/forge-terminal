import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('serviceWorker utils', () => {
  let originalServiceWorker;

  beforeEach(() => {
    originalServiceWorker = navigator.serviceWorker;
  });

  afterEach(() => {
    // Restore original navigator.serviceWorker
    if (originalServiceWorker === undefined) {
      delete navigator.serviceWorker;
    } else {
      Object.defineProperty(navigator, 'serviceWorker', {
        value: originalServiceWorker,
        configurable: true,
        writable: true,
      });
    }
    vi.restoreAllMocks();
  });

  describe('registerSW', () => {
    it('calls navigator.serviceWorker.register with /sw.js', async () => {
      const { registerSW } = await import('./serviceWorker.js');
      const mockReg = { scope: '/' };
      const registerMock = vi.fn().mockResolvedValue(mockReg);

      Object.defineProperty(navigator, 'serviceWorker', {
        value: { register: registerMock },
        configurable: true,
        writable: true,
      });

      await registerSW();

      expect(registerMock).toHaveBeenCalledWith('/sw.js');
    });

    it('returns the registration object on success', async () => {
      const { registerSW } = await import('./serviceWorker.js');
      const mockReg = { scope: '/' };
      const registerMock = vi.fn().mockResolvedValue(mockReg);

      Object.defineProperty(navigator, 'serviceWorker', {
        value: { register: registerMock },
        configurable: true,
        writable: true,
      });

      const result = await registerSW();

      expect(result).toBe(mockReg);
    });

    it('returns null when serviceWorker not in navigator', async () => {
      const { registerSW } = await import('./serviceWorker.js');

      // Remove serviceWorker from navigator
      Object.defineProperty(navigator, 'serviceWorker', {
        value: undefined,
        configurable: true,
        writable: true,
      });
      delete navigator.serviceWorker;

      const result = await registerSW();

      expect(result).toBeNull();
    });

    it('returns null when registration rejects', async () => {
      const { registerSW } = await import('./serviceWorker.js');
      const registerMock = vi.fn().mockRejectedValue(new Error('failed'));

      Object.defineProperty(navigator, 'serviceWorker', {
        value: { register: registerMock },
        configurable: true,
        writable: true,
      });

      const result = await registerSW();

      expect(result).toBeNull();
    });
  });

  describe('unregisterSW', () => {
    it('calls unregister on all registrations', async () => {
      const { unregisterSW } = await import('./serviceWorker.js');
      const unregMock1 = vi.fn().mockResolvedValue(true);
      const unregMock2 = vi.fn().mockResolvedValue(true);
      const mockRegs = [
        { unregister: unregMock1 },
        { unregister: unregMock2 },
      ];
      const getRegsMock = vi.fn().mockResolvedValue(mockRegs);

      Object.defineProperty(navigator, 'serviceWorker', {
        value: { getRegistrations: getRegsMock },
        configurable: true,
        writable: true,
      });

      await unregisterSW();

      expect(unregMock1).toHaveBeenCalled();
      expect(unregMock2).toHaveBeenCalled();
    });

    it('resolves to empty array when no serviceWorker support', async () => {
      const { unregisterSW } = await import('./serviceWorker.js');

      Object.defineProperty(navigator, 'serviceWorker', {
        value: undefined,
        configurable: true,
        writable: true,
      });
      delete navigator.serviceWorker;

      const result = await unregisterSW();

      expect(result).toEqual([]);
    });
  });
});
