// Tests for the SDD gate hook: it must accept raw WebSocket strings, store only
// the gate destined for the active session, and submit the user's decision to
// the backend, clearing the card on success.
import { act, renderHook, waitFor } from '@testing-library/react'

import { useSddGate } from './useSddGate'

const ACTIVE_SESSION_ID = 'tab-3-abc123'

const buildGateMessage = (overrides = {}) =>
  JSON.stringify({
    type: 'SDD_PHASE_GATE',
    sessionId: ACTIVE_SESSION_ID,
    cardId: 'gate-plan-1718402000',
    phase: 'plan',
    summary: {
      headline: 'Plan ready · 3 contracts · 0 open clarifications',
      producedItems: ['plan.md', 'research.md'],
      flags: [],
    },
    actions: ['approve', 'reject', 'clarify'],
    ...overrides,
  })

describe('useSddGate', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('stores the card when a matching SDD_PHASE_GATE message arrives', () => {
    const { result } = renderHook(() => useSddGate({ activeSessionId: ACTIVE_SESSION_ID }))

    act(() => {
      result.current.handleWsMessage(buildGateMessage())
    })

    expect(result.current.isCardOpen).toBe(true)
    expect(result.current.card).toMatchObject({
      sessionId: ACTIVE_SESSION_ID,
      cardId: 'gate-plan-1718402000',
      phase: 'plan',
    })
  })

  it('ignores a gate message for a different session', () => {
    const { result } = renderHook(() => useSddGate({ activeSessionId: ACTIVE_SESSION_ID }))

    act(() => {
      result.current.handleWsMessage(buildGateMessage({ sessionId: 'tab-9-other' }))
    })

    expect(result.current.isCardOpen).toBe(false)
    expect(result.current.card).toBeNull()
  })

  it('ignores non-gate message types', () => {
    const { result } = renderHook(() => useSddGate({ activeSessionId: ACTIVE_SESSION_ID }))

    act(() => {
      result.current.handleWsMessage(JSON.stringify({ type: 'SOMETHING_ELSE' }))
    })

    expect(result.current.isCardOpen).toBe(false)
    expect(result.current.card).toBeNull()
  })

  it('ignores malformed JSON without throwing', () => {
    const { result } = renderHook(() => useSddGate({ activeSessionId: ACTIVE_SESSION_ID }))

    act(() => {
      result.current.handleWsMessage('{not valid json')
    })

    expect(result.current.isCardOpen).toBe(false)
  })

  it('submits an approve decision with the correct body and clears the card', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true })

    const { result } = renderHook(() => useSddGate({ activeSessionId: ACTIVE_SESSION_ID }))

    act(() => {
      result.current.handleWsMessage(buildGateMessage())
    })
    expect(result.current.isCardOpen).toBe(true)

    await act(async () => {
      await result.current.submitDecision('approve')
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [calledUrl, calledOptions] = fetchSpy.mock.calls[0]
    expect(calledUrl).toBe('/api/sdd/decision')
    expect(calledOptions.method).toBe('POST')
    expect(calledOptions.credentials).toBe('same-origin')

    const body = JSON.parse(calledOptions.body)
    expect(body).toEqual({
      sessionId: ACTIVE_SESSION_ID,
      cardId: 'gate-plan-1718402000',
      phase: 'plan',
      action: 'approve',
      clarifyText: null,
    })

    await waitFor(() => expect(result.current.isCardOpen).toBe(false))
    expect(result.current.card).toBeNull()
  })

  it('passes clarifyText through when provided', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true })

    const { result } = renderHook(() => useSddGate({ activeSessionId: ACTIVE_SESSION_ID }))

    act(() => {
      result.current.handleWsMessage(buildGateMessage())
    })

    await act(async () => {
      await result.current.submitDecision('clarify', 'Please clarify the data model')
    })

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body)
    expect(body.action).toBe('clarify')
    expect(body.clarifyText).toBe('Please clarify the data model')
  })

  it('keeps the card open when the decision request fails', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 500 })

    const { result } = renderHook(() => useSddGate({ activeSessionId: ACTIVE_SESSION_ID }))

    act(() => {
      result.current.handleWsMessage(buildGateMessage())
    })

    await act(async () => {
      await result.current.submitDecision('approve')
    })

    expect(result.current.isCardOpen).toBe(true)
  })
})
