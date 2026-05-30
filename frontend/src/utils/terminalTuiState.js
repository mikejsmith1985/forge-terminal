/**
 * Heuristics for deciding when terminal output is a live shell prompt versus the
 * UI of a full-screen TUI application (Claude Code, vim, lazygit, htop, ...).
 *
 * Why this exists: the Release Manager card derives the target repository from
 * the active tab's working directory, which Forge infers by scraping shell
 * prompts out of terminal output. A running CLI agent such as Claude Code draws
 * a box-framed input prompt that contains both a Windows path and a ">" chevron —
 * shapes the prompt parser mistakes for a shell CWD. That corrupted the tab
 * directory, so the Release Manager could no longer find scripts/local-release.ps1
 * and fell back to typing the release command straight into the running agent.
 * Gating CWD detection on the checks below keeps the last real shell CWD intact
 * while any TUI owns the terminal.
 */

// The "alternate screen buffer" is the secondary screen full-screen apps switch
// to (vim, htop, less). xterm.js reports it as buffer.active.type === this value.
export const ALTERNATE_SCREEN_BUFFER = 'alternate';

// Box-drawing corner and junction characters. A TUI frame always contains at
// least one of these. We deliberately exclude the lone horizontal/vertical bars
// ("─" and "│") because they appear in benign output (rule separators, markdown
// tables) and would over-suppress legitimate CWD detection. Corners and
// junctions are a far more specific signal of an active framed UI — and Claude
// Code's rounded input box (╭ ╮ ╰ ╯) is built from exactly these.
const TUI_FRAME_CHARACTER_PATTERN = /[╭╮╯╰┌┐└┘├┤┬┴┼]/;

// Only the most recent output can hold the frame of a currently-active TUI, and
// a redrawing app keeps its frame in that window. Capping the scan also keeps
// this cheap on the hot output path.
const RECENT_OUTPUT_SCAN_LIMIT = 2000;

/**
 * Reports whether recent terminal output contains a TUI frame, indicating a
 * full-screen/box-drawn application (e.g. Claude Code) currently owns the screen.
 *
 * @param {string} text - Raw terminal output (ANSI codes are fine; the frame
 *   characters survive ANSI stripping, so we test the raw text directly).
 * @returns {boolean} True when a TUI frame is present in the recent output.
 */
export function isTuiFrameActive(text) {
  if (!text) {
    return false;
  }
  const recentOutput = text.slice(-RECENT_OUTPUT_SCAN_LIMIT);
  return TUI_FRAME_CHARACTER_PATTERN.test(recentOutput);
}

/**
 * Decides whether it is safe to parse a working directory out of terminal text.
 *
 * Detection is only valid at a real shell prompt. It must be suppressed both when
 * a full-screen app uses the alternate screen buffer (vim, htop) and when a TUI
 * frame is drawn in the normal buffer (Claude Code, lazygit) — otherwise the
 * agent's UI chrome gets mistaken for the shell's CWD.
 *
 * Fails open: if the buffer type is unknown we still allow detection, because
 * freezing the CWD forever is worse than an occasional misread the existing
 * temp/system-path guards already filter.
 *
 * @param {string} text - Raw terminal output to inspect for a TUI frame.
 * @param {string} [bufferActiveType] - xterm.js term.buffer.active.type
 *   ("normal" | "alternate").
 * @returns {boolean} True when prompt-based CWD detection should run.
 */
export function shouldDetectDirectoryFromText(text, bufferActiveType) {
  if (bufferActiveType === ALTERNATE_SCREEN_BUFFER) {
    return false;
  }
  if (isTuiFrameActive(text)) {
    return false;
  }
  return true;
}
