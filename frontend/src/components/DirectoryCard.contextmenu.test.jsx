// Tests for right-clicking a folder in the Projects Browser.
//
// The card lists project folders as buttons and, until now, had no
// context-menu handler at all: a right-click fell through to the browser's own
// menu, so the one thing a project row is most often wanted for — its path —
// could not be got out of the UI.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DirectoryCard from './DirectoryCard';

const ROOT_PATH = 'C:\\ProjectsWin';
const PROJECT_DIRECTORIES = [
  { name: 'forge-terminal', path: 'C:\\ProjectsWin\\forge-terminal' },
  { name: 'counter', path: 'C:\\ProjectsWin\\counter' },
];

let writeText;

beforeEach(() => {
  localStorage.setItem('forge_directory_card_root', ROOT_PATH);

  writeText = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
    writable: true,
  });

  global.fetch = vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve(PROJECT_DIRECTORIES),
  }));
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

async function renderCardWithFolders() {
  render(<DirectoryCard onExecute={vi.fn()} onHide={vi.fn()} />);
  await waitFor(() => expect(screen.getByText('forge-terminal')).toBeTruthy());
}

/** Right-clicks the named project folder and returns nothing; the menu follows. */
function rightClickFolder(folderName) {
  fireEvent.contextMenu(screen.getByText(folderName));
}

describe('Projects Browser folder context menu', () => {
  it('opens a menu on right-click instead of the browser default', async () => {
    await renderCardWithFolders();
    rightClickFolder('forge-terminal');

    expect(screen.getByText('Copy Path')).toBeTruthy();
  });

  it('suppresses the browser menu so ours is the only one shown', async () => {
    await renderCardWithFolders();

    const contextMenuEvent = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    screen.getByText('counter').dispatchEvent(contextMenuEvent);

    expect(contextMenuEvent.defaultPrevented).toBe(true);
  });

  it('copies the full path of the folder that was right-clicked', async () => {
    await renderCardWithFolders();
    rightClickFolder('counter');

    fireEvent.click(screen.getByText('Copy Path'));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('C:\\ProjectsWin\\counter');
    });
  });

  it('does not open the folder when it is right-clicked', async () => {
    // A right-click that also ran the left-click action would drop the user
    // into a directory they only meant to ask about.
    const onExecute = vi.fn();
    localStorage.setItem('forge_directory_card_root', ROOT_PATH);
    render(<DirectoryCard onExecute={onExecute} onHide={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('forge-terminal')).toBeTruthy());

    rightClickFolder('forge-terminal');

    expect(onExecute).not.toHaveBeenCalled();
  });

  it('confirms the copy, so a silent clipboard failure is visible', async () => {
    await renderCardWithFolders();
    rightClickFolder('forge-terminal');
    fireEvent.click(screen.getByText('Copy Path'));

    await waitFor(() => expect(screen.getByText(/copied/i)).toBeTruthy());
  });

  it('closes the menu when the page is clicked elsewhere', async () => {
    await renderCardWithFolders();
    rightClickFolder('forge-terminal');
    expect(screen.getByText('Copy Path')).toBeTruthy();

    fireEvent.click(document.body);

    await waitFor(() => expect(screen.queryByText('Copy Path')).toBeNull());
  });
});
