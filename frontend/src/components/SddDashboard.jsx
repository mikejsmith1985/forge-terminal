// Always-visible SDD pipeline dashboard: replaces SddPipelinePanel and PhaseDecisionCard.
// Renders a horizontal phase rail, per-phase detail strip, inline decision bar,
// clarify dialog, and always-on action prompt. specs/006-sdd-pipeline-dashboard.
import { useState, useRef, useEffect, useCallback } from 'react'
import { CheckCircle2, XCircle, MessageSquare, AlertTriangle, FileText, ChevronDown } from 'lucide-react'
import ActionPromptStrip from './ActionPromptStrip'
import './SddDashboard.css'

// Status icon per PhaseDisplayStatus value. Unknown statuses fall back to '?'.
const STATUS_ICON = {
  pending:             '◌',
  active:              '⟳',
  'awaiting-decision': '⏳',
  iterating:           '↻',
  rejected:            '⚠',
  complete:            '✓',
}

// One-word label shown below each phase cell's icon.
const STATUS_LABEL = {
  pending:             'Pending',
  active:              'Running…',
  'awaiting-decision': 'Awaiting',
  iterating:           'Awaiting',
  rejected:            'Rejected',
  complete:            'Done',
}

// Display strings and colour for the pipeline-level header badge.
const PIPELINE_BADGE = {
  complete:  { label: 'Complete',  mod: 'complete' },
  awaiting:  { label: 'Awaiting',  mod: 'awaiting' },
  iterating: { label: 'Awaiting',  mod: 'awaiting' },
  rejected:  { label: 'Rejected',  mod: 'rejected' },
  running:   { label: 'Running',   mod: 'running'  },
  idle:      { label: 'Idle',      mod: 'idle'     },
}

// Map of action → display label and icon component.
const ACTION_META = {
  approve: { label: 'Approve', Icon: CheckCircle2 },
  reject:  { label: 'Reject',  Icon: XCircle },
  clarify: { label: 'Clarify', Icon: MessageSquare },
}

const SEVERITY_MOD = { info: 'info', warn: 'warn', block: 'block' }

/** Derive a pipeline-level badge key from the phases array. */
function derivePipelineBadge(phases) {
  if (phases.length === 0) return 'idle'
  if (phases.every((p) => p.displayStatus === 'complete')) return 'complete'
  if (phases.some((p) => p.displayStatus === 'iterating')) return 'iterating'
  if (phases.some((p) => p.displayStatus === 'awaiting-decision')) return 'awaiting'
  if (phases.some((p) => p.displayStatus === 'rejected')) return 'rejected'
  if (phases.some((p) => p.displayStatus === 'active')) return 'running'
  return 'idle'
}

/** Base name of a file path (last segment after / or \). */
function baseName(filePath) {
  return filePath ? filePath.replace(/^.*[\\/]/, '') : ''
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DashboardHeader({ featureName, phases }) {
  const badgeKey = derivePipelineBadge(phases)
  const { label, mod } = PIPELINE_BADGE[badgeKey]
  return (
    <div className="sdd-dashboard__header">
      <span className="sdd-dashboard__feature-name">
        {featureName || 'No active feature'}
      </span>
      <span className={`sdd-dashboard__badge sdd-dashboard__badge--${mod}`}>{label}</span>
    </div>
  )
}

function PhaseCell({ entry, isSelected, onClick }) {
  const { phase, displayStatus, runCount } = entry
  const knownStatuses = Object.keys(STATUS_ICON)
  const statusMod = knownStatuses.includes(displayStatus) ? displayStatus : 'unknown'
  const icon = STATUS_ICON[displayStatus] ?? '?'
  const label = STATUS_LABEL[displayStatus] ?? displayStatus
  const isClickable = displayStatus === 'complete'

  return (
    <div
      className={[
        'sdd-dashboard__cell',
        `sdd-dashboard__cell--${statusMod}`,
        isSelected ? 'sdd-dashboard__cell--selected' : '',
        isClickable ? 'sdd-dashboard__cell--clickable' : '',
      ].filter(Boolean).join(' ')}
      onClick={isClickable ? onClick : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick() } : undefined}
      aria-expanded={isClickable ? isSelected : undefined}
      aria-label={isClickable ? `${phase} phase — ${label}, click to view summary` : undefined}
    >
      <span className="sdd-dashboard__cell-icon">{icon}</span>
      <span className="sdd-dashboard__cell-name">{phase}</span>
      <span className="sdd-dashboard__cell-status">{label}</span>
      {runCount >= 2 && (
        <span className="sdd-dashboard__cell-badge">×{runCount}</span>
      )}
      {isClickable && (
        <span className="sdd-dashboard__cell-chevron" aria-hidden="true">
          <ChevronDown size={12} />
        </span>
      )}
    </div>
  )
}

function PhaseRail({ phases, selectedPhase, onCellClick }) {
  if (phases.length === 0) {
    return (
      <div className="sdd-dashboard__rail">
        <div className="sdd-dashboard__idle-row">
          <span className="sdd-dashboard__cell-icon">◌</span>
          <span>No active feature — run /speckit-specify to start</span>
        </div>
      </div>
    )
  }
  return (
    <div className="sdd-dashboard__rail">
      {phases.map((entry) => (
        <PhaseCell
          key={entry.phase}
          entry={entry}
          isSelected={selectedPhase === entry.phase}
          onClick={() => onCellClick(entry.phase)}
        />
      ))}
    </div>
  )
}

function PhaseDetailStrip({ summary, artifactPath, onFileOpen }) {
  if (!summary) return null
  const { headline, producedItems = [], flags = [] } = summary
  const hasItems = producedItems.length > 0
  const hasFlags = flags.length > 0
  const fileName = baseName(artifactPath)

  return (
    <div className="sdd-dashboard__detail-strip">
      <p className="sdd-dashboard__detail-headline">{headline}</p>
      <div className="sdd-dashboard__detail-items">
        {hasItems ? (
          producedItems.map((item) => (
            <span key={item} className="sdd-dashboard__detail-chip">
              <FileText size={11} aria-hidden="true" /> {item}
            </span>
          ))
        ) : (
          <span className="sdd-dashboard__detail-empty">No artifacts produced</span>
        )}
      </div>
      <div className="sdd-dashboard__detail-flags">
        {hasFlags ? (
          flags.map((flag) => (
            <span
              key={flag.kind ?? flag.label}
              className={`sdd-dashboard__detail-flag sdd-dashboard__detail-flag--${SEVERITY_MOD[flag.severity] ?? 'info'}`}
            >
              {flag.label}
            </span>
          ))
        ) : (
          <span className="sdd-dashboard__detail-no-flags">No flags</span>
        )}
      </div>
      {artifactPath && (
        <button
          type="button"
          className="sdd-dashboard__detail-artifact-link"
          onClick={() => onFileOpen({ path: artifactPath, name: fileName })}
        >
          View artifact →
        </button>
      )}
    </div>
  )
}

function DecisionBar({ card, isSubmitting, decisionError, onAction, onClarify }) {
  if (!card) return null
  const { actions = [] } = card
  return (
    <div className="sdd-dashboard__decision-bar">
      {decisionError && (
        <div className="sdd-dashboard__decision-error" role="alert">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>{decisionError}</span>
        </div>
      )}
      <div className="sdd-dashboard__decision-buttons">
        {isSubmitting && (
          <span className="sdd-dashboard__decision-submitting" aria-live="polite">
            Submitting…
          </span>
        )}
        {actions.map((action) => {
          const meta = ACTION_META[action] ?? { label: action, Icon: null }
          const { label, Icon } = meta
          return (
            <button
              key={action}
              type="button"
              className={`sdd-dashboard__decision-btn sdd-dashboard__decision-btn--${action}`}
              disabled={isSubmitting}
              onClick={() => action === 'clarify' ? onClarify() : onAction(action)}
            >
              {Icon && <Icon size={14} aria-hidden="true" />}
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * ClarifyModal is a named export for isolated unit testing.
 * Uses the native <dialog> element for a free focus-trap and top-layer rendering.
 *
 * @param {{ isOpen: boolean, onConfirm: (steer: string) => void, onCancel: () => void }} props
 */
export function ClarifyModal({ isOpen, onConfirm, onCancel }) {
  const dialogRef = useRef(null)
  const [steer, setSteer] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (isOpen) {
      setSteer('')
      dialog.showModal?.()
    } else {
      dialog.close?.()
    }
  }, [isOpen])

  const handleConfirm = useCallback(() => {
    const trimmed = steer.trim()
    if (!trimmed) return
    onConfirm(trimmed)
    setSteer('')
  }, [steer, onConfirm])

  const handleCancel = useCallback(() => {
    setSteer('')
    onCancel()
  }, [onCancel])

  // Native <dialog> fires 'cancel' on Escape — wire it to our onCancel.
  const handleDialogCancel = useCallback((e) => {
    e.preventDefault()
    handleCancel()
  }, [handleCancel])

  const isConfirmable = steer.trim().length > 0

  return (
    <dialog
      ref={dialogRef}
      className="sdd-dashboard__clarify-dialog"
      onCancel={handleDialogCancel}
    >
      <p className="sdd-dashboard__clarify-prompt">
        Add a steer for the next phase run:
      </p>
      <textarea
        className="sdd-dashboard__clarify-input"
        value={steer}
        onChange={(e) => setSteer(e.target.value)}
        placeholder="e.g. Narrow scope to the auth module only…"
        rows={4}
        autoFocus
      />
      <div className="sdd-dashboard__clarify-actions">
        <button
          type="button"
          className="sdd-dashboard__clarify-btn sdd-dashboard__clarify-btn--cancel"
          onClick={handleCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="sdd-dashboard__clarify-btn sdd-dashboard__clarify-btn--confirm"
          onClick={handleConfirm}
          disabled={!isConfirmable}
        >
          <MessageSquare size={14} aria-hidden="true" />
          Confirm
        </button>
      </div>
    </dialog>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * SddDashboard is the unified SDD pipeline surface.
 * It replaces SddPipelinePanel (collapsible bottom bar) and PhaseDecisionCard
 * (floating drawer) with a single always-visible dashboard.
 *
 * @param {{
 *   phases: Array,
 *   featureName: string,
 *   phaseSummaries: React.MutableRefObject<Record<string,object>>,
 *   isCardOpen: boolean,
 *   card: object|null,
 *   decisionError: string|null,
 *   isSubmitting: boolean,
 *   onAction: (action: string, clarifyText?: string) => void,
 *   onDismiss: () => void,
 *   onFileOpen: (file: {path: string, name: string}) => void,
 * }} props
 */
export default function SddDashboard({
  phases = [],
  featureName = '',
  phaseSummaries,
  isCardOpen = false,
  card = null,
  decisionError = null,
  isSubmitting = false,
  onAction,
  onDismiss,
  onFileOpen,
}) {
  const [selectedPhase, setSelectedPhase] = useState(null)
  const [isClarifyOpen, setIsClarifyOpen] = useState(false)

  const handleCellClick = useCallback((phaseName) => {
    setSelectedPhase((prev) => (prev === phaseName ? null : phaseName))
  }, [])

  const handleClarifyConfirm = useCallback((steer) => {
    setIsClarifyOpen(false)
    onAction('clarify', steer)
  }, [onAction])

  const selectedSummary = selectedPhase ? phaseSummaries?.current?.[selectedPhase] ?? null : null
  const selectedArtifactPath = selectedPhase
    ? phases.find((p) => p.phase === selectedPhase)?.artifactPath ?? ''
    : ''

  return (
    <div className="sdd-dashboard" data-testid="sdd-dashboard">
      <DashboardHeader featureName={featureName} phases={phases} />

      <div className="sdd-dashboard__rail-wrapper">
        <PhaseRail
          phases={phases}
          selectedPhase={selectedPhase}
          onCellClick={handleCellClick}
        />
        {selectedPhase && (
          <PhaseDetailStrip
            summary={selectedSummary}
            artifactPath={selectedArtifactPath}
            onFileOpen={onFileOpen}
          />
        )}
      </div>

      <ActionPromptStrip phases={phases} isCardOpen={isCardOpen} />

      {isCardOpen && (
        <DecisionBar
          card={card}
          isSubmitting={isSubmitting}
          decisionError={decisionError}
          onAction={onAction}
          onClarify={() => setIsClarifyOpen(true)}
        />
      )}

      <ClarifyModal
        isOpen={isClarifyOpen}
        onConfirm={handleClarifyConfirm}
        onCancel={() => setIsClarifyOpen(false)}
      />
    </div>
  )
}
