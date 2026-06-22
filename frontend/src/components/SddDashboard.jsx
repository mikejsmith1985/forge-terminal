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

function DashboardHeader({ featureName, phases, binding }) {
  const badgeKey = derivePipelineBadge(phases)
  const { label, mod } = PIPELINE_BADGE[badgeKey]
  return (
    <div className="sdd-dashboard__header">
      <span className="sdd-dashboard__feature-name">
        {featureName || 'No active feature'}
      </span>
      <span className={`sdd-dashboard__badge sdd-dashboard__badge--${mod}`}>{label}</span>
      <WorktreeIndicator binding={binding} />
    </div>
  )
}

// WorktreeIndicator shows which isolated worktree/branch this tab runs in (specs/011,
// FR-007). It renders nothing when the tab is on the repository's main checkout, so the
// common single-pipeline case is visually unchanged (SC-007).
function WorktreeIndicator({ binding }) {
  if (!binding?.isolated || !binding.branch) return null
  return (
    <span
      className="sdd-dashboard__worktree"
      data-testid="sdd-worktree-indicator"
      title={binding.worktreePath ? `Isolated worktree: ${binding.worktreePath}` : 'Isolated worktree'}
    >
      ⑂ worktree: {binding.branch}
    </span>
  )
}

function PhaseCell({ entry, isSelected, onClick }) {
  const { phase, displayStatus, runCount } = entry
  const knownStatuses = Object.keys(STATUS_ICON)
  const statusMod = knownStatuses.includes(displayStatus) ? displayStatus : 'unknown'
  const icon = STATUS_ICON[displayStatus] ?? '?'
  const label = STATUS_LABEL[displayStatus] ?? displayStatus
  // awaiting-decision phases are clickable so the developer can demand-pull the
  // gate card when the WebSocket event was missed (e.g. after reconnection).
  const isClickable = displayStatus === 'complete' || displayStatus === 'awaiting-decision'
  const ariaLabel = displayStatus === 'awaiting-decision'
    ? `${phase} phase — awaiting decision, click to open gate card`
    : `${phase} phase — ${label}, click to view summary`

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
      aria-label={isClickable ? ariaLabel : undefined}
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
 * ReportCard renders the concise phase report shown at the gate (specs/010, US3):
 * a scope line, a grouped file list with +/- counts, and the command-emitted
 * decisions — replacing the wall of verbose Markdown. The full phase output is an
 * opt-in "View full output" action, never the default surface (FR-009).
 *
 * @param {{ reportCard: object, artifactPreview: object|null, onFileOpen: Function }} props
 */
function ReportCard({ reportCard, artifactPreview, onFileOpen }) {
  if (!reportCard) return null
  const { files = [], totalFiles = 0, filesTruncated = false, scope = '', decisions = [] } = reportCard
  const hiddenCount = Math.max(0, totalFiles - files.length)
  const fullOutputPath = artifactPreview?.filePath

  const formatStat = (file) =>
    file.added != null || file.removed != null
      ? `+${file.added ?? 0}/-${file.removed ?? 0}`
      : '±?' // magnitude unavailable (e.g. binary) — file still listed (FR-013)

  return (
    <div className="sdd-dashboard__report-card" data-testid="sdd-report-card">
      <p className="sdd-dashboard__report-scope">{scope}</p>

      {files.length > 0 && (
        <div className="sdd-dashboard__report-group">
          <span className="sdd-dashboard__report-group-label">Files</span>
          <ul className="sdd-dashboard__report-files">
            {files.map((file, index) => (
              <li key={`${file.path}-${index}`} className="sdd-dashboard__report-file">
                <FileText size={11} aria-hidden="true" />
                <span className="sdd-dashboard__report-file-path" title={file.path}>{baseName(file.path)}</span>
                <span className="sdd-dashboard__report-file-stat">{formatStat(file)}</span>
              </li>
            ))}
            {filesTruncated && hiddenCount > 0 && (
              <li className="sdd-dashboard__report-file sdd-dashboard__report-more">
                +{hiddenCount} more
              </li>
            )}
          </ul>
        </div>
      )}

      {decisions.length > 0 && (
        <div className="sdd-dashboard__report-group">
          <span className="sdd-dashboard__report-group-label">Decisions</span>
          <ul className="sdd-dashboard__report-decisions">
            {decisions.map((decision, index) => (
              <li key={index} className="sdd-dashboard__report-decision">{decision}</li>
            ))}
          </ul>
        </div>
      )}

      {fullOutputPath && (
        <button
          type="button"
          className="sdd-dashboard__report-full-output"
          onClick={() => onFileOpen({ path: fullOutputPath, name: baseName(fullOutputPath) })}
        >
          View full output →
        </button>
      )}
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

// ── HookInstallBanner ─────────────────────────────────────────────────────────

// The PowerShell command the user needs to run once to activate gate enforcement.
const hookInstallCommand = '.\\scripts\\install-sdd-hook.ps1'

/**
 * One-time dismissible banner shown when the SDD gate enforcement hook is absent.
 * Provides a copy-to-clipboard button so the user can run the install command immediately.
 */
function HookInstallBanner({ onDismiss }) {
  const [isCopied, setIsCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(hookInstallCommand).catch(() => {})
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2000)
  }, [])

  return (
    <div className="sdd-dashboard__hook-banner" role="alert" data-testid="hook-install-banner">
      <AlertTriangle className="sdd-dashboard__hook-banner-icon" size={14} aria-hidden="true" />
      <span className="sdd-dashboard__hook-banner-text">
        Gate enforcement inactive. Run{' '}
        <code className="sdd-dashboard__hook-banner-cmd">{hookInstallCommand}</code>
        {' '}to block the agent from skipping phases.
      </span>
      <button
        type="button"
        className="sdd-dashboard__hook-banner-btn sdd-dashboard__hook-banner-btn--copy"
        onClick={handleCopy}
      >
        {isCopied ? 'Copied!' : 'Copy command'}
      </button>
      <button
        type="button"
        className="sdd-dashboard__hook-banner-btn sdd-dashboard__hook-banner-btn--dismiss"
        onClick={onDismiss}
        aria-label="Dismiss hook install banner"
      >
        ✕
      </button>
    </div>
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
  binding = null,
  phaseSummaries,
  isCardOpen = false,
  card = null,
  decisionError = null,
  isSubmitting = false,
  // Default true: no banner on initial render before the status fetch resolves.
  isHookInstalled = true,
  onAction,
  onDismiss,
  onFileOpen,
  // Called when the developer clicks a phase in awaiting-decision state.
  // The parent wires this to useSddGate.fetchPendingGate so the gate card
  // is demand-pulled from the server without waiting for a new WS event.
  onAwaitingPhaseClick,
}) {
  const [selectedPhase, setSelectedPhase] = useState(null)
  const [isClarifyOpen, setIsClarifyOpen] = useState(false)
  // Session-only: dismissed banner stays gone until the page reloads.
  const [isHookBannerDismissed, setIsHookBannerDismissed] = useState(false)

  const handleCellClick = useCallback((phaseName) => {
    const phaseEntry = phases.find((p) => p.phase === phaseName)
    if (phaseEntry?.displayStatus === 'awaiting-decision') {
      // Demand-pull: fetch the pending gate card from the server rather than
      // toggling the detail strip, which has no content for a pending gate.
      onAwaitingPhaseClick?.()
      return
    }
    setSelectedPhase((prev) => (prev === phaseName ? null : phaseName))
  }, [phases, onAwaitingPhaseClick])

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
      {!isHookInstalled && !isHookBannerDismissed && (
        <HookInstallBanner onDismiss={() => setIsHookBannerDismissed(true)} />
      )}
      <DashboardHeader featureName={featureName} phases={phases} binding={binding} />

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

      {isCardOpen && card?.reportCard && (
        <ReportCard
          reportCard={card.reportCard}
          artifactPreview={card.artifactPreview}
          onFileOpen={onFileOpen}
        />
      )}

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
