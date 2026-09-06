// Unit tests for the decision "is this WebSocket frame a dashboard control message?"
//
// Red phase: fails until dashboardControlMessages.js exists.
//
// The terminal socket carries two kinds of JSON frames: control messages meant
// for the dashboard (phase gates, worktree offers, change briefs) and frames the
// terminal itself consumes (reattach, control transfer). The first kind must be
// handed up to the app, and every time a new type was added to the backend and
// not to this list, it was silently dropped — the specs/013 collision offer and
// the specs/014 change brief both died this way.
import {
  DASHBOARD_CONTROL_MESSAGE_TYPES,
  isDashboardControlMessage,
} from './dashboardControlMessages'

describe('isDashboardControlMessage', () => {
  it('forwards a change brief so the panel can render it live', () => {
    // The regression this file exists for: a brief published by an agent only
    // ever appeared after a page reload, because the live frame was dropped.
    expect(isDashboardControlMessage('CHANGE_BRIEF')).toBe(true)
  })

  it.each(['SDD_PHASE_GATE', 'SDD_PHASE_STATUS', 'SDD_WORKTREE_COLLISION'])(
    'still forwards the established SDD type %s',
    (messageType) => {
      expect(isDashboardControlMessage(messageType)).toBe(true)
    }
  )

  it.each(['SESSION_REATTACHED', 'SESSION_JOINED', 'CONTROL_TRANSFERRED', 'CONTROL_GRANTED'])(
    'leaves the terminal-owned frame %s for the terminal to handle',
    (messageType) => {
      expect(isDashboardControlMessage(messageType)).toBe(false)
    }
  )

  it('treats a missing or non-string type as not a control message', () => {
    expect(isDashboardControlMessage(undefined)).toBe(false)
    expect(isDashboardControlMessage(null)).toBe(false)
    expect(isDashboardControlMessage(42)).toBe(false)
  })
})

describe('DASHBOARD_CONTROL_MESSAGE_TYPES', () => {
  it('names every type the backend pushes for the dashboard, brief included', () => {
    expect([...DASHBOARD_CONTROL_MESSAGE_TYPES].sort()).toEqual(
      ['CHANGE_BRIEF', 'SDD_PHASE_GATE', 'SDD_PHASE_STATUS', 'SDD_WORKTREE_COLLISION']
    )
  })
})
