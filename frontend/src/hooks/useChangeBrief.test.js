// Tests for the hook that receives a published change brief.
//
// The brief is the one thing a developer must actually look at, so the failure
// that matters here is a brief that arrives and is not shown. Two ways that
// happens: the message is filtered out wrongly, or a page reload loses it. Both
// are covered, because a brief seen once and lost is worse than one never sent
// — the developer believes they reviewed something they did not.
//
// The brief also has to stay out of the way. It belongs to the tab whose work
// it describes, it waits as a pill until the developer is ready, and it can be
// parked again without being lost — a developer holding one thought in one tab
// while working in another must be able to do that.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useChangeBrief } from './useChangeBrief'

const SESSION_ID = 'session-001'
const OTHER_SESSION_ID = 'session-002'

function briefMessage(overrides = {}) {
  return JSON.stringify({
    type: 'CHANGE_BRIEF',
    brief: {
      briefId: 'brief-task-001',
      sessionId: SESSION_ID,
      taskId: 'task-001',
      headline: 'Folders now give up their path on a right-click',
      whatChanged: 'Right-clicking a folder offers Copy Path in both surfaces.',
      whyItChanged: 'Copy Path existed on files only.',
      whatCouldBreak: 'The clipboard is unavailable outside a secure context.',
      isRoutine: false,
      filesTouched: 6,
      decisions: [{
        chose: 'One shared context menu',
        insteadOf: 'A separate menu per surface',
        because: 'Two menus drift apart.',
        openQuestion: 'Is the coupling worth it?',
      }],
      ...overrides,
    },
  })
}

beforeEach(() => {
  global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }))
})

afterEach(() => vi.restoreAllMocks())

describe('useChangeBrief — receiving', () => {
  it('holds a brief published for this session, waiting as unread rather than opening', () => {
    // Arrival must not take the screen over: the developer may be mid-thought.
    const { result } = renderHook(() => useChangeBrief({ activeSessionId: SESSION_ID }))

    act(() => result.current.handleWsMessage(briefMessage()))

    expect(result.current.brief).toBeTruthy()
    expect(result.current.brief.headline).toContain('right-click')
    expect(result.current.briefState).toBe('unread')
    expect(result.current.isBriefOpen).toBe(false)
  })

  it('keeps a brief published for a different session, but does not show it here', () => {
    // Two tabs must not show each other's work, or the developer reviews a
    // change they did not make. The other tab's brief is still kept, so its
    // own tab can show it.
    const { result } = renderHook(() => useChangeBrief({ activeSessionId: SESSION_ID }))

    act(() => result.current.handleWsMessage(briefMessage({ sessionId: OTHER_SESSION_ID })))

    expect(result.current.brief).toBeNull()
    expect(result.current.briefState).toBeNull()
    expect(result.current.briefStatesBySession[OTHER_SESSION_ID]).toBe('unread')
  })

  it('files a brief with no session on the active tab', () => {
    // The restore path and older publishers send an empty session id; that
    // brief belongs to whoever is looking.
    const { result } = renderHook(() => useChangeBrief({ activeSessionId: SESSION_ID }))

    act(() => result.current.handleWsMessage(briefMessage({ sessionId: '' })))

    expect(result.current.brief).toBeTruthy()
    expect(result.current.briefStatesBySession[SESSION_ID]).toBe('unread')
  })

  it('ignores message types it does not own', () => {
    const { result } = renderHook(() => useChangeBrief({ activeSessionId: SESSION_ID }))

    act(() => result.current.handleWsMessage(JSON.stringify({ type: 'SDD_PHASE_GATE' })))

    expect(result.current.brief).toBeNull()
  })

  it('survives a malformed message rather than tearing down the session', () => {
    const { result } = renderHook(() => useChangeBrief({ activeSessionId: SESSION_ID }))

    act(() => result.current.handleWsMessage('not json at all'))

    expect(result.current.brief).toBeNull()
  })

  it('replaces a brief when a correction is republished, and marks it unread again', () => {
    const { result } = renderHook(() => useChangeBrief({ activeSessionId: SESSION_ID }))

    act(() => result.current.handleWsMessage(briefMessage()))
    act(() => result.current.dismissBrief())
    act(() => result.current.handleWsMessage(briefMessage({ headline: 'Corrected headline here' })))

    expect(result.current.brief.headline).toBe('Corrected headline here')
    expect(result.current.briefState).toBe('unread')
  })
})

describe('useChangeBrief — reading, parking, dismissing', () => {
  it('opens on request and closes back to parked, not to gone', () => {
    const { result } = renderHook(() => useChangeBrief({ activeSessionId: SESSION_ID }))
    act(() => result.current.handleWsMessage(briefMessage()))

    act(() => result.current.openBrief())
    expect(result.current.isBriefOpen).toBe(true)
    expect(result.current.briefState).toBe('open')

    act(() => result.current.parkBrief())
    expect(result.current.isBriefOpen).toBe(false)
    expect(result.current.briefState).toBe('parked')
    expect(result.current.brief).toBeTruthy()
  })

  it('lets the developer dismiss a brief they have read, and then stops offering it', () => {
    const { result } = renderHook(() => useChangeBrief({ activeSessionId: SESSION_ID }))
    act(() => result.current.handleWsMessage(briefMessage()))
    act(() => result.current.openBrief())

    act(() => result.current.dismissBrief())

    expect(result.current.isBriefOpen).toBe(false)
    expect(result.current.briefState).toBe('read')
    expect(result.current.briefStatesBySession[SESSION_ID]).toBeUndefined()
  })
})

describe('useChangeBrief — one brief per tab', () => {
  it('shows each tab its own brief and its own state when the active tab changes', () => {
    const { result, rerender } = renderHook(
      ({ activeSessionId }) => useChangeBrief({ activeSessionId }),
      { initialProps: { activeSessionId: SESSION_ID } },
    )
    act(() => result.current.handleWsMessage(briefMessage({ headline: 'First tab brief' })))
    act(() => result.current.handleWsMessage(briefMessage({ sessionId: OTHER_SESSION_ID, headline: 'Second tab brief' })))
    act(() => result.current.openBrief())

    rerender({ activeSessionId: OTHER_SESSION_ID })

    // The second tab sees its own brief, still unread, and nothing of the first.
    expect(result.current.brief.headline).toBe('Second tab brief')
    expect(result.current.briefState).toBe('unread')
    expect(result.current.isBriefOpen).toBe(false)

    rerender({ activeSessionId: SESSION_ID })

    // Coming back finds the first tab exactly as it was left: open.
    expect(result.current.brief.headline).toBe('First tab brief')
    expect(result.current.isBriefOpen).toBe(true)
  })

  it('shows nothing on a tab that has no brief, even when another tab has one', () => {
    // This is the defect that was reported: one tab's brief covering every tab.
    const { result, rerender } = renderHook(
      ({ activeSessionId }) => useChangeBrief({ activeSessionId }),
      { initialProps: { activeSessionId: SESSION_ID } },
    )
    act(() => result.current.handleWsMessage(briefMessage()))
    act(() => result.current.openBrief())

    rerender({ activeSessionId: OTHER_SESSION_ID })

    expect(result.current.brief).toBeNull()
    expect(result.current.isBriefOpen).toBe(false)
  })

  it('reports which tabs are holding a brief, so their tab can say so', () => {
    const { result } = renderHook(() => useChangeBrief({ activeSessionId: SESSION_ID }))
    act(() => result.current.handleWsMessage(briefMessage()))
    act(() => result.current.handleWsMessage(briefMessage({ sessionId: OTHER_SESSION_ID })))
    act(() => result.current.openBrief())
    act(() => result.current.parkBrief())

    expect(result.current.briefStatesBySession).toEqual({
      [SESSION_ID]: 'parked',
      [OTHER_SESSION_ID]: 'unread',
    })
  })
})

describe('useChangeBrief — restoring after a reload', () => {
  it('restores the most recent brief after a reload, as unread', async () => {
    // A brief published before a refresh must still be there afterwards. The
    // developer has not seen it yet, and the gate has already been satisfied.
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ brief: JSON.parse(briefMessage()).brief }),
    }))

    const { result } = renderHook(() => useChangeBrief({ activeSessionId: SESSION_ID }))

    await waitFor(() => expect(result.current.brief).toBeTruthy())
    expect(result.current.brief.taskId).toBe('task-001')
    expect(result.current.briefState).toBe('unread')
  })

  it('stays quiet when there is nothing to restore', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }))

    const { result } = renderHook(() => useChangeBrief({ activeSessionId: SESSION_ID }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(result.current.brief).toBeNull()
  })

  it('does not let a restore overwrite a brief the tab already holds', async () => {
    // Switching back to a tab must not reset what the developer already did
    // with its brief.
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ brief: JSON.parse(briefMessage({ headline: 'Stale disk copy' })).brief }),
    }))
    const { result, rerender } = renderHook(
      ({ activeSessionId }) => useChangeBrief({ activeSessionId }),
      { initialProps: { activeSessionId: SESSION_ID } },
    )
    act(() => result.current.handleWsMessage(briefMessage({ headline: 'Live brief' })))
    act(() => result.current.openBrief())

    rerender({ activeSessionId: OTHER_SESSION_ID })
    rerender({ activeSessionId: SESSION_ID })
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())

    expect(result.current.brief.headline).toBe('Live brief')
    expect(result.current.isBriefOpen).toBe(true)
  })
})
