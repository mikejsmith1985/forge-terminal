// Presentational decision card for an SDD (Spec Kit) phase gate: shows a scannable
// summary of a completed phase and the actions a user can take to advance the pipeline.
import React from 'react'
import { CheckCircle2, XCircle, MessageSquare, FileText } from 'lucide-react'

import './PhaseDecisionCard.css'

// Display metadata per action: a human label and an icon, keyed by the
// backend action string so no magic strings leak into the markup.
const ACTION_PRESENTATION = {
  approve: { label: 'Approve', Icon: CheckCircle2 },
  reject: { label: 'Reject', Icon: XCircle },
  clarify: { label: 'Clarify', Icon: MessageSquare },
}

// CSS modifier suffix per flag severity. Unknown severities fall back to info.
const SEVERITY_MODIFIER = {
  info: 'info',
  warn: 'warn',
  block: 'block',
}

const DEFAULT_SEVERITY = 'info'

/**
 * PhaseDecisionCard renders a single SDD phase gate as a modal decision card.
 * Returns null while closed. Each entry in `actions` becomes a button that
 * invokes `onAction(action)` with the backend action string.
 */
export default function PhaseDecisionCard({ phase, summary, actions, onAction, isOpen }) {
  if (!isOpen) return null

  const { headline, producedItems = [], flags = [] } = summary ?? {}

  return (
    <div className="phase-decision-card-overlay">
      <div className="phase-decision-card">
        <div className="phase-decision-card-header">
          <span className="phase-decision-card-status">Phase Gate</span>
          <h3 className="phase-decision-card-phase">{phase}</h3>
        </div>

        <div className="phase-decision-card-body">
          <p className="phase-decision-card-headline">{headline}</p>

          {producedItems.length > 0 && (
            <ul className="phase-decision-card-items">
              {producedItems.map((producedItem) => (
                <li key={producedItem} className="phase-decision-card-item">
                  <FileText size={14} className="phase-decision-card-item-icon" />
                  {producedItem}
                </li>
              ))}
            </ul>
          )}

          <div className="phase-decision-card-flags">
            {flags.length === 0 ? (
              <span className="phase-decision-card-flag phase-decision-card-flag-clean">
                No flags
              </span>
            ) : (
              flags.map((flag) => {
                const severityModifier = SEVERITY_MODIFIER[flag.severity] ?? DEFAULT_SEVERITY
                return (
                  <span
                    key={flag.kind ?? flag.label}
                    className={`phase-decision-card-flag phase-decision-card-flag-${severityModifier}`}
                  >
                    {flag.label}
                  </span>
                )
              })
            )}
          </div>
        </div>

        <div className="phase-decision-card-actions">
          {actions.map((action) => {
            const presentation = ACTION_PRESENTATION[action] ?? { label: action, Icon: null }
            const { label, Icon } = presentation
            return (
              <button
                key={action}
                type="button"
                className={`phase-decision-card-button phase-decision-card-button-${action}`}
                onClick={() => onAction(action)}
              >
                {Icon && <Icon size={16} className="phase-decision-card-button-icon" />}
                {label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
