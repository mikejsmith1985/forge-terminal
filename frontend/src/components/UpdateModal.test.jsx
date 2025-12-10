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
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, newVersion: 'v2.0.0' }),
      });

      render(<UpdateModal {...defaultProps} />);
      
      const updateButton = screen.getByRole('button', { name: /Update Now/i });
      fireEvent.click(updateButton);

      await waitFor(() => {
        expect(screen.getByText(/Update applied/i)).toBeInTheDocument();
      });
    });

    it('should show "Update applied successfully!" message', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, newVersion: 'v2.0.0' }),
      });

      render(<UpdateModal {...defaultProps} />);
      
      const updateButton = screen.getByRole('button', { name: /Update Now/i });
      fireEvent.click(updateButton);

      await waitFor(() => {
        expect(screen.getByText(/Update applied successfully/i)).toBeInTheDocument();
      });
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
        expect(screen.getByText(/Update applied successfully/i)).toBeInTheDocument();
      });
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
});
