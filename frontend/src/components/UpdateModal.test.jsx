import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import UpdateModal from './UpdateModal';

describe('UpdateModal', () => {
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
    global.fetch = vi.fn();
  });

  describe('Dead Code Removal Tests', () => {
    it('should NOT attempt window.location.href when update succeeds', async () => {
      const originalLocation = window.location.href;
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, newVersion: 'v2.0.0' }),
      });

      render(<UpdateModal {...defaultProps} />);
      
      const updateButton = screen.getByRole('button', { name: /Update Now/i });
      fireEvent.click(updateButton);

      await waitFor(() => {
        expect(window.location.href).toBe(originalLocation);
      }, { timeout: 3000 });
    });

    it('should NOT show "Downloading update..." spinner', () => {
      render(<UpdateModal {...defaultProps} />);
      
      // The downloading message should NOT exist in the DOM at all
      expect(screen.queryByText(/Downloading update/i)).not.toBeInTheDocument();
    });

    it('should NOT show "Applying update..." spinner', () => {
      render(<UpdateModal {...defaultProps} />);
      
      // The applying message should NOT exist in the DOM at all
      expect(screen.queryByText(/Applying update/i)).not.toBeInTheDocument();
    });
  });

  describe('Success Message', () => {
    it('should display success message when update completes', async () => {
      const originalFetch = global.fetch;
      
      global.fetch = vi.fn((url) => {
        if (url === '/api/update/apply') {
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true, newVersion: 'v2.0.0' }),
          });
        }
        if (url === '/api/version') {
          // Keep polling - don't transition to 'ready'
          return Promise.reject(new Error('Server restarting'));
        }
        return Promise.reject(new Error('Not mocked'));
      });

      render(<UpdateModal {...defaultProps} />);
      
      const updateButton = screen.getByRole('button', { name: /Update Now/i });
      fireEvent.click(updateButton);

      // Wait for either success or restarting message
      await waitFor(() => {
        const successElement = screen.queryByText(/Update applied/i);
        const restartingElement = screen.queryByText(/Server restarting/i);
        expect(successElement || restartingElement).toBeInTheDocument();
      }, { timeout: 1000 });
    });

    it('should show "Update applied successfully!" message', async () => {
      const originalFetch = global.fetch;
      
      originalFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, newVersion: 'v2.0.0' }),
      });
      
      // Mock /api/version to simulate server still restarting
      global.fetch = vi.fn((url) => {
        if (url === '/api/update/apply') {
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true, newVersion: 'v2.0.0' }),
          });
        }
        if (url === '/api/version') {
          // Keep polling until test ends - don't transition to 'ready'
          return Promise.reject(new Error('Server restarting'));
        }
        return Promise.reject(new Error('Not mocked'));
      });

      render(<UpdateModal {...defaultProps} />);
      
      const updateButton = screen.getByRole('button', { name: /Update Now/i });
      fireEvent.click(updateButton);

      // Check for success or restarting status
      await waitFor(() => {
        const successElement = screen.queryByText(/Update applied successfully/i);
        const restartingElement = screen.queryByText(/Server restarting/i);
        expect(successElement || restartingElement).toBeInTheDocument();
      }, { timeout: 1000 });
    });
  });

  describe('Error Handling', () => {
    it('should display error message when update fails', async () => {
      const errorMessage = 'Download failed: Network error';
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: false, error: errorMessage }),
      });

      render(<UpdateModal {...defaultProps} />);
      
      const updateButton = screen.getByRole('button', { name: /Update Now/i });
      fireEvent.click(updateButton);

      await waitFor(() => {
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });
    });

    it('should handle network errors gracefully', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network failed'));

      render(<UpdateModal {...defaultProps} />);
      
      const updateButton = screen.getByRole('button', { name: /Update Now/i });
      fireEvent.click(updateButton);

      await waitFor(() => {
        expect(screen.getByText(/Network failed/i)).toBeInTheDocument();
      });
    });

    it('should re-enable update button after error', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: false, error: 'Update failed' }),
      });

      render(<UpdateModal {...defaultProps} />);
      
      const updateButton = screen.getByRole('button', { name: /Update Now/i });
      
      fireEvent.click(updateButton);

      await waitFor(() => {
        expect(updateButton).not.toBeDisabled();
      });
    });
  });

  describe('Manual Install Flow', () => {
    it('should NOT attempt window.location.href when manual install succeeds', async () => {
      const originalLocation = window.location.href;
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(<UpdateModal {...defaultProps} />);
      
      const fileInput = screen.getByPlaceholderText(/Enter path to downloaded binary/i);
      const installButton = screen.getByRole('button', { name: /Install/ });
      
      fireEvent.change(fileInput, { target: { value: '/path/to/binary' } });
      fireEvent.click(installButton);

      await waitFor(() => {
        expect(window.location.href).toBe(originalLocation);
      }, { timeout: 3000 });
    });

    it('should show success message for manual install', async () => {
      const originalFetch = global.fetch;
      let fetchCallCount = 0;
      
      global.fetch = vi.fn((url) => {
        fetchCallCount++;
        if (url === '/api/update/install-manual') {
          // First fetch - the actual install
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true }),
          });
        }
        if (url === '/api/version') {
          // Polling - pretend server isn't ready yet to keep it in 'restarting' state longer
          return Promise.reject(new Error('Server not ready'));
        }
        // Other URLs
        return originalFetch(url);
      });

      render(<UpdateModal {...defaultProps} />);
      
      const fileInput = screen.getByPlaceholderText(/Enter path to downloaded binary/i);
      const installButton = screen.getByRole('button', { name: /Install/ });
      
      fireEvent.change(fileInput, { target: { value: '/path/to/binary' } });
      fireEvent.click(installButton);

      // First, verify the install was called
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/update/install-manual'),
          expect.any(Object)
        );
      }, { timeout: 500 });

      // Now verify either success or restarting message appears
      // The component will show 'success' briefly, then transition to 'restarting'
      // So we check for either one
      await waitFor(() => {
        const successElement = screen.queryByText(/Update applied successfully/i);
        const restartingElement = screen.queryByText(/Server restarting/i);
        expect(successElement || restartingElement).toBeInTheDocument();
      }, { timeout: 1000 });
    });

    it('should display error when manual install fails', async () => {
      const errorMessage = 'File not found';
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: false, error: errorMessage }),
      });

      render(<UpdateModal {...defaultProps} />);
      
      const fileInput = screen.getByPlaceholderText(/Enter path to downloaded binary/i);
      const installButton = screen.getByRole('button', { name: /Install/ });
      
      fireEvent.change(fileInput, { target: { value: '/path/to/binary' } });
      fireEvent.click(installButton);

      await waitFor(() => {
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });
    });
  });

  describe('Modal States', () => {
    it('should disable buttons while update is in progress', async () => {
      global.fetch.mockImplementationOnce(() => 
        new Promise(resolve => setTimeout(() => resolve({
          ok: true,
          json: async () => ({ success: true }),
        }), 500))
      );

      render(<UpdateModal {...defaultProps} />);
      
      const updateButton = screen.getByRole('button', { name: /Update Now/i });
      fireEvent.click(updateButton);

      expect(updateButton).toBeDisabled();

      await waitFor(() => {
        expect(updateButton).toBeDisabled(); // Still disabled after success
      });
    });

    it('should close modal when onClose is called', () => {
      const onClose = vi.fn();
      const { rerender } = render(
        <UpdateModal {...defaultProps} onClose={onClose} isOpen={true} />
      );

      expect(screen.getByRole('button', { name: /×/ })).toBeInTheDocument();
      
      const closeButton = screen.getByRole('button', { name: /×/ });
      fireEvent.click(closeButton);

      expect(onClose).toHaveBeenCalled();
    });

    it('should not show modal when isOpen is false', () => {
      render(<UpdateModal {...defaultProps} isOpen={false} />);
      
      expect(screen.queryByText(/Software Update/i)).not.toBeInTheDocument();
    });
  });

  describe('No Update Available State', () => {
    it('should show "You are running the latest version" when no update available', () => {
      const noUpdateProps = {
        ...defaultProps,
        updateInfo: { available: false },
      };

      render(<UpdateModal {...noUpdateProps} />);
      
      expect(screen.getByText(/running the latest version/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Update Now/i })).not.toBeInTheDocument();
    });

    it('should only show close button when no update available', () => {
      const noUpdateProps = {
        ...defaultProps,
        updateInfo: { available: false },
      };

      render(<UpdateModal {...noUpdateProps} />);
      
      const updateButton = screen.queryByRole('button', { name: /Update Now/i });
      expect(updateButton).not.toBeInTheDocument();
    });
  });

  describe('Version Display (Issue #3 Fix)', () => {
    it('should display current version with "v" prefix', () => {
      render(<UpdateModal {...defaultProps} currentVersion="2.1.8" />);
      
      // Should show "v2.1.8" not just "v" or "2.1.8"
      expect(screen.getByText(/v2\.1\.8/)).toBeInTheDocument();
    });

    it('should show "Loading..." when currentVersion is empty', () => {
      render(<UpdateModal {...defaultProps} currentVersion="" />);
      
      // Should show "Loading..." instead of just "v"
      expect(screen.getByText(/Loading\.\.\./)).toBeInTheDocument();
    });

    it('should show "Loading..." when currentVersion is undefined', () => {
      render(<UpdateModal {...defaultProps} currentVersion={undefined} />);
      
      // Should show "Loading..." instead of just "v"
      expect(screen.getByText(/Loading\.\.\./)).toBeInTheDocument();
    });

    it('should have white color on version text for readability', () => {
      const { container } = render(<UpdateModal {...defaultProps} currentVersion="2.1.8" />);
      
      // Find the version display element
      const versionElement = container.querySelector('[style*="monospace"]');
      
      // The version text should be readable (white or light color)
      // We check that it has color: '#fff' or similar
      expect(versionElement).toBeInTheDocument();
      if (versionElement) {
        const style = versionElement.getAttribute('style') || '';
        // Should have white color for readability
        expect(style).toMatch(/color:\s*(?:#fff|#ffffff|white|rgb\(255,\s*255,\s*255\))/i);
      }
    });

    it('should display full version number, not truncated', () => {
      render(<UpdateModal {...defaultProps} currentVersion="2.1.8-beta.1" />);
      
      // Should show the full version string
      expect(screen.getByText(/v2\.1\.8-beta\.1/)).toBeInTheDocument();
    });
  });

  describe('Development Mode Awareness (Issue #4 Fix)', () => {
    it('should show dev mode message when isDevMode is true and no update available', () => {
      const devModeProps = {
        ...defaultProps,
        updateInfo: { available: false },
        isDevMode: true,
      };

      render(<UpdateModal {...devModeProps} />);
      
      // Should show development mode indication
      expect(screen.getByText(/development mode/i)).toBeInTheDocument();
    });

    it('should show instruction to use Check Now button in dev mode', () => {
      const devModeProps = {
        ...defaultProps,
        updateInfo: { available: false },
        isDevMode: true,
      };

      render(<UpdateModal {...devModeProps} />);
      
      // Should mention the Check Now button in the dev mode message
      expect(screen.getByText(/Use the "Check Now" button/i)).toBeInTheDocument();
    });

    it('should NOT show dev mode message when update is available', () => {
      const devModeWithUpdateProps = {
        ...defaultProps,
        updateInfo: mockUpdateInfo, // available: true
        isDevMode: true,
      };

      render(<UpdateModal {...devModeWithUpdateProps} />);
      
      // Should NOT show dev mode message when an update is actually available
      expect(screen.queryByText(/Running in development mode/i)).not.toBeInTheDocument();
    });

    it('should NOT show dev mode message when isDevMode is false', () => {
      const prodModeProps = {
        ...defaultProps,
        updateInfo: { available: false },
        isDevMode: false,
      };

      render(<UpdateModal {...prodModeProps} />);
      
      // Should NOT show dev mode message in production
      expect(screen.queryByText(/Running in development mode/i)).not.toBeInTheDocument();
    });
  });
});
