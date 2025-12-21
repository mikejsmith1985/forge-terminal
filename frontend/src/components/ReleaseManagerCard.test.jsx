import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import ReleaseManagerCard from './ReleaseManagerCard';

// Mock the useVersionIncrement hook
vi.mock('../hooks/useVersionIncrement', () => ({
  useVersionIncrement: () => ({
    incrementMajor: (v) => 'v2.0.0',
    incrementMinor: (v) => 'v1.3.0',
    incrementFix: (v) => 'v1.2.1',
    getReleaseType: () => 'fix'
  })
}));

// Mock fetch
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ version: '1.2.0' }),
  })
);

describe('ReleaseManagerCard', () => {
  it('includes build command in release script', async () => {
    render(<ReleaseManagerCard shellType="bash" />);
    
    // Wait for version to load
    await waitFor(() => expect(screen.getByText('v1.2.0')).toBeInTheDocument());
    
    // Click "Show Command"
    const toggleButton = screen.getByText(/Show Command/i);
    fireEvent.click(toggleButton);
    
    // Check if command contains build step
    // We expect 'make build' or 'npm run build' to be present before git operations
    const commandElement = screen.getByText(/gh release create/);
    const commandText = commandElement.textContent;
    
    // This expectation will fail initially (RED)
    expect(commandText).toMatch(/make build|npm run build/);
  });
});
