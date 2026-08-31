// The change brief, drawn as a billboard rather than a report.
//
// A wall of prose at the end of a task gets agreed with, not read. So this is
// a small number of large panels: what changed, why, and what could break, with
// the risk given its own colour because a risk inside a paragraph is a risk
// nobody sees.
//
// The decision is the part that matters most. It shows both sides of the fork —
// what was chosen and what was rejected — and ends in an open question, because
// a panel that closes with a statement invites a nod and a panel that closes
// with a question invites a challenge. Challenging is how the developer learns
// their own codebase.
//
// A routine change stays small. Padding a mechanical edit out to look
// substantial trains the reader to skim, which is the habit this exists to
// break.

import React from 'react'
import './ChangeBriefPanel.css'

/**
 * Renders one published change brief.
 *
 * @param brief The published brief, or null when nothing has been published.
 * @param onDismiss Called when the developer has finished reading.
 */
export default function ChangeBriefPanel({ brief, onDismiss }) {
  if (!brief) return null

  return (
    <section className="change-brief" aria-label="Change brief">
      <header className="brief-header">
        <p className="brief-kicker">What just changed</p>
        <h2 className="brief-headline">{brief.headline}</h2>
        <p className="brief-scale">
          {brief.filesTouched} {brief.filesTouched === 1 ? 'file' : 'files'}
          {brief.isRoutine ? ' · routine change, no decision to weigh' : ''}
        </p>
      </header>

      <div className="brief-panels">
        <article className="brief-panel brief-panel--changed">
          <h3>Changed</h3>
          <p>{brief.whatChanged}</p>
        </article>

        <article className="brief-panel brief-panel--why">
          <h3>Why</h3>
          <p>{brief.whyItChanged}</p>
        </article>

        <article className="brief-panel brief-panel--risk">
          <h3>Could break</h3>
          <p>{brief.whatCouldBreak}</p>
        </article>
      </div>

      {brief.decisions?.length > 0 && (
        <div className="brief-decisions">
          {brief.decisions.map((decision, index) => (
            <BriefDecision key={`${brief.briefId}-decision-${index}`} decision={decision} />
          ))}
        </div>
      )}

      <footer className="brief-footer">
        <button type="button" className="brief-dismiss" onClick={onDismiss}>
          Got it
        </button>
      </footer>
    </section>
  )
}

/**
 * One fork in the change, with both sides shown and a question at the end.
 */
function BriefDecision({ decision }) {
  return (
    <article className="brief-decision">
      <h3 className="brief-decision__title">The call I made</h3>

      <div className="brief-fork">
        <div className="brief-fork__chosen">
          <span className="brief-fork__label">Chose</span>
          <p>{decision.chose}</p>
        </div>
        <div className="brief-fork__rejected">
          <span className="brief-fork__label">Not</span>
          <p>{decision.insteadOf}</p>
        </div>
      </div>

      <p className="brief-because">{decision.because}</p>
      <p className="brief-question">{decision.openQuestion}</p>
    </article>
  )
}
