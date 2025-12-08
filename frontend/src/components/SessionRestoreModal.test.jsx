import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SessionRestoreModal from './SessionRestoreModal';

describe('SessionRestoreModal', () => {
  const mockSessions = [
    {
      tabId: 'tab-1',
      tabName: 'Execution',
      workspace: '/home/user/project',
      lastUpdated: new Date(Date.now() - 5 * 60000),
      lastCommand: 'npm test',
      provider: 'copilot',
      activeCount: 3,
      durationMinutes: 8,
      sessionId: 'sess-abc123',
    },
    {
      tabId: 'tab-2',
      tabName: 'Planning',
      workspace: '/home/user/project',
      lastUpdated: new Date(Date.now() - 10 * 60000),
      lastCommand: 'npm install',
      provider: 'claude',
      activeCount: 1,
      durationMinutes: 15,
      sessionId: 'sess-def456',
    },
  ];

  describe('Single Workspace', () => {
    it('should render modal with title and sessions', () => {
      const mockOnRestore = jest.fn();
      const mockOnDismiss = jest.fn();

      render(
        <SessionRestoreModal
          workspace="/home/user/project"
          sessions={mockSessions}
          onRestore={mockOnRestore}
          onDismiss={mockOnDismiss}
        />
      );

      expect(screen.getByText(/Restore Session/i)).toBeInTheDocument();
      expect(screen.getByText('/home/user/project')).toBeInTheDocument();
    });

    it('should display all sessions in the workspace', () => {
      const mockOnRestore = jest.fn();
      const mockOnDismiss = jest.fn();

      render(
        <SessionRestoreModal
          workspace="/home/user/project"
          sessions={mockSessions}
          onRestore={mockOnRestore}
          onDismiss={mockOnDismiss}
        />
      );

      expect(screen.getByText('Execution')).toBeInTheDocument();
      expect(screen.getByText('Planning')).toBeInTheDocument();
      expect(screen.getByText('npm test')).toBeInTheDocument();
      expect(screen.getByText('npm install')).toBeInTheDocument();
    });

    it('should show tab name and last command for each session', () => {
      const mockOnRestore = jest.fn();
      const mockOnDismiss = jest.fn();

      render(
        <SessionRestoreModal
          workspace="/home/user/project"
          sessions={mockSessions}
          onRestore={mockOnRestore}
          onDismiss={mockOnDismiss}
        />
      );

      expect(screen.getByText('Execution')).toBeInTheDocument();
      expect(screen.getByText('npm test')).toBeInTheDocument();
    });

    it('should call onRestore with correct arguments when Copilot button clicked', () => {
      const mockOnRestore = jest.fn();
      const mockOnDismiss = jest.fn();

      render(
        <SessionRestoreModal
          workspace="/home/user/project"
          sessions={mockSessions}
          onRestore={mockOnRestore}
          onDismiss={mockOnDismiss}
        />
      );

      const copilotButtons = screen.getAllByText(/Restore with Copilot/i);
      fireEvent.click(copilotButtons[0]);

      expect(mockOnRestore).toHaveBeenCalledWith(mockSessions[0], 'copilot');
    });

    it('should call onRestore with correct arguments when Claude button clicked', () => {
      const mockOnRestore = jest.fn();
      const mockOnDismiss = jest.fn();

      render(
        <SessionRestoreModal
          workspace="/home/user/project"
          sessions={mockSessions}
          onRestore={mockOnRestore}
          onDismiss={mockOnDismiss}
        />
      );

      const claudeButtons = screen.getAllByText(/Restore with Claude/i);
      fireEvent.click(claudeButtons[0]);

      expect(mockOnRestore).toHaveBeenCalledWith(mockSessions[0], 'claude');
    });

    it('should call onDismiss when close button clicked', () => {
      const mockOnRestore = jest.fn();
      const mockOnDismiss = jest.fn();

      render(
        <SessionRestoreModal
          workspace="/home/user/project"
          sessions={mockSessions}
          onRestore={mockOnRestore}
          onDismiss={mockOnDismiss}
        />
      );

      const closeButton = screen.getByRole('button', { name: /close|×/i });
      fireEvent.click(closeButton);

      expect(mockOnDismiss).toHaveBeenCalled();
    });

    it('should display session metadata (provider, duration)', () => {
      const mockOnRestore = jest.fn();
      const mockOnDismiss = jest.fn();

      render(
        <SessionRestoreModal
          workspace="/home/user/project"
          sessions={mockSessions}
          onRestore={mockOnRestore}
          onDismiss={mockOnDismiss}
        />
      );

      expect(screen.getByText(/copilot/i)).toBeInTheDocument();
      expect(screen.getByText(/8\s*min/i)).toBeInTheDocument();
    });

    it('should format time correctly', () => {
      const mockOnRestore = jest.fn();
      const mockOnDismiss = jest.fn();
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60000);

      const sessions = [
        {
          ...mockSessions[0],
          lastUpdated: fiveMinutesAgo,
        },
      ];

      render(
        <SessionRestoreModal
          workspace="/home/user/project"
          sessions={sessions}
          onRestore={mockOnRestore}
          onDismiss={mockOnDismiss}
        />
      );

      expect(screen.getByText(/5\s*min.*ago/i)).toBeInTheDocument();
    });

    it('should show "just now" for very recent sessions', () => {
      const mockOnRestore = jest.fn();
      const mockOnDismiss = jest.fn();
      const justNow = new Date(Date.now() - 10000); // 10 seconds ago

      const sessions = [
        {
          ...mockSessions[0],
          lastUpdated: justNow,
        },
      ];

      render(
        <SessionRestoreModal
          workspace="/home/user/project"
          sessions={sessions}
          onRestore={mockOnRestore}
          onDismiss={mockOnDismiss}
        />
      );

      expect(screen.getByText(/just now/i)).toBeInTheDocument();
    });

    it('should handle empty sessions gracefully', () => {
      const mockOnRestore = jest.fn();
      const mockOnDismiss = jest.fn();

      render(
        <SessionRestoreModal
          workspace="/home/user/project"
          sessions={[]}
          onRestore={mockOnRestore}
          onDismiss={mockOnDismiss}
        />
      );

      expect(screen.getByText(/no sessions/i)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading hierarchy', () => {
      const mockOnRestore = jest.fn();
      const mockOnDismiss = jest.fn();

      render(
        <SessionRestoreModal
          workspace="/home/user/project"
          sessions={mockSessions}
          onRestore={mockOnRestore}
          onDismiss={mockOnDismiss}
        />
      );

      const heading = screen.getByRole('heading', { level: 2 });
      expect(heading).toBeInTheDocument();
    });

    it('should have descriptive button labels', () => {
      const mockOnRestore = jest.fn();
      const mockOnDismiss = jest.fn();

      render(
        <SessionRestoreModal
          workspace="/home/user/project"
          sessions={mockSessions}
          onRestore={mockOnRestore}
          onDismiss={mockOnDismiss}
        />
      );

      expect(screen.getAllByText(/Restore with Copilot/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Restore with Claude/i).length).toBeGreaterThan(0);
    });
  });
});
