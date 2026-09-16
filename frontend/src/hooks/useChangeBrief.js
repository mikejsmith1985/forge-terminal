// Hook that owns the change briefs on the client, one per tab.
//
// A brief is the one thing the developer is meant to actually look at, so the
// failure this guards against is a brief that arrives and is never seen. That
// happens two ways — the message is filtered out wrongly, or a page reload
// loses it — and the second is the dangerous one, because the commit gate has
// already been satisfied by then. The developer would believe they reviewed
// something they never saw.
//
// The opposite failure is a brief that will not get out of the way. The first
// version held one brief for the whole window: it opened on arrival, it
// followed the developer to every tab, and the only way past it was to read it.
// So now a brief belongs to the tab whose session published it, arrives as an
// unread pill rather than an open panel, and can be parked and picked up again.
// Each tab keeps its own brief and its own place in that cycle.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// The message type carrying a published brief. Named so no bare string reaches
// the filtering logic.
const CHANGE_BRIEF_TYPE = 'CHANGE_BRIEF'

// Where a brief published before a page reload is fetched back from. Read once
// per tab, never polled — the live path is the WebSocket.
const LATEST_BRIEF_ENDPOINT = '/api/brief/latest'

/**
 * Where a tab's brief is in its life: waiting to be noticed, being read, put
 * down for later, or finished with.
 */
export const BRIEF_STATE = Object.freeze({
  UNREAD: 'unread',
  OPEN: 'open',
  PARKED: 'parked',
  READ: 'read',
})

/**
 * useChangeBrief tracks a change brief for every tab and exposes the one that
 * belongs to `activeSessionId`.
 *
 * Returns `handleWsMessage(rawData)` to feed raw WebSocket strings in from any
 * tab's socket; `brief`, `briefState` and `isBriefOpen` for the active tab;
 * `briefStatesBySession` so the tab bar can mark tabs that are holding one;
 * and `openBrief`, `parkBrief` and `dismissBrief` to move the active tab's
 * brief through its states.
 *
 * @param {{ activeSessionId: string }} params
 */
export function useChangeBrief({ activeSessionId }) {
  // sessionId → { brief, state }. Keyed by the session that published the
  // brief, never by whichever tab happened to be in front at the time.
  const [briefsBySession, setBriefsBySession] = useState({})

  // The restore effect needs to know whether a tab already holds a brief
  // without re-running every time the map changes.
  const briefsBySessionRef = useRef(briefsBySession)
  briefsBySessionRef.current = briefsBySession

  const activeEntry = briefsBySession[activeSessionId] ?? null

  /** Moves the active tab's brief to `nextState`, leaving every other tab alone. */
  const setActiveBriefState = useCallback((nextState) => {
    setBriefsBySession((currentBriefs) => {
      const currentEntry = currentBriefs[activeSessionId]
      if (!currentEntry) return currentBriefs
      return { ...currentBriefs, [activeSessionId]: { ...currentEntry, state: nextState } }
    })
  }, [activeSessionId])

  /**
   * Accepts one raw WebSocket payload from any tab's socket and files the brief
   * under the session it names.
   *
   * Two tabs must never show each other's work: a developer reviewing a change
   * they did not make is worse than seeing nothing, because they would sign it
   * off believing it was theirs. A brief that names no session belongs to the
   * tab whose socket carried it, or failing that the tab in front — which is
   * what older publishers and the restore path send.
   *
   * @param rawData The raw frame text.
   * @param sourceSessionId The tab whose socket delivered the frame, if known.
   */
  const handleWsMessage = useCallback((rawData, sourceSessionId = '') => {
    let parsed

    try {
      parsed = JSON.parse(rawData)
    } catch {
      // A malformed frame is not worth tearing the session down over. Other
      // hooks read the same stream and one bad message must not deafen them.
      return
    }

    if (parsed?.type !== CHANGE_BRIEF_TYPE) return
    if (!parsed.brief) return

    const owningSessionId = parsed.brief.sessionId || sourceSessionId || activeSessionId
    if (!owningSessionId) return

    // A republished brief replaces its predecessor rather than queueing behind
    // it, so a correction is what the developer sees — and it is unread again,
    // because they have not seen the corrected version.
    setBriefsBySession((currentBriefs) => ({
      ...currentBriefs,
      [owningSessionId]: { brief: parsed.brief, state: BRIEF_STATE.UNREAD },
    }))
  }, [activeSessionId])

  // Restore a brief published before a reload, once per tab. A tab that
  // already holds a brief is left alone: switching back to it must not reset
  // what the developer had done with it.
  useEffect(() => {
    if (!activeSessionId) return undefined
    if (briefsBySessionRef.current[activeSessionId]) return undefined

    let wasCancelled = false

    async function restorePendingBrief() {
      try {
        const response = await fetch(`${LATEST_BRIEF_ENDPOINT}?sessionId=${encodeURIComponent(activeSessionId)}`)
        if (!response.ok) return

        const data = await response.json()
        if (wasCancelled || !data?.brief) return

        setBriefsBySession((currentBriefs) => {
          // A live brief may have landed while the fetch was in flight; it wins.
          if (currentBriefs[activeSessionId]) return currentBriefs
          return { ...currentBriefs, [activeSessionId]: { brief: data.brief, state: BRIEF_STATE.UNREAD } }
        })
      } catch {
        // A brief that cannot be restored leaves the tab empty rather than
        // breaking the page. The gate record is authoritative either way.
      }
    }

    restorePendingBrief()
    return () => { wasCancelled = true }
  }, [activeSessionId])

  /** Opens the active tab's brief for reading. */
  const openBrief = useCallback(() => setActiveBriefState(BRIEF_STATE.OPEN), [setActiveBriefState])

  /** Puts the active tab's brief down without losing it. */
  const parkBrief = useCallback(() => setActiveBriefState(BRIEF_STATE.PARKED), [setActiveBriefState])

  /** Closes a brief the developer has finished reading. */
  const dismissBrief = useCallback(() => setActiveBriefState(BRIEF_STATE.READ), [setActiveBriefState])

  // Every tab still holding a brief the developer has not finished with, so
  // the tab bar can say so on the tab itself.
  const briefStatesBySession = useMemo(() => Object.fromEntries(
    Object.entries(briefsBySession)
      .filter(([, entry]) => entry.state !== BRIEF_STATE.READ)
      .map(([sessionId, entry]) => [sessionId, entry.state]),
  ), [briefsBySession])

  return {
    brief: activeEntry?.brief ?? null,
    briefState: activeEntry?.state ?? null,
    isBriefOpen: activeEntry?.state === BRIEF_STATE.OPEN,
    briefStatesBySession,
    handleWsMessage,
    openBrief,
    parkBrief,
    dismissBrief,
  }
}
