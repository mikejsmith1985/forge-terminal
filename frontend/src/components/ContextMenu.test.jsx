// Tests for the shared right-click menu.
//
// It was previously a private component inside FileExplorer, where two things
// were wrong and invisible: it was handed `clientX`/`clientY` while destructuring
// `x`/`y`, so it opened at the corner rather than under the pointer; and a copy
// action reported nothing whether it worked or not. Both are pinned here.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ContextMenu from './ContextMenu';

const MENU_ITEMS = [
  { label: 'Copy Path', action: 'copyPath' },
  { separator: true },
  { label: 'Rename', action: 'rename' },
];

afterEach(() => vi.restoreAllMocks());

function renderMenu(overrides = {}) {
  const props = {
    x: 240,
    y: 120,
    items: MENU_ITEMS,
    onClose: vi.fn(),
    onAction: vi.fn(),
    ...overrides,
  };
  render(<ContextMenu {...props} />);
  return props;
}

describe('ContextMenu', () => {
  it('opens where the pointer was, not at the corner', () => {
    renderMenu();

    const menu = document.querySelector('.context-menu');
    expect(menu.style.left).toBe('240px');
    expect(menu.style.top).toBe('120px');
  });

  it('renders every item and draws separators between them', () => {
    renderMenu();

    expect(screen.getByText('Copy Path')).toBeTruthy();
    expect(screen.getByText('Rename')).toBeTruthy();
    expect(document.querySelectorAll('.context-menu-separator').length).toBe(1);
  });

  it('runs the action that was clicked', async () => {
    const { onAction } = renderMenu();

    fireEvent.click(screen.getByText('Rename'));

    await waitFor(() => expect(onAction).toHaveBeenCalledWith('rename'));
  });

  it('closes immediately when an action reports nothing', async () => {
    const { onClose } = renderMenu({ onAction: vi.fn(() => undefined) });

    fireEvent.click(screen.getByText('Rename'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('shows what an action reports instead of closing silently', async () => {
    renderMenu({ onAction: vi.fn(() => Promise.resolve('Copied path')) });

    fireEvent.click(screen.getByText('Copy Path'));

    await waitFor(() => expect(screen.getByText('Copied path')).toBeTruthy());
    // The items give way to the message so the menu does not resize under the
    // pointer at the moment it is being read.
    expect(screen.queryByText('Rename')).toBeNull();
  });

  it('closes on a click elsewhere on the page', async () => {
    const { onClose } = renderMenu();

    fireEvent.click(document.body);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('does not close when the menu itself is clicked', () => {
    const { onClose } = renderMenu();

    fireEvent.click(document.querySelector('.context-menu'));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape', async () => {
    const { onClose } = renderMenu();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
