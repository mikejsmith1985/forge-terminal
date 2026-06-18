// Presentational decision card for an SDD (Spec Kit) phase gate: shows a scannable
// summary of a completed phase and the actions a user can take to advance the pipeline.
import React, { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, XCircle, MessageSquare, FileText, X, AlertTriangle } from 'lucide-react'

import './PhaseDecisionCard.css'
import ActionPromptStrip from './ActionPromptStrip'

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

// Placeholder steer shown in the clarify textarea so the user knows what to write.
const CLARIFY_PLACEHOLDER = 'Add a steer for the next phase…'

/**
 * ArtifactPreviewSection renders a collapsible <details> block with the first
 * sddArtifactMaxLines lines of the phase artifact embedded in the gate event.
 * Omitted entirely when artifactPreview is null/undefined (pty-quiet phases).
 * Shows a "not yet available" fallback when content is present but empty.
 */
function ArtifactPreviewSection({ artifactPreview }) {
  if (!artifactPreview) return null

  const { content, filePath, totalLines, isTruncated } = artifactPreview
  const fileName = filePath ? filePath.replace(/^.*[\\/]/, '') : 'artifact'

  if (!content) {
    return (
      <div className="phase-decision-card-artifact">
        <p className="phase-decision-card-artifact-missing">Artifact not yet available</p>
      </div>
    )
  }

  return (
    <details className="phase-decision-card-artifact">
      <summary className="phase-decision-card-artifact-summary">
        {fileName}{isTruncated ? ` (first 200 of ${totalLines} lines)` : ''}
      </summary>
      <pre className="phase-decision-card-artifact-pre">{content}</pre>
      {isTruncated && (
        <p className="phase-decision-card-artifact-truncated">
          Showing first 200 lines — {totalLines - 200} more lines not shown
        </p>
      )}
    </details>
  )
}

/**
 * PhaseDecisionCard renders a single SDD phase gate as a modal decision card.
 * Returns null while closed. Each entry in `actions` becomes a button that
 * invokes `onAction(action)` with the backend action string. Clarify is a
 * two-step interaction: the first click opens an inline steer input, and
 * Confirm invokes `onAction('clarify', trimmedSteer)`.
 *
 * `onDismiss` is the failsafe exit: a header ✕ and the Escape key both call it,
 * and it stays enabled regardless of backend state so the user is never trapped.
 * `decisionError` (when set) renders a visible error block, and `isSubmitting`
 * disables the action buttons while a decision is in flight.
 * `artifactPreview` (optional) carries the first 200 lines of the phase artifact
 * for file-detected phases; omitted for pty-quiet phases (Validate/Implement).
 */
export default function PhaseDecisionCard({
  phase,
  summary,
  actions,
  onAction,
  onDismiss,
  decisionError,
  isSubmitting,
  isOpen,
  artifactPreview,
  phases = [],
}) {
  // Whether the inline clarify steer input is showing instead of the action buttons.
  const [isClarifying, setIsClarifying] = useState(false)
  // The raw steer text the user is typing for a clarify action.
  const [clarifyText, setClarifyText] = useState('')

  // Opening clarify mode swaps the action row for the steer input; it must not
  // advance the gate, so onAction is deliberately not called here.
  const handleClarifyOpen = useCallback(() => {
    setClarifyText('')
    setIsClarifying(true)
  }, [])

  // Cancel discards the steer and returns to the normal action buttons.
  const handleClarifyCancel = useCallback(() => {
    setIsClarifying(false)
    setClarifyText('')
  }, [])

  // Confirm sends the trimmed steer; an empty/whitespace steer is blocked by the
  // disabled Confirm button so this always carries a non-empty value.
  const handleClarifyConfirm = useCallback(() => {
    onAction('clarify', clarifyText.trim())
  }, [onAction, clarifyText])

  // Route each action button: clarify opens the inline input; everything else
  // (approve/reject) advances the gate immediately with no second argument.
  const handleActionClick = useCallback(
    (action) => {
      if (action === 'clarify') {
        handleClarifyOpen()
        return
      }
      onAction(action)
    },
    [onAction, handleClarifyOpen]
  )

  // Escape is a failsafe exit alongside the header ✕: while the card is open,
  // pressing Escape dismisses it locally so a stuck backend can never trap the user.
  useEffect(() => {
    if (!isOpen) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onDismiss()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onDismiss])

  if (!isOpen) return null

  const { headline, producedItems = [], flags = [] } = summary ?? {}
  const hasClarifyText = clarifyText.trim().length > 0
  const hasDecisionError = Boolean(decisionError)

  return (
    <div className="phase-decision-card-drawer">
      <div className="phase-decision-card">
        <div className="phase-decision-card-header">
          <span className="phase-decision-card-status">Phase Gate</span>
          <h3 className="phase-decision-card-phase">{phase}</h3>
          {/* Failsafe exit: never disabled, no backend call — guaranteed escape. */}
          <button
            type="button"
            className="phase-decision-card-dismiss"
            onClick={onDismiss}
            aria-label="Dismiss"
            title="Dismiss (Esc)"
          >
            <X size={18} />
          </button>
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

          {hasDecisionError && (
            <div className="phase-decision-card-error" role="alert">
              <AlertTriangle size={16} className="phase-decision-card-error-icon" />
              <div className="phase-decision-card-error-text">
                <span className="phase-decision-card-error-message">{decisionError}</span>
                <span className="phase-decision-card-error-hint">
                  Retry, or dismiss this card to continue.
                </span>
              </div>
            </div>
          )}
        </div>

        {isClarifying ? (
          <div className="phase-decision-card-clarify">
            <textarea
              className="phase-decision-card-clarify-input"
              placeholder={CLARIFY_PLACEHOLDER}
              value={clarifyText}
              onChange={(event) => setClarifyText(event.target.value)}
              autoFocus
            />
            <div className="phase-decision-card-actions">
              <button
                type="button"
                className="phase-decision-card-button phase-decision-card-button-cancel"
                onClick={handleClarifyCancel}
              >
                Cancel
              </button>
              <button
                type="button"
                className="phase-decision-card-button phase-decision-card-button-confirm"
                onClick={handleClarifyConfirm}
                disabled={!hasClarifyText}
              >
                <MessageSquare size={16} className="phase-decision-card-button-icon" />
                Confirm
              </button>
            </div>
          </div>
        ) : (
          <div className="phase-decision-card-actions">
            {isSubmitting && (
              <span className="phase-decision-card-pending" aria-live="polite">
                Submitting…
              </span>
            )}
            {actions.map((action) => {
              const presentation = ACTION_PRESENTATION[action] ?? { label: action, Icon: null }
              const { label, Icon } = presentation
              return (
                <button
                  key={action}
                  type="button"
                  className={`phase-decision-card-button phase-decision-card-button-${action}`}
                  onClick={() => handleActionClick(action)}
                  disabled={isSubmitting}
                >
                  {Icon && <Icon size={16} className="phase-decision-card-button-icon" />}
                  {label}
                </button>
              )
            })}
          </div>
        )}
      </div>
      <ActionPromptStrip phases={phases} isCardOpen={true} />
    </div>
  )
}
