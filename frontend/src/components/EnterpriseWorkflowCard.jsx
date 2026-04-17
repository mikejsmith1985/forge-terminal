import React, { useState, useEffect, useCallback } from 'react'
import { Shield, ChevronDown, ChevronUp, Settings, RefreshCw, CheckCircle, AlertTriangle, XCircle, Copy, Eye, EyeOff } from 'lucide-react'
import { useWorkflowSetup } from '../hooks/useWorkflowSetup'
import WorkflowWizard from './WorkflowWizard'
import './EnterpriseWorkflowCard.css'

/**
 * EnterpriseWorkflowCard — Sidebar card for the Enterprise Workflow Architect.
 *
 * Shows the current workflow status (configured/unconfigured) with a compliance
 * badge. Clicking opens the full WorkflowWizard modal for setup or editing.
 *
 * @param {Object} props
 * @param {Function} props.onExecuteCommand - Send a command to the terminal
 * @param {Function} props.onToast - Show a toast notification
 * @param {string} props.cwd - Current working directory (project path)
 * @param {Function} props.onOpenTutor - Opens the Code Tutor panel (called when user clicks a notification toast)
 */
const EnterpriseWorkflowCard = ({ onExecuteCommand, onToast, cwd, onOpenTutor }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [showFindings, setShowFindings] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const workflow = useWorkflowSetup()

  const {
    status,
    compliance,
    checkStatus,
    scanCompliance,
    watcherNotifications,
    startWatcher,
    stopWatcher,
    clearWatcherNotifications,
  } = workflow

  // Auto-check status when cwd changes
  useEffect(() => {
    if (cwd) {
      checkStatus(cwd)
    }
  }, [cwd, checkStatus])

  // Auto-scan compliance when status shows configured
  useEffect(() => {
    if (status?.configured && cwd) {
      scanCompliance(cwd)
    }
  }, [status?.configured, cwd, scanCompliance])

  // Auto-start watcher when workflow is configured and Code Tutor module is active
  useEffect(() => {
    if (status?.configured && cwd) {
      startWatcher(cwd)
    }

    return () => {
      if (cwd) {
        stopWatcher(cwd)
      }
    }
  }, [status?.configured, cwd, startWatcher, stopWatcher])

  // Show toast notifications when the watcher detects file changes, then immediately
  // clear the queue so the same notifications aren't re-shown on the next render.
  // The "Open Tutor" action button lets the user jump directly into Code Tutor.
  useEffect(() => {
    if (watcherNotifications.length === 0) return

    watcherNotifications.forEach((notification) => {
      if (onToast) {
        onToast(
          `📚 Code Tutor: ${notification.message}`,
          'info',
          8000, // Extended duration — user needs time to read and decide whether to click
          {
            action: 'Open Tutor',
            onAction: onOpenTutor, // Opens the Code Tutor panel when clicked
          }
        )
      }
    })

    // Flush the queue atomically so these notifications aren't shown again
    clearWatcherNotifications()
  }, [watcherNotifications, onToast, onOpenTutor, clearWatcherNotifications])

  const handleRefresh = useCallback(async () => {
    if (!cwd || isRefreshing) return
    setIsRefreshing(true)
    try {
      // checkStatus returns the fresh status — use it directly instead of relying
      // on the stale closure value of status?.configured
      const freshStatus = await checkStatus(cwd)
      if (freshStatus?.configured) {
        await scanCompliance(cwd)
      }
    } finally {
      setIsRefreshing(false)
    }
  }, [cwd, isRefreshing, checkStatus, scanCompliance])

  const handleOpenWizard = useCallback(() => {
    setWizardOpen(true)
  }, [])

  const handleCloseWizard = useCallback(() => {
    setWizardOpen(false)
    // Refresh status after wizard closes (might have applied changes)
    if (cwd) {
      checkStatus(cwd)
    }
  }, [cwd, checkStatus])

  // Determine compliance badge
  const complianceBadge = getComplianceBadge(compliance)

  return (
    <>
      <div className={`enterprise-workflow-card ${status?.configured ? 'configured' : 'unconfigured'}`}>
        {/* Collapsed View */}
        <div className="ewc-header" onClick={() => setIsExpanded(!isExpanded)}>
          <div className="ewc-header-left">
            <Shield size={18} className="ewc-shield-icon" />
            <div className="ewc-header-info">
              <span className="ewc-title">Enterprise Workflow</span>
              <span className="ewc-subtitle">
                {status?.configured
                  ? `${status.moduleCount || 0} modules · ${status.qualityMode?.toUpperCase() || 'BEST'}`
                  : 'Not configured'
                }
              </span>
            </div>
          </div>
          <div className="ewc-header-right">
            {status?.configured && complianceBadge}
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>

        {/* Expanded View */}
        {isExpanded && (
          <div className="ewc-body">
            {status?.configured ? (
              <>
                {/* Compliance Summary */}
                {compliance && (
                  <div className="ewc-compliance-summary">
                    <div className="ewc-compliance-row">
                      <span className="ewc-compliance-label">Status</span>
                      <span className={`ewc-compliance-value ${compliance.status}`}>
                        {compliance.status === 'compliant' && '✓ Compliant'}
                        {compliance.status === 'warnings' && '⚠ Warnings'}
                        {compliance.status === 'violations' && '✗ Violations'}
                      </span>
                    </div>
                    {compliance.passing > 0 && (
                      <div className="ewc-compliance-row">
                        <span className="ewc-compliance-label">Passing</span>
                        <span className="ewc-compliance-value passing">{compliance.passing}</span>
                      </div>
                    )}
                    {compliance.warnings > 0 && (
                      <div className="ewc-compliance-row">
                        <span className="ewc-compliance-label">Warnings</span>
                        <span className="ewc-compliance-value warnings">{compliance.warnings}</span>
                      </div>
                    )}
                    {compliance.violations > 0 && (
                      <div className="ewc-compliance-row">
                        <span className="ewc-compliance-label">Violations</span>
                        <span className="ewc-compliance-value violations">{compliance.violations}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Findings Detail Toggle */}
                {compliance?.findings?.length > 0 && (
                  <>
                    <button
                      className="ewc-btn ewc-findings-toggle"
                      onClick={() => setShowFindings(!showFindings)}
                    >
                      {showFindings ? <EyeOff size={14} /> : <Eye size={14} />}
                      {showFindings ? 'Hide Details' : 'View Details'}
                    </button>

                    {showFindings && (
                      <FindingsDetailList
                        findings={compliance.findings}
                        onToast={onToast}
                        compliance={compliance}
                      />
                    )}
                  </>
                )}

                {/* Action Buttons */}
                <div className="ewc-actions">
                  <button className="ewc-btn ewc-btn-primary" onClick={handleOpenWizard}>
                    <Settings size={14} /> Edit Workflow
                  </button>
                  <button
                    className="ewc-btn ewc-btn-secondary"
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    title="Refresh compliance"
                  >
                    <RefreshCw size={14} className={isRefreshing ? 'ewc-spin' : ''} />
                  </button>
                </div>
              </>
            ) : (
              <div className="ewc-unconfigured-body">
                <p className="ewc-setup-message">
                  Set up an enterprise-grade workflow with copilot instructions,
                  skills, branching rules, and Code Tutor integration.
                </p>
                <button className="ewc-btn ewc-btn-setup" onClick={handleOpenWizard}>
                  <Shield size={14} /> Setup Workflow
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Wizard Modal */}
      <WorkflowWizard
        isOpen={wizardOpen}
        onClose={handleCloseWizard}
        projectPath={cwd}
        workflow={workflow}
        onToast={onToast}
      />
    </>
  )
}

/**
 * Returns a small badge element representing the compliance status.
 */
function getComplianceBadge(compliance) {
  if (!compliance) return null

  switch (compliance.status) {
    case 'compliant':
      return (
        <span className="ewc-badge ewc-badge-ok" title="All checks passing">
          <CheckCircle size={12} />
        </span>
      )
    case 'warnings':
      return (
        <span className="ewc-badge ewc-badge-warn" title={`${compliance.warnings} warnings`}>
          <AlertTriangle size={12} />
        </span>
      )
    case 'violations':
      return (
        <span className="ewc-badge ewc-badge-error" title={`${compliance.violations} violations`}>
          <XCircle size={12} />
        </span>
      )
    default:
      return null
  }
}

/* ─── Level Ordering & Icons ──────────────────────────────────────────────── */

const LEVEL_SORT_ORDER = { violation: 0, warning: 1, passing: 2 }
const MAX_VISIBLE_FINDINGS = 50

function getLevelIcon(level) {
  switch (level) {
    case 'warning':   return <span className="ewc-level-icon warning" title="Warning">⚠</span>
    case 'violation':  return <span className="ewc-level-icon violation" title="Violation">✗</span>
    case 'passing':    return <span className="ewc-level-icon passing" title="Passing">✓</span>
    default:           return null
  }
}

/**
 * Sort findings: warnings first, then violations, then passing.
 * Within each group, preserve original order.
 */
function sortFindingsByLevel(findings) {
  return [...findings].sort((findingA, findingB) => {
    const orderA = LEVEL_SORT_ORDER[findingA.level] ?? 99
    const orderB = LEVEL_SORT_ORDER[findingB.level] ?? 99
    return orderA - orderB
  })
}

/**
 * Build a plain-text compliance report suitable for clipboard.
 */
function buildComplianceReport(compliance) {
  const reportLines = [
    `Compliance Report — ${compliance.scannedAt || 'Unknown date'}`,
    `Status: ${compliance.status}`,
    `Total rules: ${compliance.totalRules}  |  Passing: ${compliance.passing}  |  Warnings: ${compliance.warnings}  |  Violations: ${compliance.violations}`,
    '',
    '--- Findings ---',
  ]

  const sortedFindings = sortFindingsByLevel(compliance.findings || [])
  for (const finding of sortedFindings) {
    const locationLabel = finding.filePath ? `${finding.filePath}:${finding.line}` : ''
    reportLines.push(
      `[${finding.level?.toUpperCase()}] ${finding.rule}`,
      `  ${locationLabel}`,
      `  ${finding.message}`,
      finding.suggestion ? `  ↳ ${finding.suggestion}` : '',
      ''
    )
  }

  return reportLines.join('\n')
}

/**
 * FindingsDetailList — Scrollable list of compliance findings with copy-to-clipboard.
 */
function FindingsDetailList({ findings, onToast, compliance }) {
  const sortedFindings = sortFindingsByLevel(findings)
  const visibleFindings = sortedFindings.slice(0, MAX_VISIBLE_FINDINGS)
  const remainingCount = sortedFindings.length - visibleFindings.length

  const handleCopyReport = useCallback(async () => {
    try {
      const reportText = buildComplianceReport(compliance)
      await navigator.clipboard.writeText(reportText)
      if (onToast) {
        onToast('Compliance report copied to clipboard', 'success')
      }
    } catch (clipboardError) {
      console.error('Failed to copy compliance report:', clipboardError)
      if (onToast) {
        onToast('Failed to copy report', 'error')
      }
    }
  }, [compliance, onToast])

  return (
    <div className="ewc-findings-section">
      <div className="ewc-findings-list">
        {visibleFindings.map((finding, findingIndex) => (
          <div key={`${finding.rule}-${finding.filePath}-${finding.line}-${findingIndex}`} className={`ewc-finding-item level-${finding.level}`}>
            <div className="ewc-finding-header">
              {getLevelIcon(finding.level)}
              <span className="ewc-finding-rule">{finding.rule}</span>
            </div>
            {finding.filePath && (
              <div className="ewc-finding-location">
                {finding.filePath}{finding.line != null ? `:${finding.line}` : ''}
              </div>
            )}
            <div className="ewc-finding-message">{finding.message}</div>
            {finding.suggestion && (
              <div className="ewc-finding-suggestion">↳ {finding.suggestion}</div>
            )}
          </div>
        ))}
        {remainingCount > 0 && (
          <div className="ewc-findings-more">
            and {remainingCount} more…
          </div>
        )}
      </div>
      <button className="ewc-btn ewc-copy-btn" onClick={handleCopyReport} title="Copy compliance report to clipboard">
        <Copy size={14} /> Copy Report
      </button>
    </div>
  )
}

export default EnterpriseWorkflowCard
