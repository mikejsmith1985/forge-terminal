/**
 * Unit tests for the hidden-tab working-directory restore decision.
 *
 * These lock in the fix for the bug where switching to a background tab revealed
 * `cd "C:\..."` commands the developer never typed. The old inline condition in
 * ForgeTerminal's socket-open handler only excluded sockets that had *retried*,
 * so the ordinary case — an app restart or page reload whose first socket the
 * server answers with SESSION_REATTACHED — still typed a `cd` into a shell that
 * was already sitting in that directory.
 */

import { describe, it, expect } from 'vitest';
import {
  shouldRestoreDirectory,
  buildDirectoryRestoreCommand,
  DIRECTORY_RESTORE_DELAY_MS,
} from './directoryRestore';

// A hidden tab on a genuinely fresh shell — the only case that still warrants a `cd`.
const FRESH_HIDDEN_TAB = {
  savedDirectory: 'C:\\ProjectsWin\\forge-terminal',
  isVisible: false,
  wasReconnection: false,
  wasSessionReattached: false,
};

describe('shouldRestoreDirectory', () => {
  it('restores a hidden tab whose shell was started fresh', () => {
    expect(shouldRestoreDirectory(FRESH_HIDDEN_TAB)).toBe(true);
  });

  it('does nothing when the tab has no saved directory', () => {
    expect(shouldRestoreDirectory({ ...FRESH_HIDDEN_TAB, savedDirectory: '' })).toBe(false);
  });

  it('does nothing for the visible tab (the backend already started it in that directory)', () => {
    expect(shouldRestoreDirectory({ ...FRESH_HIDDEN_TAB, isVisible: true })).toBe(false);
  });

  it('does nothing when the socket dropped and retried', () => {
    expect(shouldRestoreDirectory({ ...FRESH_HIDDEN_TAB, wasReconnection: true })).toBe(false);
  });

  // The regression this fix exists for: a first-attempt socket that the server
  // answers with SESSION_REATTACHED is NOT a reconnection, so the old condition
  // let the `cd` through into a live shell that was already in the right place.
  it('does nothing when the server reattached an existing shell session', () => {
    expect(shouldRestoreDirectory({ ...FRESH_HIDDEN_TAB, wasSessionReattached: true })).toBe(false);
  });

  it('treats a missing options object as "do not restore"', () => {
    expect(shouldRestoreDirectory()).toBe(false);
  });
});

describe('buildDirectoryRestoreCommand', () => {
  it('uses cd with quotes for PowerShell', () => {
    expect(buildDirectoryRestoreCommand('powershell', 'C:\\ProjectsWin\\forge-terminal'))
      .toBe('cd "C:\\ProjectsWin\\forge-terminal"\r');
  });

  it('uses cd /d for cmd so the drive changes too', () => {
    expect(buildDirectoryRestoreCommand('cmd', 'D:\\work'))
      .toBe('cd /d "D:\\work"\r');
  });

  it('quotes an absolute WSL path', () => {
    expect(buildDirectoryRestoreCommand('wsl', '/home/mikej/projects'))
      .toBe('cd "/home/mikej/projects"\r');
  });

  // A "~" path must stay unquoted so the shell expands it, which means spaces
  // have to be backslash-escaped instead.
  it('escapes spaces rather than quoting a WSL home-relative path', () => {
    expect(buildDirectoryRestoreCommand('wsl', '~/my projects/forge'))
      .toBe('cd ~/my\\ projects/forge\r');
  });

  it('defaults to the PowerShell form when the shell type is unknown', () => {
    expect(buildDirectoryRestoreCommand(undefined, 'C:\\repo')).toBe('cd "C:\\repo"\r');
  });

  it('returns an empty command when there is no directory', () => {
    expect(buildDirectoryRestoreCommand('powershell', '')).toBe('');
  });
});

describe('DIRECTORY_RESTORE_DELAY_MS', () => {
  it('is long enough for the shell to finish drawing its first prompt', () => {
    expect(DIRECTORY_RESTORE_DELAY_MS).toBeGreaterThanOrEqual(500);
  });
});
