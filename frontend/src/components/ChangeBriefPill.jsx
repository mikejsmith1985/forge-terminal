// The pill that says a change brief is waiting on this tab.
//
// This is what a brief looks like before the developer chooses to read it.
// It replaced the panel opening on arrival, which took the whole screen and
// had to be read before anything else could happen. The pill is noticeable —
// an unread one pulses — but it is not in the way, and it is the only thing
// that has to be clicked to get the brief back after parking it.

import React from 'react'
import { FileText } from 'lucide-react'
import { BRIEF_STATE } from '../hooks/useChangeBrief'
import './ChangeBriefPanel.css'

// What the pill says in each state it is shown in.
const PILL_LABELS = Object.freeze({
  [BRIEF_STATE.UNREAD]: 'Brief ready',
  [BRIEF_STATE.PARKED]: 'Brief parked',
})

/**
 * Renders the pill for a brief that is unread or parked, and nothing otherwise.
 *
 * @param briefState Where the tab's brief is in its life, or null when it has none.
 * @param headline The brief's headline, shown so the developer knows what is waiting.
 * @param onOpen Called when the developer is ready to read the brief.
 */
export default function ChangeBriefPill({ briefState, headline, onOpen }) {
  const label = PILL_LABELS[briefState]
  if (!label) return null

  return (
    <button
      type="button"
      className={`brief-pill brief-pill--${briefState}`}
      onClick={onOpen}
      title={`${label}: ${headline}`}
      data-testid="change-brief-pill"
    >
      <FileText size={14} />
      <span className="brief-pill__label">{label}</span>
      <span className="brief-pill__headline">{headline}</span>
    </button>
  )
}
