// Tests for the hook that receives a published change brief.
//
// The brief is the one thing a developer must actually look at, so the failure
// that matters here is a brief that arrives and is not shown. Two ways that
// happens: the message is filtered out wrongly, or a page reload loses it. Both
// are covered, because a brief seen once and lost is worse than one never sent
// — the developer believes they reviewed something they did not.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useChangeBrief } from './useChangeBrief'

const SESSION_ID = 'session-001'

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

describe('useChangeBrief', () => {
  it('shows a brief published for this session', () => {
    const { result } = renderHook(() => useChangeBrief({ activeSessionId: SESSION_ID }))

    act(() => result.current.handleWsMessage(briefMessage()))

    expect(result.current.brief).toBeTruthy()
    expect(result.current.brief.headline).toContain('right-click')
    expect(result.current.isBriefOpen).toBe(true)
  })

  it('ignores a brief published for a different session', () => {
    // Two tabs must not show each other's work, or the developer reviews a
    // change they did not make.
    const { result } = renderHook(() => useChangeBrief({ activeSessionId: SESSION_ID }))

    act(() => result.current.handleWsMessage(briefMessage({ sessionId: 'someone-else' })))

    expect(result.current.brief).toBeNull()
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

  it('replaces a brief when a correction is republished', () => {
    const { result } = renderHook(() => useChangeBrief({ activeSessionId: SESSION_ID }))

    act(() => result.current.handleWsMessage(briefMessage()))
    act(() => result.current.handleWsMessage(briefMessage({ headline: 'Corrected headline here' })))

    expect(result.current.brief.headline).toBe('Corrected headline here')
  })

  it('restores the most recent brief after a reload', async () => {
    // A brief published before a refresh must still be there afterwards. The
    // developer has not seen it yet, and the gate has already been satisfied.
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ brief: JSON.parse(briefMessage()).brief }),
    }))

    const { result } = renderHook(() => useChangeBrief({ activeSessionId: SESSION_ID }))

    await waitFor(() => expect(result.current.brief).toBeTruthy())
    expect(result.current.brief.taskId).toBe('task-001')
  })

  it('stays quiet when there is nothing to restore', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }))

    const { result } = renderHook(() => useChangeBrief({ activeSessionId: SESSION_ID }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(result.current.brief).toBeNull()
  })

  it('lets the developer dismiss a brief they have read', () => {
    const { result } = renderHook(() => useChangeBrief({ activeSessionId: SESSION_ID }))

    act(() => result.current.handleWsMessage(briefMessage()))
    expect(result.current.isBriefOpen).toBe(true)

    act(() => result.current.dismiss())

    expect(result.current.isBriefOpen).toBe(false)
  })
})
