/**
 * PRReviewPanel — Quality Agent code review results panel.
 *
 * Displays the output of a Quality Agent review: an overall score, a summary
 * paragraph, and a categorized list of findings with severity badges.
 * Used alongside Code Tutor to give the user both a human-readable walkthrough
 * (tutor) and structured machine findings (agent) in the same session.
 */
import React, { useState, useCallback } from 'react'
import {
  Bot,
  AlertTriangle,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Shield,
  FileText,
} from 'lucide-react'
import './PRReviewPanel.css'

// Severity display metadata — maps backend Severity values to UI labels/colors
const SEVERITY_CONFIG = {
  critical: { label: 'Critical', icon: AlertCircle,   colorClass: 'severity-critical' },
  warning:  { label: 'Warning',  icon: AlertTriangle, colorClass: 'severity-warning' },
  info:     { label: 'Info',     icon: Info,          colorClass: 'severity-info' },
}

// Focus area display labels
const FOCUS_AREA_LABELS = {
  naming:       'Naming',
  complexity:   'Complexity',
  tests:        'Tests',
  architecture: 'Architecture',
  security:     'Security',
}

/**
 * A single collapsible finding card.
 *
 * @param {object} props
 * @param {object} props.finding - ReviewFinding from the backend
 */
function FindingCard({ finding }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const severityMeta = SEVERITY_CONFIG[finding.severity] || SEVERITY_CONFIG.info
  const SeverityIcon = severityMeta.icon

  return (
    <div className={`prp-finding-card ${severityMeta.colorClass}`}>
      <button
        className="prp-finding-header"
        onClick={() => setIsExpanded(wasExpanded => !wasExpanded)}
        aria-expanded={isExpanded}
      >
        <SeverityIcon size={14} className="prp-finding-severity-icon" />
        <span className="prp-finding-title">{finding.title}</span>
        <div className="prp-finding-meta">
          {finding.focusArea && (
            <span className="prp-finding-area">{FOCUS_AREA_LABELS[finding.focusArea] || finding.focusArea}</span>
          )}
          {finding.filePath && (
            <span className="prp-finding-file">{truncateFilePath(finding.filePath)}</span>
          )}
          {finding.line > 0 && (
            <span className="prp-finding-line">:{finding.line}</span>
          )}
        </div>
        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {isExpanded && (
        <div className="prp-finding-body">
          <p className="prp-finding-description">{finding.description}</p>
          {finding.suggestion && (
            <div className="prp-finding-suggestion">
              <span className="prp-suggestion-label">How to fix:</span>
              <p>{finding.suggestion}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Circular quality score indicator.
 * Score is 0–100; color transitions green→yellow→red as score decreases.
 *
 * @param {number} score
 */
function ScoreGauge({ score }) {
  const clampedScore = Math.max(0, Math.min(100, score))
  const scoreColor = clampedScore >= 80 ? '#10b981'
    : clampedScore >= 60 ? '#f59e0b'
    : '#ef4444'

  return (
    <div className="prp-score-gauge" style={{ '--score-color': scoreColor }}>
      <span className="prp-score-number">{clampedScore}</span>
      <span className="prp-score-label">/ 100</span>
    </div>
  )
}

/**
 * PRReviewPanel — the full review results UI.
 *
 * When no review has run yet, shows a prompt to submit the diff.
 * While reviewing, shows a loading state.
 * After review, shows the score, summary, and findings grouped by severity.
 *
 * @param {object} props
 * @param {object|null} props.reviewReport - ReviewReport from usePRReview hook
 * @param {boolean} props.isReviewing - True while the LLM is processing
 * @param {string|null} props.reviewError - Error message if review failed
 * @param {Function} props.onRunReview - Callback to start a new review
 * @param {Function} props.onClearReport - Callback to reset to idle state
 * @param {string} [props.projectPath] - Project path (displayed in header)
 */
const PRReviewPanel = ({
  reviewReport,
  isReviewing,
  reviewError,
  onRunReview,
  onClearReport,
  projectPath,
}) => {
  const [diffInput, setDiffInput] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')

  const handleRunReview = useCallback(() => {
    if (!diffInput.trim()) return
    onRunReview({
      projectPath: projectPath || '.',
      diff: diffInput,
      changedFiles: extractChangedFiles(diffInput),
    })
  }, [diffInput, projectPath, onRunReview])

  // Loading state
  if (isReviewing) {
    return (
      <div className="prp-container prp-loading">
        <Bot size={32} className="prp-loading-icon" />
        <p className="prp-loading-label">Quality Agent is reviewing the diff…</p>
        <p className="prp-loading-subtext">This may take up to a minute for large changes.</p>
        <div className="prp-loading-bar">
          <div className="prp-loading-bar-fill" />
        </div>
      </div>
    )
  }

  // Error state
  if (reviewError) {
    return (
      <div className="prp-container prp-error">
        <AlertCircle size={24} className="prp-error-icon" />
        <p className="prp-error-message">{reviewError}</p>
        <button className="prp-btn prp-btn-secondary" onClick={onClearReport}>
          <RotateCcw size={14} /> Try Again
        </button>
      </div>
    )
  }

  // Idle state — diff input form
  if (!reviewReport) {
    return (
      <div className="prp-container prp-idle">
        <div className="prp-idle-header">
          <Bot size={20} />
          <h3>Quality Agent Review</h3>
        </div>
        <p className="prp-idle-desc">
          Paste a git diff below to run an automated quality review. The agent will analyze
          naming, complexity, test coverage, architecture, and security.
        </p>
        <textarea
          className="prp-diff-input"
          placeholder="Paste git diff output here... (git diff main HEAD)"
          value={diffInput}
          onChange={(event) => setDiffInput(event.target.value)}
          rows={8}
        />
        <button
          className="prp-btn prp-btn-primary"
          onClick={handleRunReview}
          disabled={!diffInput.trim()}
        >
          <Bot size={14} /> Run Quality Review
        </button>
      </div>
    )
  }

  // Results state
  const findings = reviewReport.findings || []
  const countBySeverity = {
    critical: findings.filter(f => f.severity === 'critical').length,
    warning:  findings.filter(f => f.severity === 'warning').length,
    info:     findings.filter(f => f.severity === 'info').length,
  }

  const visibleFindings = activeFilter === 'all'
    ? findings
    : findings.filter(finding => finding.severity === activeFilter)

  return (
    <div className="prp-container prp-results">
      {/* Header row */}
      <div className="prp-results-header">
        <div className="prp-results-title">
          <Bot size={16} />
          <span>Quality Agent Report</span>
        </div>
        <button className="prp-btn prp-btn-ghost" onClick={onClearReport} title="Run a new review">
          <RotateCcw size={14} />
        </button>
      </div>

      {/* Score + summary */}
      <div className="prp-score-row">
        <ScoreGauge score={reviewReport.score} />
        <div className="prp-score-details">
          <div className="prp-severity-counts">
            <span className="prp-severity-chip severity-critical">
              <AlertCircle size={11} /> {countBySeverity.critical} critical
            </span>
            <span className="prp-severity-chip severity-warning">
              <AlertTriangle size={11} /> {countBySeverity.warning} warnings
            </span>
            <span className="prp-severity-chip severity-info">
              <Info size={11} /> {countBySeverity.info} info
            </span>
          </div>
          {reviewReport.modelUsed && (
            <span className="prp-model-used">Reviewed by {reviewReport.modelUsed}</span>
          )}
        </div>
      </div>

      {/* AI summary paragraph */}
      {reviewReport.summary && (
        <div className="prp-summary">
          <p>{reviewReport.summary}</p>
        </div>
      )}

      {/* Findings filter tabs */}
      {findings.length > 0 && (
        <>
          <div className="prp-filter-tabs">
            {['all', 'critical', 'warning', 'info'].map((filterLevel) => {
              const filterCount = filterLevel === 'all' ? findings.length : countBySeverity[filterLevel]
              return (
                <button
                  key={filterLevel}
                  className={`prp-filter-tab ${activeFilter === filterLevel ? 'active' : ''}`}
                  onClick={() => setActiveFilter(filterLevel)}
                >
                  {filterLevel.charAt(0).toUpperCase() + filterLevel.slice(1)}
                  {filterCount > 0 && <span className="prp-filter-count">{filterCount}</span>}
                </button>
              )
            })}
          </div>

          {/* Findings list */}
          <div className="prp-findings-list">
            {visibleFindings.length > 0 ? (
              visibleFindings.map((finding, findingIndex) => (
                <FindingCard key={findingIndex} finding={finding} />
              ))
            ) : (
              <p className="prp-no-findings">No {activeFilter} findings.</p>
            )}
          </div>
        </>
      )}

      {findings.length === 0 && (
        <div className="prp-no-findings-all">
          <Shield size={24} className="prp-clean-icon" />
          <p>No findings — the diff looks clean!</p>
        </div>
      )}
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Parse changed file paths from a unified diff string.
 * Looks for lines starting with "+++ b/" which indicate the new file side.
 */
function extractChangedFiles(diffText) {
  const filePaths = []
  const lines = diffText.split('\n')
  for (const line of lines) {
    if (line.startsWith('+++ b/')) {
      const filePath = line.slice(6).trim()
      if (filePath && filePath !== '/dev/null') {
        filePaths.push(filePath)
      }
    }
  }
  return [...new Set(filePaths)] // deduplicate
}

/**
 * Shorten a file path for display by keeping only the last 2 segments.
 * "internal/workflow/types.go" → "workflow/types.go"
 */
function truncateFilePath(filePath) {
  const parts = filePath.replace(/\\/g, '/').split('/')
  return parts.length > 2 ? parts.slice(-2).join('/') : filePath
}

export default PRReviewPanel
