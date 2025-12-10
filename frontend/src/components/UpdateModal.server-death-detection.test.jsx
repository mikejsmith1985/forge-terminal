import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import UpdateModal from './UpdateModal';

describe('UpdateModal - Server Death Detection & Auto-Refresh', () => {
  const mockUpdateInfo = {
    available: true,
    latestVersion: 'v2.0.0',
    releaseNotes: 'New features and bug fixes',
  };

  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    updateInfo: mockUpdateInfo,
    currentVersion: 'v1.9.0',
    onApplyUpdate: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Use fake timers for better control
    vi.useFakeTimers();
    
    // Mock fetch
    global.fetch = vi.fn();
    
    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    
    // Mock window.location.href setter
    delete window.location;
    window.location = { href: 'http://localhost:8333/' };
  });

  afterEach(() => {
    // Clean up timers
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('Server Death Detection', () => {
    it('should start polling /api/version after successful update', async () => {
      // Mock successful update
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, newVersion: 'v2.0.0' }),
      });

      render(<UpdateModal {...defaultProps} />);
      
      const updateButton = screen.getByRole('button', { name: /Update Now/i });
      fireEvent.click(updateButton);

      // Wait for async fetch to complete
      await waitFor(() => {
        expect(screen.getByText(/Update applied successfully/i)).toBeInTheDocument();
      });

      // Check that watchForServerDeath was called (console log)
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[Update] Watching for server restart')
      );

      // Verify polling interval was set
      expect(vi.getTimerCount()).toBeGreaterThan(0);
    }, 10000);

    it('should poll /api/version with no-cache headers', async () => {
      // Mock successful update
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, newVersion: 'v2.0.0' }),
      });

      // Mock version endpoint for polling (will fail initially)
      global.fetch.mockResolvedValue({
        ok: false,
      });

      render(<UpdateModal {...defaultProps} />);
      
      const updateButton = screen.getByRole('button', { name: /Update Now/i });
      fireEvent.click(updateButton);

      await waitFor(() => {
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('[Update] Watching for server restart')
        );
      });

      // Advance timers to trigger polling
      vi.advanceTimersByTime(500);

      await waitFor(() => {
        const versionCalls = global.fetch.mock.calls.filter(
          call => call[0] === '/api/version'
        );
        expect(versionCalls.length).toBeGreaterThan(0);
        
        // Check cache headers
        if (versionCalls.length > 0) {
          const [, options] = versionCalls[0];
          expect(options.cache).toBe('no-cache');
          expect(options.headers['Cache-Control']).toBe('no-cache');
        }
      });
    });

    it('should log "Server still restarting..." when version endpoint fails', async () => {
      // Mock successful update
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, newVersion: 'v2.0.0' }),
      });

      // Mock version endpoint failing (server down)
      global.fetch.mockRejectedValue(new Error('Connection refused'));

      render(<UpdateModal {...defaultProps} />);
      
      const updateButton = screen.getByRole('button', { name: /Update Now/i });
      fireEvent.click(updateButton);

      // Wait for update to complete
      await waitFor(() => {
        expect(screen.getByText(/Update applied successfully/i)).toBeInTheDocument();
      });

      // Advance timer to trigger first poll
      vi.advanceTimersByTime(500);
      
      // Allow promises to flush
      await Promise.resolve();

      await waitFor(() => {
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('[Update] Server still restarting')
        );
      });
    }, 10000);

    it('should detect server recovery and trigger refresh', async () => {
      // Mock successful update
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, newVersion: 'v2.0.0' }),
      });

      // First poll: server down
      global.fetch.mockRejectedValueOnce(new Error('Connection refused'));
      
      // Second poll: server back up
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: 'v2.0.0' }),
      });

      const originalHref = window.location.href;

      render(<UpdateModal {...defaultProps} />);
      
      const updateButton = screen.getByRole('button', { name: /Update Now/i });
      fireEvent.click(updateButton);

      await waitFor(() => {
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('[Update] Watching for server restart')
        );
      });

      // First poll - server down
      await vi.advanceTimersByTime(500);

      // Second poll - server up
      await vi.advanceTimersByTime(500);

      await waitFor(() => {
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('[Update] Server restarted with version'),
          expect.stringContaining('v2.0.0')
        );
      }, { timeout: 2000 });

      // Verify polling stopped (clearInterval called)
      expect(global.clearInterval).toHaveBeenCalled();
      
      // Verify refresh was triggered
      await waitFor(() => {
        expect(window.location.href).not.toBe(originalHref);
        expect(window.location.href).toMatch(/\?nocache=\d+/);
      }, { timeout: 2000 });
    });

    it('should stop polling after timeout (30 seconds)', async () => {
      // Mock successful update
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, newVersion: 'v2.0.0' }),
      });

      // Mock version endpoint always failing
      global.fetch.mockRejectedValue(new Error('Connection refused'));

      render(<UpdateModal {...defaultProps} />);
      
      const updateButton = screen.getByRole('button', { name: /Update Now/i });
      fireEvent.click(updateButton);

      await waitFor(() => {
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('[Update] Watching for server restart')
        );
      });

      // Verify timeout was set for 30 seconds
      expect(global.setTimeout).toHaveBeenCalledWith(
        expect.any(Function),
        30000
      );

      // Advance past timeout
      await vi.advanceTimersByTime(30000);

      await waitFor(() => {
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('[Update] Server restart timeout - please refresh manually')
        );
      }, { timeout: 2000 });

      // Verify polling stopped
      expect(global.clearInterval).toHaveBeenCalled();
    });

    it('should display "Server restarting..." message to user', async () => {
      // Mock successful update
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, newVersion: 'v2.0.0' }),
      });

      // Mock version endpoint failing
      global.fetch.mockRejectedValue(new Error('Connection refused'));

      render(<UpdateModal {...defaultProps} />);
      
      const updateButton = screen.getByRole('button', { name: /Update Now/i });
      fireEvent.click(updateButton);

      await waitFor(() => {
        expect(screen.getByText(/Server restarting/i)).toBeInTheDocument();
      });
    });

    it('should update message to "Server ready, refreshing..." when server recovers', async () => {
      // Mock successful update
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, newVersion: 'v2.0.0' }),
      });

      // First poll: server down
      global.fetch.mockRejectedValueOnce(new Error('Connection refused'));
      
      // Second poll: server back up
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: 'v2.0.0' }),
      });

      render(<UpdateModal {...defaultProps} />);
      
      const updateButton = screen.getByRole('button', { name: /Update Now/i });
      fireEvent.click(updateButton);

      await waitFor(() => {
        expect(screen.getByText(/Server restarting/i)).toBeInTheDocument();
      });

      // First poll - server down
      await vi.advanceTimersByTime(500);

      // Second poll - server up
      await vi.advanceTimersByTime(500);

      await waitFor(() => {
        expect(screen.getByText(/Server ready, refreshing/i)).toBeInTheDocument();
      }, { timeout: 2000 });
    });

    it('should show timeout error message to user after 30 seconds', async () => {
      // Mock successful update
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, newVersion: 'v2.0.0' }),
      });

      // Mock version endpoint always failing
      global.fetch.mockRejectedValue(new Error('Connection refused'));

      render(<UpdateModal {...defaultProps} />);
      
      const updateButton = screen.getByRole('button', { name: /Update Now/i });
      fireEvent.click(updateButton);

      await waitFor(() => {
        expect(screen.getByText(/Server restarting/i)).toBeInTheDocument();
      });

      // Advance past timeout
      await vi.advanceTimersByTime(30000);

      await waitFor(() => {
        expect(screen.getByText(/Server restart timeout/i)).toBeInTheDocument();
        expect(screen.getByText(/please refresh manually/i)).toBeInTheDocument();
      }, { timeout: 2000 });
    });
  });

  describe('Hard Refresh Logic', () => {
    it('should clear all caches before refreshing', async () => {
      // Mock caches API
      const mockDelete = vi.fn().mockResolvedValue(true);
      global.caches = {
        keys: vi.fn().mockResolvedValue(['cache1', 'cache2']),
        delete: mockDelete,
      };

      // Mock successful update and server recovery
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, newVersion: 'v2.0.0' }),
      });
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: 'v2.0.0' }),
      });

      render(<UpdateModal {...defaultProps} />);
      
      const updateButton = screen.getByRole('button', { name: /Update Now/i });
      fireEvent.click(updateButton);

      // Wait for polling to detect server up
      await vi.advanceTimersByTime(500);

      await waitFor(() => {
        expect(mockDelete).toHaveBeenCalledWith('cache1');
        expect(mockDelete).toHaveBeenCalledWith('cache2');
      }, { timeout: 2000 });
    });

    it('should unregister service workers before refreshing', async () => {
      // Mock service worker API
      const mockUnregister = vi.fn().mockResolvedValue(true);
      global.navigator.serviceWorker = {
        getRegistrations: vi.fn().mockResolvedValue([
          { unregister: mockUnregister },
          { unregister: mockUnregister },
        ]),
      };

      // Mock successful update and server recovery
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, newVersion: 'v2.0.0' }),
      });
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: 'v2.0.0' }),
      });

      render(<UpdateModal {...defaultProps} />);
      
      const updateButton = screen.getByRole('button', { name: /Update Now/i });
      fireEvent.click(updateButton);

      // Wait for polling to detect server up
      await vi.advanceTimersByTime(500);

      await waitFor(() => {
        expect(mockUnregister).toHaveBeenCalledTimes(2);
      }, { timeout: 2000 });
    });

    it('should append nocache query parameter to URL', async () => {
      // Mock successful update and server recovery
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, newVersion: 'v2.0.0' }),
      });
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: 'v2.0.0' }),
      });

      const originalHref = 'http://localhost:8333/';
      window.location.href = originalHref;

      render(<UpdateModal {...defaultProps} />);
      
      const updateButton = screen.getByRole('button', { name: /Update Now/i });
      fireEvent.click(updateButton);

      // Wait for polling to detect server up
      await vi.advanceTimersByTime(500);

      await waitFor(() => {
        expect(window.location.href).toMatch(/\?nocache=\d+$/);
      }, { timeout: 2000 });
    });

    it('should handle missing caches API gracefully', async () => {
      // Remove caches API
      delete global.caches;

      // Mock successful update and server recovery
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, newVersion: 'v2.0.0' }),
      });
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: 'v2.0.0' }),
      });

      render(<UpdateModal {...defaultProps} />);
      
      const updateButton = screen.getByRole('button', { name: /Update Now/i });
      fireEvent.click(updateButton);

      // Wait for polling to detect server up
      await vi.advanceTimersByTime(500);

      // Should still refresh despite missing caches API
      await waitFor(() => {
        expect(window.location.href).toMatch(/\?nocache=\d+/);
      }, { timeout: 2000 });
    });

    it('should handle missing service worker API gracefully', async () => {
      // Remove service worker API
      delete global.navigator.serviceWorker;

      // Mock successful update and server recovery
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, newVersion: 'v2.0.0' }),
      });
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: 'v2.0.0' }),
      });

      render(<UpdateModal {...defaultProps} />);
      
      const updateButton = screen.getByRole('button', { name: /Update Now/i });
      fireEvent.click(updateButton);

      // Wait for polling to detect server up
      await vi.advanceTimersByTime(500);

      // Should still refresh despite missing service worker API
      await waitFor(() => {
        expect(window.location.href).toMatch(/\?nocache=\d+/);
      }, { timeout: 2000 });
    });
  });

  describe('Manual Install with Server Death Detection', () => {
    it('should start server death detection after manual install succeeds', async () => {
      // Mock successful manual install
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(<UpdateModal {...defaultProps} />);
      
      const fileInput = screen.getByPlaceholderText(/Enter path to downloaded binary/i);
      const installButton = screen.getByRole('button', { name: /Install/ });
      
      fireEvent.change(fileInput, { target: { value: '/path/to/forge' } });
      fireEvent.click(installButton);

      await waitFor(() => {
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('[Update] Watching for server restart')
        );
      });

      // Verify polling started
      expect(global.setInterval).toHaveBeenCalledWith(
        expect.any(Function),
        500
      );
    });

    it('should NOT start server death detection if manual install fails', async () => {
      // Mock failed manual install
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: false, error: 'File not found' }),
      });

      render(<UpdateModal {...defaultProps} />);
      
      const fileInput = screen.getByPlaceholderText(/Enter path to downloaded binary/i);
      const installButton = screen.getByRole('button', { name: /Install/ });
      
      fireEvent.change(fileInput, { target: { value: '/bad/path' } });
      fireEvent.click(installButton);

      await waitFor(() => {
        expect(screen.getByText(/File not found/i)).toBeInTheDocument();
      });

      // Verify polling was NOT started
      expect(console.log).not.toHaveBeenCalledWith(
        expect.stringContaining('[Update] Watching for server restart')
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle fetch errors during polling gracefully', async () => {
      // Mock successful update
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, newVersion: 'v2.0.0' }),
      });

      // Mock version endpoint with various errors
      global.fetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ version: 'v2.0.0' }),
        });

      render(<UpdateModal {...defaultProps} />);
      
      const updateButton = screen.getByRole('button', { name: /Update Now/i });
      fireEvent.click(updateButton);

      // All errors should be caught and logged
      await vi.advanceTimersByTime(500);
      await vi.advanceTimersByTime(500);
      await vi.advanceTimersByTime(500);

      await waitFor(() => {
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('[Update] Server restarted with version')
        );
      }, { timeout: 2000 });
    });

    it('should handle JSON parse errors during polling', async () => {
      // Mock successful update
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, newVersion: 'v2.0.0' }),
      });

      // Mock version endpoint with invalid JSON
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => { throw new Error('Invalid JSON'); },
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ version: 'v2.0.0' }),
        });

      render(<UpdateModal {...defaultProps} />);
      
      const updateButton = screen.getByRole('button', { name: /Update Now/i });
      fireEvent.click(updateButton);

      // JSON error should be caught and polling continues
      await vi.advanceTimersByTime(500);
      await vi.advanceTimersByTime(500);

      await waitFor(() => {
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('[Update] Server restarted with version')
        );
      }, { timeout: 2000 });
    });

    it('should not leak timers if modal closes during polling', async () => {
      // Mock successful update
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, newVersion: 'v2.0.0' }),
      });

      // Mock version endpoint failing
      global.fetch.mockRejectedValue(new Error('Connection refused'));

      const { rerender } = render(<UpdateModal {...defaultProps} />);
      
      const updateButton = screen.getByRole('button', { name: /Update Now/i });
      fireEvent.click(updateButton);

      await waitFor(() => {
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('[Update] Watching for server restart')
        );
      });

      // Verify that polling has started
      const pendingTimersBefore = vi.getTimerCount();
      expect(pendingTimersBefore).toBeGreaterThan(0);

      // Close modal
      rerender(<UpdateModal {...defaultProps} isOpen={false} />);

      // Timers should be cleaned up when modal closes
      await waitFor(() => {
        const pendingTimersAfter = vi.getTimerCount();
        expect(pendingTimersAfter).toBe(0);
      });
    });
  });
});
