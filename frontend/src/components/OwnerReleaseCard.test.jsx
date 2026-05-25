// Tests for the Release Manager card's project-specific command generation.
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OwnerReleaseCard from './OwnerReleaseCard';

function createFetchMock({ hasLocalScript = false, version = 'v0.0.1' } = {}) {
  return vi.fn(async (url) => {
    if (url === '/api/git/version') {
      return {
        ok: true,
        json: async () => ({ version }),
      };
    }

    if (url === '/api/project/release-script') {
      return {
        ok: true,
        json: async () => ({ exists: hasLocalScript }),
      };
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  });
}

describe('OwnerReleaseCard', () => {
  beforeEach(() => {
    global.fetch = createFetchMock();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses a workflow-compliant default release commit message for inline fallback releases', async () => {
    global.fetch = createFetchMock({ hasLocalScript: false, version: 'v0.0.1' });

    render(
      <OwnerReleaseCard
        cwd="C:\\ProjectsWin\\GitDiscord"
        shellType="powershell"
        onExecuteCommand={vi.fn()}
        onToast={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('commit-message-input')).toHaveAttribute('placeholder', 'chore: release v0.0.2');
    });

    fireEvent.click(screen.getByText('Show Command'));

    const commandText = screen.getByText(/git commit -m/).textContent;
    expect(commandText).toContain('git commit -m "chore: release v0.0.2"');
    expect(commandText).not.toContain('git commit -m "Release v0.0.2"');
  });

  it('describes inline fallback releases as local GitHub release creation instead of GitHub Actions', async () => {
    global.fetch = createFetchMock({ hasLocalScript: false, version: 'v0.0.1' });

    render(
      <OwnerReleaseCard
        cwd="C:\\ProjectsWin\\GitDiscord"
        shellType="powershell"
        onExecuteCommand={vi.fn()}
        onToast={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Create GitHub Release locally/)).toBeInTheDocument();
    });

    expect(screen.queryByText(/GitHub Actions builds release/)).not.toBeInTheDocument();
  });
});
