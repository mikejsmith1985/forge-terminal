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

    // mount fires two fetches: hook-status check (specs/008) + /api/sdd/status recovery (FR-012); total is 3
    expect(fetchSpy).toHaveBeenCalledTimes(3)
    const decisionCall = fetchSpy.mock.calls.find(([url]) => url === '/api/sdd/decision')
    const [calledUrl, calledOptions] = decisionCall
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

    // calls[0] is the mount-time recovery fetch; decision POST is the /api/sdd/decision call
    const decisionCall = fetchSpy.mock.calls.find(([url]) => url === '/api/sdd/decision')
    const body = JSON.parse(decisionCall[1].body)
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

  it('dismiss() clears the card locally with no fetch call', () => {
    // Provide a stub so the mount-time recovery fetch (FR-012) doesn't hit the network.
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false })

    const { result } = renderHook(() => useSddGate({ activeSessionId: ACTIVE_SESSION_ID }))

    act(() => {
      result.current.handleWsMessage(buildGateMessage())
    })
    expect(result.current.isCardOpen).toBe(true)

    act(() => {
      result.current.dismiss()
    })

    expect(result.current.isCardOpen).toBe(false)
    expect(result.current.card).toBeNull()
    // The decision endpoint must never be called; only the recovery fetch is permitted.
    const decisionCalls = fetchSpy.mock.calls.filter(([url]) => url === '/api/sdd/decision')
    expect(decisionCalls).toHaveLength(0)
  })

  it('on a 500 sets decisionError, keeps the card open, and clears isSubmitting', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 500 })

    const { result } = renderHook(() => useSddGate({ activeSessionId: ACTIVE_SESSION_ID }))

    act(() => {
      result.current.handleWsMessage(buildGateMessage())
    })

    await act(async () => {
      await result.current.submitDecision('approve')
    })

    expect(result.current.isCardOpen).toBe(true)
    expect(result.current.decisionError).toEqual(expect.stringContaining('500'))
    expect(result.current.isSubmitting).toBe(false)
  })

  it('clears decisionError and the card on a successful decision', async () => {
    // First fail to populate decisionError, then succeed.
    // mockResolvedValueOnce order: (1) hook-status check, (2) mount recovery fetch, (3) first decision → 503, (4) second decision → ok
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: true })               // hook-status check (specs/008) — best-effort on mount
      .mockResolvedValueOnce({ ok: false })              // mount-time /api/sdd/status recovery
      .mockResolvedValueOnce({ ok: false, status: 503 }) // first submitDecision → error
      .mockResolvedValueOnce({ ok: true })               // second submitDecision → success

    const { result } = renderHook(() => useSddGate({ activeSessionId: ACTIVE_SESSION_ID }))

    act(() => {
      result.current.handleWsMessage(buildGateMessage())
    })

    await act(async () => {
      await result.current.submitDecision('approve')
    })
    expect(result.current.decisionError).not.toBeNull()

    await act(async () => {
      await result.current.submitDecision('approve')
    })

    expect(fetchSpy).toHaveBeenCalledTimes(4) // hook-status + recovery + two decisions
    await waitFor(() => expect(result.current.isCardOpen).toBe(false))
    expect(result.current.card).toBeNull()
    expect(result.current.decisionError).toBeNull()
  })

  it('clears a prior decisionError when a new SDD_PHASE_GATE arrives', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 500 })

    const { result } = renderHook(() => useSddGate({ activeSessionId: ACTIVE_SESSION_ID }))

    act(() => {
      result.current.handleWsMessage(buildGateMessage())
    })

    await act(async () => {
      await result.current.submitDecision('approve')
    })
    expect(result.current.decisionError).not.toBeNull()

    act(() => {
      result.current.handleWsMessage(buildGateMessage({ cardId: 'gate-plan-next' }))
    })

    expect(result.current.decisionError).toBeNull()
    expect(result.current.isCardOpen).toBe(true)
  })
})

// ── T002: featureName and phaseSummaries (spec-006) ─────────────────────────

const buildStatusMessage = (overrides = {}) =>
  JSON.stringify({
    type: 'SDD_PHASE_STATUS',
    sessionId: ACTIVE_SESSION_ID,
    feature: 'demo-feature',
    phases: [],
    ...overrides,
  })

// ── Tab-switch isolation (Bug 4 root-cause fix) ───────────────────────────────

describe('useSddGate — card isolation on session change', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('clears the card when activeSessionId changes (prevents cross-tab gate bleed)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false })

    const OTHER_SESSION_ID = 'tab-9-other'
    const { result, rerender } = renderHook(
      ({ sid }) => useSddGate({ activeSessionId: sid }),
      { initialProps: { sid: ACTIVE_SESSION_ID } }
    )

    // Open a gate on the first session.
    act(() => {
      result.current.handleWsMessage(buildGateMessage())
    })
    expect(result.current.isCardOpen).toBe(true)

    // Simulate switching to a different tab (session change).
    rerender({ sid: OTHER_SESSION_ID })

    // Card must be cleared immediately so the new tab starts gate-free.
    expect(result.current.isCardOpen).toBe(false)
    expect(result.current.card).toBeNull()
  })
})

// ── Card recovery from status endpoint (post-spec-006 bug fix) ───────────────

describe('useSddGate — pendingCard recovery', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('restores an open card when the recovery fetch returns pendingCard', async () => {
    const pendingCard = {
      cardId:  'gate-specify-999',
      sessionId: ACTIVE_SESSION_ID,
      phase:   'specify',
      summary: { headline: 'Spec done', producedItems: ['spec.md'], flags: [] },
      actions: ['approve', 'reject', 'clarify'],
    }
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: false }) // hook-status check (specs/008) — best-effort, result ignored
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ phases: [], feature: '', pendingCard }),
      })

    const { result } = renderHook(() => useSddGate({ activeSessionId: ACTIVE_SESSION_ID }))

    await waitFor(() => expect(result.current.isCardOpen).toBe(true))
    expect(result.current.card).toMatchObject({ phase: 'specify', cardId: 'gate-specify-999' })
  })

  it('does not restore a card when pendingCard is absent from the recovery fetch', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ phases: [], feature: '' }),
    })

    const { result } = renderHook(() => useSddGate({ activeSessionId: ACTIVE_SESSION_ID }))

    // Give the fetch time to resolve.
    await act(async () => {})
    expect(result.current.isCardOpen).toBe(false)
  })
})

// ── T002: featureName and phaseSummaries (spec-006) ─────────────────────────

describe('useSddGate — featureName (spec-006)', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('featureName starts as empty string', () => {
    const { result } = renderHook(() => useSddGate({ activeSessionId: ACTIVE_SESSION_ID }))
    expect(result.current.featureName).toBe('')
  })

  it('featureName updates when SDD_PHASE_STATUS arrives for the active session', () => {
    const { result } = renderHook(() => useSddGate({ activeSessionId: ACTIVE_SESSION_ID }))

    act(() => {
      result.current.handleWsMessage(buildStatusMessage({ feature: 'auth-refresh' }))
    })

    expect(result.current.featureName).toBe('auth-refresh')
  })

  it('featureName is not updated for a different sessionId', () => {
    const { result } = renderHook(() => useSddGate({ activeSessionId: ACTIVE_SESSION_ID }))

    act(() => {
      result.current.handleWsMessage(buildStatusMessage({ sessionId: 'other-sess', feature: 'other-feature' }))
    })

    expect(result.current.featureName).toBe('')
  })

  it('featureName updates on each successive SDD_PHASE_STATUS event', () => {
    const { result } = renderHook(() => useSddGate({ activeSessionId: ACTIVE_SESSION_ID }))

    act(() => {
      result.current.handleWsMessage(buildStatusMessage({ feature: 'first-feature' }))
    })
    expect(result.current.featureName).toBe('first-feature')

    act(() => {
      result.current.handleWsMessage(buildStatusMessage({ feature: 'second-feature' }))
    })
    expect(result.current.featureName).toBe('second-feature')
  })
})

describe('useSddGate — phaseSummaries (spec-006)', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('phaseSummaries is a ref with an empty object initially', () => {
    const { result } = renderHook(() => useSddGate({ activeSessionId: ACTIVE_SESSION_ID }))
    expect(result.current.phaseSummaries).toBeDefined()
    expect(result.current.phaseSummaries.current).toEqual({})
  })

  it('phaseSummaries.current[phase] is populated when SDD_PHASE_GATE arrives', () => {
    const { result } = renderHook(() => useSddGate({ activeSessionId: ACTIVE_SESSION_ID }))
    const expectedSummary = {
      headline: 'Plan ready',
      producedItems: ['plan.md'],
      flags: [],
    }

    act(() => {
      result.current.handleWsMessage(buildGateMessage({ phase: 'plan', summary: expectedSummary }))
    })

    expect(result.current.phaseSummaries.current['plan']).toEqual(expectedSummary)
  })

  it('phaseSummaries accumulates summaries across multiple gate events', () => {
    const { result } = renderHook(() => useSddGate({ activeSessionId: ACTIVE_SESSION_ID }))

    act(() => {
      result.current.handleWsMessage(buildGateMessage({ phase: 'specify', summary: { headline: 'Spec done', producedItems: ['spec.md'], flags: [] } }))
    })
    act(() => {
      result.current.handleWsMessage(buildGateMessage({ phase: 'plan', summary: { headline: 'Plan done', producedItems: ['plan.md'], flags: [] } }))
    })

    expect(result.current.phaseSummaries.current['specify']).toMatchObject({ headline: 'Spec done' })
    expect(result.current.phaseSummaries.current['plan']).toMatchObject({ headline: 'Plan done' })
  })

  it('phaseSummaries is not populated for a different sessionId', () => {
    const { result } = renderHook(() => useSddGate({ activeSessionId: ACTIVE_SESSION_ID }))

    act(() => {
      result.current.handleWsMessage(buildGateMessage({ sessionId: 'other-sess', phase: 'plan', summary: { headline: 'Should not store', producedItems: [], flags: [] } }))
    })

    expect(result.current.phaseSummaries.current['plan']).toBeUndefined()
  })
})
