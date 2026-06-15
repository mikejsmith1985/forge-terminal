// Hook that owns the SDD phase gate lifecycle on the client: it filters inbound
// WebSocket messages down to gates for the active session and submits the user's
// approve/reject/clarify decision back to the backend.
import { useState, useCallback } from 'react'

// The WebSocket message type that carries a phase gate, and the endpoint the
// resulting decision is POSTed to. Named so no magic strings leak into logic.
const SDD_PHASE_GATE_TYPE = 'SDD_PHASE_GATE'
const DECISION_ENDPOINT = '/api/sdd/decision'

/**
 * useSddGate tracks the currently open SDD phase gate for `activeSessionId`.
 *
 * Returns `handleWsMessage(rawData)` to feed raw WebSocket strings in, the
 * current `card` plus `isCardOpen` flag for rendering, `submitDecision` to send
 * a decision to the backend (clearing the card on success), and `dismiss` — a
 * guaranteed local escape hatch that closes the card with no backend call so a
 * failed decision can never trap the user. `decisionError` surfaces a failure
 * message for the UI, and `isSubmitting` flags an in-flight POST.
 *
 * @param {{ activeSessionId: string }} params
 */
export function useSddGate({ activeSessionId }) {
  const [card, setCard] = useState(null)
  // A human-readable failure message from the last decision attempt, or null.
  const [decisionError, setDecisionError] = useState(null)
  // True only while a decision POST is in flight, so the UI can block double-clicks.
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleWsMessage = useCallback(
    (rawData) => {
      let parsed
      try {
        parsed = JSON.parse(rawData)
      } catch (parseError) {
        // Not our message; ignore non-JSON traffic on the shared socket.
        return
      }

      if (parsed?.type !== SDD_PHASE_GATE_TYPE) return
      if (parsed.sessionId !== activeSessionId) return

      // A fresh gate supersedes any stale failure from the previous one.
      setDecisionError(null)
      setCard(parsed)
    },
    [activeSessionId]
  )

  // dismiss is the failsafe exit: it clears the card locally with no backend
  // call, so the user can always escape even when the backend is unreachable.
  const dismiss = useCallback(() => {
    setCard(null)
    setDecisionError(null)
    setIsSubmitting(false)
  }, [])

  const submitDecision = useCallback(
    async (action, clarifyText) => {
      if (!card) return

      setIsSubmitting(true)
      try {
        const response = await fetch(DECISION_ENDPOINT, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: card.sessionId,
            cardId: card.cardId,
            phase: card.phase,
            action,
            clarifyText: clarifyText ?? null,
          }),
        })

        if (!response.ok) {
          throw new Error(`Decision request failed: ${response.status}`)
        }

        // Success: the gate is resolved, so dismiss the card and clear any error.
        setDecisionError(null)
        setCard(null)
      } catch (caughtError) {
        // Failure: keep the card open so the user can retry or dismiss, and
        // surface a short message (with the status when present).
        console.error('Failed to submit SDD decision:', caughtError)
        setDecisionError(caughtError.message ?? 'Decision request failed')
      } finally {
        setIsSubmitting(false)
      }
    },
    [card]
  )

  return {
    card,
    isCardOpen: card !== null,
    decisionError,
    isSubmitting,
    handleWsMessage,
    submitDecision,
    dismiss,
  }
}
