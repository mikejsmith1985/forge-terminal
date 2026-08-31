// Unit tests for the clipboard helper behind "Copy Path".
//
// The helper exists because `navigator.clipboard` is only defined in a secure
// context. Forge is usually opened on localhost, which counts as one — but a
// tab opened against the machine's LAN address over plain HTTP is not, and
// there the copy silently did nothing. A copy that reports failure can at least
// be told about; one that returns undefined cannot.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { copyText } from './copyText';

describe('copyText', () => {
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    document.execCommand = vi.fn(() => true);
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  function setClipboard(value) {
    Object.defineProperty(navigator, 'clipboard', {
      value,
      configurable: true,
      writable: true,
    });
  }

  it('writes through the clipboard API when it is available', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    setClipboard({ writeText });

    const wasCopied = await copyText('C:\\ProjectsWin\\forge-terminal');

    expect(wasCopied).toBe(true);
    expect(writeText).toHaveBeenCalledWith('C:\\ProjectsWin\\forge-terminal');
  });

  it('falls back to a selection copy when the clipboard API is absent', async () => {
    setClipboard(undefined);

    const wasCopied = await copyText('C:\\ProjectsWin\\counter');

    expect(wasCopied).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });

  it('falls back when the clipboard API rejects, rather than losing the copy', async () => {
    // A denied permission rejects rather than throwing synchronously, and the
    // first version of this treated that as success.
    setClipboard({ writeText: vi.fn(() => Promise.reject(new Error('denied'))) });

    const wasCopied = await copyText('C:\\ProjectsWin\\u2-mcp');

    expect(wasCopied).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });

  it('reports failure when neither route works', async () => {
    setClipboard(undefined);
    document.execCommand = vi.fn(() => false);

    const wasCopied = await copyText('C:\\ProjectsWin\\nowhere');

    expect(wasCopied).toBe(false);
  });

  it('leaves no scratch element behind after a fallback copy', async () => {
    setClipboard(undefined);
    const countBefore = document.body.children.length;

    await copyText('C:\\ProjectsWin\\forge-terminal');

    expect(document.body.children.length).toBe(countBefore);
  });

  it('refuses an empty value rather than clearing the clipboard', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    setClipboard({ writeText });

    expect(await copyText('')).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });
});
