// Collapsible bottom panel showing all 5 SDD pipeline phases with live status icons.
// Mounted inside div.terminal-pane as a flex child below terminal-pane-content.
// specs/004-sdd-pipeline-dashboard, US1.
import { useState } from 'react'
import './SddPipelinePanel.css'

const COLLAPSED_KEY = 'sdd_panel_collapsed'

// Status icon for each PhaseDisplayStatus value (data-model.md).
const STATUS_ICON = {
  pending:            '·',
  active:             '◌',
  'awaiting-decision': '⏳',
  complete:           '✓',
  rejected:           '✗',
}

/**
 * SddPipelinePanel renders a collapsible bottom bar showing every phase's status.
 *
 * @param {{ phases: Array, isVisible: boolean }} props
 *   phases — PhaseStatusEntry[] from the SDD_PHASE_STATUS WebSocket event.
 *   isVisible — false until a pipeline is bound (phases.length > 0).
 */
export default function SddPipelinePanel({ phases, isVisible }) {
  const [isCollapsed, setIsCollapsed] = useState(
    () => localStorage.getItem(COLLAPSED_KEY) === 'true'
  )

  if (!isVisible) return null

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
              className={`sdd-pipeline-panel__row sdd-pipeline-panel__row--${entry.displayStatus}`}
            >
              <span className="sdd-pipeline-panel__icon">
                {STATUS_ICON[entry.displayStatus] ?? '·'}
              </span>
              <span className="sdd-pipeline-panel__phase-name">{entry.phase}</span>
              {entry.artifactPath && (
                <span className="sdd-pipeline-panel__artifact" title={entry.artifactPath}>
                  {entry.artifactPath}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
