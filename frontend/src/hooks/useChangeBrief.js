// Hook that owns the change brief on the client.
//
// A brief is the one thing the developer is meant to actually look at, so the
// failure this guards against is a brief that arrives and is never seen. That
// happens two ways — the message is filtered out wrongly, or a page reload
// loses it — and the second is the dangerous one, because the commit gate has
// already been satisfied by then. The developer would believe they reviewed
// something they never saw.
//
// So a brief published before a refresh is fetched back on mount, the same way
// a pending phase gate is restored.

import { useCallback, useEffect, useState } from 'react'

// The message type carrying a published brief. Named so no bare string reaches
// the filtering logic.
const CHANGE_BRIEF_TYPE = 'CHANGE_BRIEF'

// Where a brief published before a page reload is fetched back from. Read once
// on mount, never polled — the live path is the WebSocket.
const LATEST_BRIEF_ENDPOINT = '/api/brief/latest'

/**
 * useChangeBrief tracks the change brief published for `activeSessionId`.
 *
 * Returns `handleWsMessage(rawData)` to feed raw WebSocket strings in, the
 * current `brief` and an `isBriefOpen` flag for rendering, and `dismiss` to
 * close a brief the developer has read.
 *
 * @param {{ activeSessionId: string }} params
 */
export function useChangeBrief({ activeSessionId }) {
  const [brief, setBrief] = useState(null)
  const [wasDismissed, setWasDismissed] = useState(false)

  /**
   * Accepts one raw WebSocket payload, keeping only briefs for this session.
   *
   * Two tabs must never show each other's work: a developer reviewing a change
   * they did not make is worse than seeing nothing, because they would sign it
   * off believing it was theirs.
   */
  const handleWsMessage = useCallback((rawData) => {
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
    if (parsed.brief.sessionId && parsed.brief.sessionId !== activeSessionId) return

    // A republished brief replaces its predecessor rather than queueing behind
    // it, so a correction is what the developer sees.
    setBrief(parsed.brief)
    setWasDismissed(false)
  }, [activeSessionId])

  // Restore a brief published before a reload. Fetched once, because the live
  // path is the socket and polling would be asking a question already answered.
  useEffect(() => {
    if (!activeSessionId) return undefined

    let wasCancelled = false

    async function restorePendingBrief() {
      try {
        const response = await fetch(`${LATEST_BRIEF_ENDPOINT}?sessionId=${encodeURIComponent(activeSessionId)}`)
        if (!response.ok) return

        const data = await response.json()
        if (!wasCancelled && data?.brief) {
          setBrief(data.brief)
        }
      } catch {
        // A brief that cannot be restored leaves the panel empty rather than
        // breaking the page. The gate record is authoritative either way.
      }
    }

    restorePendingBrief()
    return () => { wasCancelled = true }
  }, [activeSessionId])

  /** Closes a brief the developer has finished reading. */
  const dismiss = useCallback(() => setWasDismissed(true), [])

  return {
    brief,
    isBriefOpen: Boolean(brief) && !wasDismissed,
    handleWsMessage,
    dismiss,
  }
}
