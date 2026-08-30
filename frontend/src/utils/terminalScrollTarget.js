/**
 * Decides what "scroll to bottom" means for a terminal, which depends entirely on
 * which screen buffer is active.
 *
 * Why this exists: a full-screen program — Claude Code's fullscreen renderer, vim,
 * less, htop — draws on the terminal's *alternate* screen buffer. That buffer has no
 * scrollback by design, so the terminal has nothing to scroll and its scrollbar has no
 * thumb. Forge's scroll-to-bottom button was therefore a dead control for the entire
 * time such a program was running: it moved a viewport that could not move. Since the
 * program owns the view, the only way to reach the newest output is to ask it, and
 * Ctrl+End is the conventional "jump to the end" key that full-screen programs honour
 * (Claude Code binds it to "jump to the latest message and re-enable auto-follow").
 */
import { ALTERNATE_SCREEN_BUFFER } from './terminalTuiState';

// Ctrl+End exactly as xterm.js encodes it: End is keyCode 35, which xterm emits as
// ESC [ 1 ; <modifier+1> F, and Ctrl is modifier bit 4. Sending the same bytes a real
// keypress would produce means the running program cannot tell the difference.
export const CTRL_END_KEY_SEQUENCE = '\x1b[1;5F';

// Ask the running full-screen program to jump to its own end.
export const SCROLL_ACTION_SEND_END_KEY = 'send-end-key';

// Scroll the terminal's own viewport back down through its scrollback.
export const SCROLL_ACTION_SCROLL_VIEWPORT = 'scroll-viewport';

// Lines a single mouse-wheel notch moves. xterm.js defaults `scrollSensitivity` to 1,
// which is unusually slow — most terminals and vim move three lines per notch. It
// matters most in the alternate screen, where xterm converts each notch into that many
// arrow keys for the running program: at one line per notch, scrolling back through a
// long CLI session takes minutes.
export const WHEEL_SCROLL_LINES_PER_NOTCH = 3;

/**
 * Reports how a scroll-to-bottom request should be carried out for the given buffer.
 *
 * @param {string} bufferType - xterm's `terminal.buffer.active.type`.
 * @returns {string} One of the SCROLL_ACTION_* constants.
 */
export function resolveScrollToBottomAction(bufferType) {
  if (bufferType === ALTERNATE_SCREEN_BUFFER) {
    return SCROLL_ACTION_SEND_END_KEY;
  }
  return SCROLL_ACTION_SCROLL_VIEWPORT;
}

/**
 * Reports whether a scroll-to-bottom request could achieve anything right now, which
 * is what decides whether the button is offered at all.
 *
 * In an ordinary shell the terminal knows its own scroll position, so the button is
 * offered only when the view actually sits above the newest output. In the alternate
 * screen the program never reports its scroll position to the terminal, so the button
 * stays available throughout and the program decides what the key means.
 *
 * @param {object} params
 * @param {string} params.bufferType - xterm's `terminal.buffer.active.type`.
 * @param {boolean} params.isScrolledUp - True when the viewport sits above the newest output.
 * @returns {boolean} True when the button should be live.
 */
export function canScrollToBottom({ bufferType, isScrolledUp }) {
  if (bufferType === ALTERNATE_SCREEN_BUFFER) {
    return true;
  }
  return Boolean(isScrolledUp);
}

/**
 * Carries out a scroll-to-bottom request, taking whichever route the active buffer
 * allows. Shared by the on-screen button and the Ctrl+End shortcut so both behave
 * identically — they previously diverged, and the shortcut's copy of the logic could
 * not reach a full-screen program at all.
 *
 * @param {object} params
 * @param {object|null} params.terminal - The xterm.js Terminal, or null before mount.
 * @param {HTMLElement|null} params.viewportElement - The `.xterm-viewport` element.
 * @returns {string|null} The SCROLL_ACTION_* taken, or null when there was no terminal.
 */
export function performScrollToBottom({ terminal, viewportElement }) {
  if (!terminal) {
    return null;
  }

  const action = resolveScrollToBottomAction(terminal.buffer.active.type);

  if (action === SCROLL_ACTION_SEND_END_KEY) {
    // Routed through input() so the bytes travel the same path as a real keypress.
    terminal.input(CTRL_END_KEY_SEQUENCE);
    terminal.focus();
    return action;
  }

  terminal.scrollToBottom();

  // Belt-and-suspenders: xterm's scrollToBottom() can no-op while its buffer cursor is
  // already on the last line (common during streaming output), leaving the DOM viewport
  // stale. Forcing scrollTop is reliable regardless of xterm's internal state.
  if (viewportElement) {
    viewportElement.scrollTop = viewportElement.scrollHeight;
  }

  // Clicking the button or pressing the shortcut moves browser focus away from xterm's
  // hidden textarea; refocus so the next keypress reaches the terminal directly.
  terminal.focus();
  return action;
}
