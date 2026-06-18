// Collapsible bottom panel showing all 5 SDD pipeline phases with live status icons.
// Mounted inside div.terminal-pane as a flex child below terminal-pane-content.
// specs/004-sdd-pipeline-dashboard, US1.
import { useState } from 'react'
import './SddPipelinePanel.css'
import ActionPromptStrip from './ActionPromptStrip'

const COLLAPSED_KEY = 'sdd_panel_collapsed'

// Status icon for each PhaseDisplayStatus value (data-model.md / specs/005-sdd-phase-ux).
const STATUS_ICON = {
  pending:             '◌',
  active:              '⟳',
  'awaiting-decision': '⏳',
  complete:            '✓',
  rejected:            '⚠',
  iterating:           '↻',
}

// BEM modifier class for each PhaseDisplayStatus. Unknown statuses fall back to --unknown
// so the row is still styled (T007d) and the icon shows '?' to signal a future status value.
function rowClass(displayStatus) {
  const known = ['pending', 'active', 'awaiting-decision', 'complete', 'rejected', 'iterating']
  const suffix = known.includes(displayStatus) ? displayStatus : 'unknown'
  return `sdd-pipeline-panel__row sdd-pipeline-panel__row--${suffix}`
}

/**
 * SddPipelinePanel renders a collapsible bottom bar showing every phase's status.
 *
 * @param {{ phases: Array, isVisible: boolean, isCardOpen: boolean }} props
 *   phases — PhaseStatusEntry[] from the SDD_PHASE_STATUS WebSocket event.
 *   isVisible — false until a pipeline is bound (phases.length > 0).
 *   isCardOpen — true when a gate decision card is currently shown; passed through
 *     to ActionPromptStrip so it shows the correct gate-open prompt variant.
 */
export default function SddPipelinePanel({ phases, isVisible, isCardOpen }) {
  const [isCollapsed, setIsCollapsed] = useState(
    () => localStorage.getItem(COLLAPSED_KEY) === 'true'
  )

  if (!isVisible) return null

  // FR-010: compact idle indicator when no feature is bound (phases array is empty).
  if (phases.length === 0) {
    return (
      <div className="sdd-pipeline-panel sdd-pipeline-panel--idle">
        <div className="sdd-pipeline-panel__rows">
          <div className="sdd-pipeline-panel__row sdd-pipeline-panel__row--pending">
            <span className="sdd-pipeline-panel__icon">◌</span>
            <span className="sdd-pipeline-panel__phase-name">
              No active feature — run /speckit-specify to start
            </span>
          </div>
        </div>
      </div>
    )
  }

  const awaitingCount = phases.filter((p) => p.displayStatus === 'awaiting-decision').length

  function toggleCollapsed() {
    setIsCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(COLLAPSED_KEY, String(next))
      return next
    })
  }

  return (
    <div
      className={`sdd-pipeline-panel ${isCollapsed ? 'sdd-pipeline-panel--collapsed' : 'sdd-pipeline-panel--expanded'}`}
    >
      <div className="sdd-pipeline-panel__header">
        <button
          type="button"
          className="sdd-pipeline-panel__toggle"
          onClick={toggleCollapsed}
          aria-label={isCollapsed ? 'Expand SDD pipeline phases' : 'Collapse SDD pipeline phases'}
          title="Toggle SDD pipeline panel"
        >
          {isCollapsed ? '▶' : '▼'} SDD Phases
        </button>
        {isCollapsed && awaitingCount > 0 && (
          <span className="sdd-pipeline-panel__badge" data-testid="sdd-panel-badge">
            {awaitingCount}
          </span>
        )}
      </div>

      {!isCollapsed && (
        <div className="sdd-pipeline-panel__rows">
          {phases.map((entry) => (
            <div
              key={entry.phase}
              className={rowClass(entry.displayStatus)}
            >
              <span className="sdd-pipeline-panel__icon">
                {STATUS_ICON[entry.displayStatus] ?? '?'}
              </span>
              <span className="sdd-pipeline-panel__phase-name">{entry.phase}</span>
              {entry.runCount >= 2 && (
                <span className="sdd-pipeline-panel__run-count">×{entry.runCount}</span>
              )}
            </div>
          ))}
        </div>
      )}
      <ActionPromptStrip phases={phases} isCardOpen={isCardOpen} />
    </div>
  )
}
