/**
 * ConnectionDiagnosticWizard.test.jsx
 *
 * Tests for the connection diagnostic wizard component.
 * Covers: visibility toggle, state transitions, and action callbacks.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ConnectionDiagnosticWizard from './ConnectionDiagnosticWizard';

// Mock fetch so tests don't hit a real server.
const mockFetch = (payload = { ok: true, ptySpawnOk: true, warnings: [] }) => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => payload,
  });
};

describe('ConnectionDiagnosticWizard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not render when isVisible is false', () => {
    render(
      <ConnectionDiagnosticWizard
        isVisible={false}
        triggerReason="firstRun"
        onClose={() => {}}
        onOpenNewTerminal={() => {}}
      />
    );
    expect(document.querySelector('.cdw-overlay')).not.toBeInTheDocument();
  });

  it('renders the checking state immediately when visible', () => {
    mockFetch();
    render(
      <ConnectionDiagnosticWizard
        isVisible={true}
        triggerReason="firstRun"
        onClose={() => {}}
        onOpenNewTerminal={() => {}}
      />
    );
    expect(screen.getByText(/running connection test/i)).toBeInTheDocument();
  });

  it('shows all-clear state when diagnostics pass', async () => {
    mockFetch({ ok: true, ptySpawnOk: true, warnings: [] });
    render(
      <ConnectionDiagnosticWizard
        isVisible={true}
        triggerReason="firstRun"
        onClose={() => {}}
        onOpenNewTerminal={() => {}}
      />
    );
    await waitFor(() => {
      expect(screen.getByText(/everything looks good/i)).toBeInTheDocument();
    });
  });

  it('shows issue-found state when PTY spawn fails', async () => {
    mockFetch({
      ok: false,
      ptySpawnOk: false,
      ptySpawnError: 'directory C:\\OldProjects does not exist',
      warnings: ['PTY spawn test FAILED'],
    });
    render(
      <ConnectionDiagnosticWizard
        isVisible={true}
        triggerReason="spawnFailed"
        onClose={() => {}}
        onOpenNewTerminal={() => {}}
      />
    );
    await waitFor(() => {
      expect(screen.getByText(/saved startup folder/i)).toBeInTheDocument();
    });
  });

  it('calls onOpenNewTerminal when "Open Terminal" is clicked after all-clear', async () => {
    mockFetch({ ok: true, ptySpawnOk: true, warnings: [] });
    const handleOpenTerminal = vi.fn();
    render(
      <ConnectionDiagnosticWizard
        isVisible={true}
        triggerReason="firstRun"
        onClose={() => {}}
        onOpenNewTerminal={handleOpenTerminal}
      />
    );
    await waitFor(() => screen.getByText(/open terminal/i));
    fireEvent.click(screen.getByText(/open terminal/i));
    expect(handleOpenTerminal).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the X button is clicked', async () => {
    mockFetch({ ok: true, ptySpawnOk: true, warnings: [] });
    const handleClose = vi.fn();
    render(
      <ConnectionDiagnosticWizard
        isVisible={true}
        triggerReason="firstRun"
        onClose={handleClose}
        onOpenNewTerminal={() => {}}
      />
    );
    fireEvent.click(document.querySelector('.cdw-close-btn'));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('uses error header variant for spawnFailed trigger reason', async () => {
    mockFetch({ ok: true, ptySpawnOk: true, warnings: [] });
    render(
      <ConnectionDiagnosticWizard
        isVisible={true}
        triggerReason="spawnFailed"
        onClose={() => {}}
        onOpenNewTerminal={() => {}}
      />
    );
    // The panel should have the error variant class applied.
    await waitFor(() => {
      const panel = document.querySelector('.cdw-panel');
      expect(panel).toHaveClass('cdw-panel--error');
    });
  });
});
