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
 * current `card` plus `isCardOpen` flag for rendering, and `submitDecision`
 * to send a decision to the backend (clearing the card on success).
 *
 * @param {{ activeSessionId: string }} params
 */
export function useSddGate({ activeSessionId }) {
  const [card, setCard] = useState(null)

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

      setCard(parsed)
    },
    [activeSessionId]
  )

  const submitDecision = useCallback(
    async (action, clarifyText) => {
      if (!card) return

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

        // Success: the gate is resolved, so dismiss the card.
        setCard(null)
      } catch (decisionError) {
        console.error('Failed to submit SDD decision:', decisionError)
      }
    },
    [card]
  )

  return {
    card,
    isCardOpen: card !== null,
    handleWsMessage,
    submitDecision,
  }
}
