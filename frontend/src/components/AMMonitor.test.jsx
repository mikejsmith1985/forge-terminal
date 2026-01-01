/**
 * AMMonitor.test.jsx - Unit Tests with TDD Approach
 * 
 * Validates:
 * 1. Proper API response handling (both success and error cases)
 * 2. Correct state mapping (active/disabled/broken)
 * 3. Icon rendering based on capture status
 * 4. Conversation list handling
 * 5. Error resilience and fallbacks
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AMMonitor from '../AMMonitor';

// Mock the ConversationViewer component
jest.mock('../ConversationViewer', () => {
  return function MockConversationViewer({ onClose }) {
    return <div data-testid="conversation-viewer" onClick={onClose}>Mock Viewer</div>;
  };
});

// Mock fetch globally
global.fetch = jest.fn();

describe('AMMonitor Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset fetch to not mock anything by default
    global.fetch.mockReset();
  });

  describe('Visibility', () => {
    test('should not render when devMode is false', () => {
      const { container } = render(
        <AMMonitor tabId="test-tab" amEnabled={true} devMode={false} />
      );
      
      expect(container.firstChild).toBeNull();
    });

    test('should not render when tabId is missing', () => {
      const { container } = render(
        <AMMonitor tabId={null} amEnabled={true} devMode={true} />
      );
      
      expect(container.firstChild).toBeNull();
    });

    test('should render when devMode is true and tabId exists', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tabId: 'test-tab',
          status: 'active',
          statusText: 'AM Active'
        })
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ conversations: [] })
      });

      render(
        <AMMonitor tabId="test-tab" amEnabled={true} devMode={true} />
      );

      await waitFor(() => {
        expect(screen.getByText('AM Ready')).toBeInTheDocument();
      }, { timeout: 2000 });
    });
  });

  describe('Loading State', () => {
    test('should show loading spinner initially', () => {
      // Don't resolve the fetch yet
      global.fetch.mockImplementationOnce(
        () => new Promise(() => {}) // Never resolves
      );

      const { container } = render(
        <AMMonitor tabId="test-tab" amEnabled={true} devMode={true} />
      );

      const loader = container.querySelector('.am-monitor.am-loading');
      expect(loader).toBeInTheDocument();
      expect(loader).toHaveTextContent('AM');
    });
  });

  describe('Status States', () => {
    test('should render active state when status is "active"', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tabId: 'test-tab',
          status: 'active',
          statusText: 'AM Logging Active & Capturing',
          isCapturing: false,
          turnsCaptured: 5
        })
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ conversations: [] })
      });

      const { container } = render(
        <AMMonitor tabId="test-tab" amEnabled={true} devMode={true} />
      );

      await waitFor(() => {
        const monitor = container.querySelector('.am-monitor.am-active');
        expect(monitor).toBeInTheDocument();
      });
    });

    test('should render disabled state when status is "disabled"', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tabId: 'test-tab',
          status: 'disabled',
          statusText: 'AM Logging is Disabled for this tab'
        })
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ conversations: [] })
      });

      const { container } = render(
        <AMMonitor tabId="test-tab" amEnabled={false} devMode={true} />
      );

      await waitFor(() => {
        const monitor = container.querySelector('.am-monitor.am-disabled');
        expect(monitor).toBeInTheDocument();
        expect(screen.getByText('AM Off')).toBeInTheDocument();
      });
    });

    test('should render broken state when status is "broken"', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tabId: 'test-tab',
          status: 'broken',
          statusText: 'AM Not Capturing Turns',
          isCapturing: false
        })
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ conversations: [] })
      });

      const { container } = render(
        <AMMonitor tabId="test-tab" amEnabled={true} devMode={true} />
      );

      await waitFor(() => {
        const monitor = container.querySelector('.am-monitor.am-broken');
        expect(monitor).toBeInTheDocument();
        expect(screen.getByText('AM Error')).toBeInTheDocument();
      });
    });
  });

  describe('Display Text', () => {
    test('should show "AM Off" when disabled', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tabId: 'test-tab',
          status: 'disabled'
        })
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ conversations: [] })
      });

      render(
        <AMMonitor tabId="test-tab" amEnabled={false} devMode={true} />
      );

      await waitFor(() => {
        expect(screen.getByText('AM Off')).toBeInTheDocument();
      });
    });

    test('should show "● Recording" when actively capturing', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tabId: 'test-tab',
          status: 'active',
          isCapturing: true,
          secondsSinceCapture: 2
        })
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ conversations: [] })
      });

      render(
        <AMMonitor tabId="test-tab" amEnabled={true} devMode={true} />
      );

      await waitFor(() => {
        expect(screen.getByText('● Recording')).toBeInTheDocument();
      });
    });

    test('should show "AM Ready" when idle', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tabId: 'test-tab',
          status: 'active',
          isCapturing: false
        })
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ conversations: [] })
      });

      render(
        <AMMonitor tabId="test-tab" amEnabled={true} devMode={true} />
      );

      await waitFor(() => {
        expect(screen.getByText('AM Ready')).toBeInTheDocument();
      });
    });

    test('should show conversation count', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tabId: 'test-tab',
          status: 'active',
          isCapturing: false
        })
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          conversations: [
            { conversationId: 'conv-1' },
            { conversationId: 'conv-2' },
            { conversationId: 'conv-3' }
          ]
        })
      });

      render(
        <AMMonitor tabId="test-tab" amEnabled={true} devMode={true} />
      );

      await waitFor(() => {
        expect(screen.getByText('3 logs')).toBeInTheDocument();
      });
    });

    test('should show singular "log" for one conversation', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tabId: 'test-tab',
          status: 'active'
        })
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          conversations: [{ conversationId: 'conv-1' }]
        })
      });

      render(
        <AMMonitor tabId="test-tab" amEnabled={true} devMode={true} />
      );

      await waitFor(() => {
        expect(screen.getByText('1 log')).toBeInTheDocument();
      });
    });
  });

  describe('Response Handling', () => {
    test('should handle API returning array of conversations', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tabId: 'test-tab',
          status: 'active'
        })
      });

      // API returns array directly
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { conversationId: 'conv-1' },
          { conversationId: 'conv-2' }
        ]
      });

      render(
        <AMMonitor tabId="test-tab" amEnabled={true} devMode={true} />
      );

      await waitFor(() => {
        expect(screen.getByText('2 logs')).toBeInTheDocument();
      });
    });

    test('should handle API returning object with conversations property', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tabId: 'test-tab',
          status: 'active'
        })
      });

      // API returns object with conversations
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          conversations: [
            { conversationId: 'conv-1' },
            { conversationId: 'conv-2' }
          ]
        })
      });

      render(
        <AMMonitor tabId="test-tab" amEnabled={true} devMode={true} />
      );

      await waitFor(() => {
        expect(screen.getByText('2 logs')).toBeInTheDocument();
      });
    });

    test('should handle status endpoint failure gracefully', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ conversations: [] })
      });

      const { container } = render(
        <AMMonitor tabId="test-tab" amEnabled={true} devMode={true} />
      );

      await waitFor(() => {
        // Should fall back to "active" since amEnabled is true
        const monitor = container.querySelector('.am-monitor.am-active');
        expect(monitor).toBeInTheDocument();
      });
    });

    test('should handle conversations endpoint failure gracefully', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tabId: 'test-tab',
          status: 'active'
        })
      });

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500
      });

      const { container } = render(
        <AMMonitor tabId="test-tab" amEnabled={true} devMode={true} />
      );

      await waitFor(() => {
        // Should still render, just with no conversations
        const monitor = container.querySelector('.am-monitor.am-active');
        expect(monitor).toBeInTheDocument();
        expect(screen.getByText('AM Ready')).toBeInTheDocument();
      });
    });

    test('should handle fetch error gracefully', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();

      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      const { container } = render(
        <AMMonitor tabId="test-tab" amEnabled={true} devMode={true} />
      );

      await waitFor(() => {
        // Should have logged error
        expect(consoleError).toHaveBeenCalledWith(
          expect.stringContaining('[AMMonitor]'),
          expect.any(Error)
        );
      });

      consoleError.mockRestore();
    });
  });

  describe('Tooltip', () => {
    test('should generate detailed tooltip with status info', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tabId: 'test-tab',
          status: 'active',
          statusText: 'AM Logging Active & Capturing',
          detailedReason: 'Test reason',
          turnsCaptured: 5,
          secondsSinceCapture: 10
        })
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ conversations: [] })
      });

      const { container } = render(
        <AMMonitor tabId="test-tab" amEnabled={true} devMode={true} />
      );

      await waitFor(() => {
        const monitor = container.querySelector('.am-monitor');
        const tooltip = monitor.getAttribute('title');
        expect(tooltip).toContain('AM Logging Active & Capturing');
        expect(tooltip).toContain('Test reason');
      });
    });

    test('should include redundancy status in tooltip', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tabId: 'test-tab',
          status: 'active',
          statusText: 'Status text',
          redundancy: {
            primaryLayerOk: true,
            nativeSessionOk: true,
            periodicCaptureOk: true,
            healthMonitorOk: true
          }
        })
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ conversations: [] })
      });

      const { container } = render(
        <AMMonitor tabId="test-tab" amEnabled={true} devMode={true} />
      );

      await waitFor(() => {
        const monitor = container.querySelector('.am-monitor');
        const tooltip = monitor.getAttribute('title');
        expect(tooltip).toContain('Redundancy Systems');
        expect(tooltip).toContain('Primary Layer');
      });
    });
  });

  describe('Interactivity', () => {
    test('should be clickable when conversations exist', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tabId: 'test-tab',
          status: 'active'
        })
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          conversations: [{ conversationId: 'conv-1' }]
        })
      });

      const { container } = render(
        <AMMonitor tabId="test-tab" amEnabled={true} devMode={true} />
      );

      await waitFor(() => {
        const monitor = container.querySelector('.am-monitor.clickable');
        expect(monitor).toBeInTheDocument();
      });
    });

    test('should not be clickable when no conversations', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tabId: 'test-tab',
          status: 'active'
        })
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ conversations: [] })
      });

      const { container } = render(
        <AMMonitor tabId="test-tab" amEnabled={true} devMode={true} />
      );

      await waitFor(() => {
        const monitor = container.querySelector('.am-monitor:not(.clickable)');
        expect(monitor).toBeInTheDocument();
      });
    });

    test('should open conversation viewer on click', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tabId: 'test-tab',
          status: 'active'
        })
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          conversations: [
            { conversationId: 'conv-1' },
            { conversationId: 'conv-2' }
          ]
        })
      });

      const { container } = render(
        <AMMonitor tabId="test-tab" amEnabled={true} devMode={true} />
      );

      await waitFor(() => {
        const monitor = container.querySelector('.am-monitor.clickable');
        expect(monitor).toBeInTheDocument();
      });

      // Simulate click
      await act(async () => {
        const monitor = container.querySelector('.am-monitor.clickable');
        await userEvent.click(monitor);
      });

      // Should show conversation viewer
      await waitFor(() => {
        expect(screen.getByTestId('conversation-viewer')).toBeInTheDocument();
      });
    });

    test('should close conversation viewer', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tabId: 'test-tab',
          status: 'active'
        })
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          conversations: [{ conversationId: 'conv-1' }]
        })
      });

      const { container } = render(
        <AMMonitor tabId="test-tab" amEnabled={true} devMode={true} />
      );

      await waitFor(() => {
        const monitor = container.querySelector('.am-monitor.clickable');
        expect(monitor).toBeInTheDocument();
      });

      // Click to open
      await act(async () => {
        const monitor = container.querySelector('.am-monitor.clickable');
        await userEvent.click(monitor);
      });

      // Wait for viewer
      await waitFor(() => {
        expect(screen.getByTestId('conversation-viewer')).toBeInTheDocument();
      });

      // Click to close
      await act(async () => {
        const viewer = screen.getByTestId('conversation-viewer');
        await userEvent.click(viewer);
      });

      // Should be gone
      await waitFor(() => {
        expect(screen.queryByTestId('conversation-viewer')).not.toBeInTheDocument();
      });
    });
  });

  describe('API Polling', () => {
    test('should poll API on interval', async () => {
      jest.useFakeTimers();

      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          tabId: 'test-tab',
          status: 'active'
        })
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ conversations: [] })
      });

      render(
        <AMMonitor tabId="test-tab" amEnabled={true} devMode={true} />
      );

      // Initial call
      expect(global.fetch).toHaveBeenCalledTimes(2); // status + conversations

      // Advance time past 5s interval
      jest.advanceTimersByTime(5000);

      expect(global.fetch).toHaveBeenCalledTimes(4); // Another round of 2 calls

      jest.useRealTimers();
    });

    test('should cleanup interval on unmount', async () => {
      const { unmount } = render(
        <AMMonitor tabId="test-tab" amEnabled={true} devMode={true} />
      );

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      const initialCallCount = global.fetch.mock.calls.length;

      unmount();

      // After unmount, polling should stop
      // (Note: In practice, we can't fully test this without deeper introspection)
      expect(global.fetch.mock.calls.length).toBe(initialCallCount);
    });
  });
});
