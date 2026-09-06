// Decides which JSON frames on the terminal socket belong to the dashboard, not the terminal.
//
// The backend pushes dashboard control messages down the same WebSocket that
// carries terminal output. The terminal component must hand those up to the app
// untouched and never write them to the screen. Keeping the list here, with a
// test that names every type, means a new backend message type cannot be
// silently dropped the way the specs/013 worktree offer and the specs/014
// change brief were.

/** Message types the backend pushes for the SDD dashboard and the change brief panel. */
export const DASHBOARD_CONTROL_MESSAGE_TYPES = Object.freeze([
  'SDD_PHASE_GATE',
  'SDD_PHASE_STATUS',
  'SDD_WORKTREE_COLLISION',
  'CHANGE_BRIEF',
])

/**
 * Reports whether a parsed socket frame's `type` is meant for the dashboard.
 *
 * Anything else is left for the terminal's own handlers (reattach, control
 * transfer) or written to the screen as output.
 *
 * @param {unknown} messageType the `type` field of a parsed JSON frame
 * @returns {boolean}
 */
export function isDashboardControlMessage(messageType) {
  if (typeof messageType !== 'string') return false
  return DASHBOARD_CONTROL_MESSAGE_TYPES.includes(messageType)
}
