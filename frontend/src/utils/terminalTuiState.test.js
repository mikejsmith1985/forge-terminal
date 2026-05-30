/**
 * Unit tests for terminal TUI-state detection.
 *
 * These lock in the fix for the Release Manager bug where a running Claude Code
 * session (a box-framed TUI) caused the prompt-based working-directory parser to
 * misread the agent's UI as the shell's CWD — corrupting the tab directory and
 * making the Release Manager card type the release command into the live agent
 * instead of starting a background job.
 */

import { describe, it, expect } from 'vitest';
import { isTuiFrameActive, shouldDetectDirectoryFromText } from './terminalTuiState';

// A realistic slice of Claude Code's rounded-box input prompt. Claude Code runs
// in the normal screen buffer and pins this frame to the bottom of the terminal,
// redrawing it on every update — so the frame is always present in recent output.
const CLAUDE_CODE_FRAME = [
  '╭─────────────────────────────────────────────╮',
  '│ > release v7.10.32                            │',
  '╰─────────────────────────────────────────────╯',
  '  C:\\ProjectsWin\\forge-terminal',
].join('\n');

// A plain PowerShell prompt — the ONLY situation where CWD parsing is valid.
const POWERSHELL_PROMPT = 'PS C:\\ProjectsWin\\forge-terminal>';

// A plain bash/WSL prompt.
const BASH_PROMPT = 'mikej@DESKTOP:~/projects/forge-terminal$ ';

describe('isTuiFrameActive', () => {
  it('detects the box-drawing frame Claude Code renders', () => {
    expect(isTuiFrameActive(CLAUDE_CODE_FRAME)).toBe(true);
  });

  it('detects sharp-cornered TUI frames (vim splits, lazygit panels)', () => {
    expect(isTuiFrameActive('┌──────┐\n│ file │\n└──────┘')).toBe(true);
  });

  it('returns false for a plain PowerShell prompt', () => {
    expect(isTuiFrameActive(POWERSHELL_PROMPT)).toBe(false);
  });

  it('returns false for a plain bash prompt', () => {
    expect(isTuiFrameActive(BASH_PROMPT)).toBe(false);
  });

  it('returns false for empty or null input', () => {
    expect(isTuiFrameActive('')).toBe(false);
    expect(isTuiFrameActive(null)).toBe(false);
    expect(isTuiFrameActive(undefined)).toBe(false);
  });
});

describe('shouldDetectDirectoryFromText', () => {
  it('blocks CWD detection while Claude Code\'s frame is on screen (normal buffer)', () => {
    // This is the exact bug: Claude Code uses the NORMAL buffer, so an
    // alternate-buffer check alone would not save us — the frame check must.
    expect(shouldDetectDirectoryFromText(CLAUDE_CODE_FRAME, 'normal')).toBe(false);
  });

  it('blocks CWD detection while in the alternate screen buffer (vim, htop)', () => {
    expect(shouldDetectDirectoryFromText('some plain text', 'alternate')).toBe(false);
  });

  it('allows CWD detection at a real PowerShell prompt in the normal buffer', () => {
    expect(shouldDetectDirectoryFromText(POWERSHELL_PROMPT, 'normal')).toBe(true);
  });

  it('allows CWD detection at a real bash prompt in the normal buffer', () => {
    expect(shouldDetectDirectoryFromText(BASH_PROMPT, 'normal')).toBe(true);
  });

  it('fails open when the buffer type is unknown (better to detect than to freeze the CWD)', () => {
    expect(shouldDetectDirectoryFromText(POWERSHELL_PROMPT, undefined)).toBe(true);
  });
});
