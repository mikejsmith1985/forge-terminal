import React, { useState, useEffect, useCallback } from 'react'
import { Shield, ChevronDown, ChevronUp, Settings, RefreshCw, CheckCircle, AlertTriangle, XCircle, Copy, Eye, EyeOff, Info, Globe } from 'lucide-react'
import { useWorkflowSetup } from '../hooks/useWorkflowSetup'
import WorkflowWizard from './WorkflowWizard'
import './ForgeWorkflowCard.css'

/**
 * ForgeWorkflowCard — Sidebar card for the Forge Workflow Architect.
 *
 * Shows the current workflow status (configured/unconfigured) with a compliance
 * badge. Clicking opens the full WorkflowWizard modal for setup or editing.
 *
 * @param {Object} props
 * @param {Function} props.onExecuteCommand - Send a command to the terminal
 * @param {Function} props.onToast - Show a toast notification
 * @param {string} props.cwd - Current working directory (project path)
 */
const ForgeWorkflowCard = ({ onExecuteCommand, onToast, cwd }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [showFindings, setShowFindings] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  // Drives the styled in-app confirmation for the global install, replacing the
  // jarring native window.confirm browser dialog.
  const [isConfirmingGlobalInstall, setIsConfirmingGlobalInstall] = useState(false)
  const workflow = useWorkflowSetup()

  const {
    status,
    compliance,
    checkStatus,
    scanCompliance,
    installGlobalConstitution,
    isInstallingGlobal,
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


  const handleRefresh= useCallback(async () => {
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

  // Installing the constitution writes outside the current project (~/.claude,
  // ~/.copilot, ~/.gemini), so we confirm first — but with a styled in-app panel,
  // not a native window.confirm popup. requestGlobalInstall opens that panel.
  const requestGlobalInstall = useCallback(() => {
    setIsConfirmingGlobalInstall(true)
  }, [])

  const cancelGlobalInstall = useCallback(() => {
    setIsConfirmingGlobalInstall(false)
  }, [])

  // Run the global install after the user confirms in the styled panel, then
  // report the outcome via a toast (success or failure).
  const confirmGlobalInstall = useCallback(async () => {
    setIsConfirmingGlobalInstall(false)
    const result = await installGlobalConstitution()
    if (result) {
      onToast?.(`Constitution installed to ${result.targetsWritten?.length || 0} CLI tool(s)`, 'success')
    } else {
      onToast?.('Global constitution install failed', 'error')
    }
  }, [installGlobalConstitution, onToast])

  // Determine compliance badge
  const complianceBadge = getComplianceBadge(compliance)

  return (
    <>
      <div className={`forge-workflow-card ${status?.configured ? 'configured' : 'unconfigured'}`}>
        {/* Collapsed View */}
        <div className="fwc-header" onClick={() => setIsExpanded(!isExpanded)}>
          <div className="fwc-header-left">
            <Shield size={18} className="fwc-shield-icon" />
            <div className="fwc-header-info">
              <span className="fwc-title">Forge Workflow</span>
              <span className="fwc-subtitle">
                {status?.configured
                  ? `${status.moduleCount || 0} modules · ${status.qualityMode?.toUpperCase() || 'BEST'}`
                  : 'Not configured'
                }
              </span>
            </div>
          </div>
          <div className="fwc-header-right">
            {status?.configured && complianceBadge}
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>

        {/* Expanded View */}
        {isExpanded && (
          <div className="fwc-body">
            {/* Global action — independent of the current project. Installs the
                constitution into every CLI tool's machine-wide instructions. */}
            <button
              className="fwc-btn fwc-btn-global"
              onClick={requestGlobalInstall}
              disabled={isInstallingGlobal || isConfirmingGlobalInstall}
              title="Write the Forge constitution into ~/.claude, ~/.copilot and ~/.gemini"
            >
              <Globe size={14} className={isInstallingGlobal ? 'fwc-spin' : ''} />
              {isInstallingGlobal ? 'Installing…' : 'Install Constitution Globally'}
            </button>

            {/* Styled in-app confirmation — replaces the native window.confirm dialog. */}
            {isConfirmingGlobalInstall && (
              <div className="fwc-confirm" role="alertdialog" aria-label="Confirm global constitution install">
                <p className="fwc-confirm-message">
                  Install the Forge constitution globally? This writes it into your global CLI
                  instruction files (<code>~/.claude</code>, <code>~/.copilot</code>, <code>~/.gemini</code>)
                  inside a managed marker block — your own instructions outside that block are preserved.
                </p>
                <div className="fwc-confirm-actions">
                  <button className="fwc-btn fwc-btn-primary" onClick={confirmGlobalInstall}>
                    Install
                  </button>
                  <button className="fwc-btn fwc-btn-secondary" onClick={cancelGlobalInstall}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {status?.configured ? (
              <>
                {/* Compliance Summary */}
                {compliance && (
                  <div className="fwc-compliance-summary">
                    <div className="fwc-compliance-row">
                      <span className="fwc-compliance-label">Status</span>
                      <span className={`fwc-compliance-value ${compliance.status}`}>
                        {compliance.status === 'compliant' && '✓ Compliant'}
                        {compliance.status === 'warnings' && '⚠ Warnings'}
                        {compliance.status === 'violations' && '✗ Violations'}
                      </span>
                    </div>
                    {compliance.passing > 0 && (
                      <div className="fwc-compliance-row">
                        <span className="fwc-compliance-label">Passing</span>
                        <span className="fwc-compliance-value passing">{compliance.passing}</span>
                      </div>
                    )}
                    {compliance.warnings > 0 && (
                      <div className="fwc-compliance-row">
                        <span className="fwc-compliance-label">Warnings</span>
                        <span className="fwc-compliance-value warnings">{compliance.warnings}</span>
                      </div>
                    )}
                    {compliance.violations > 0 && (
                      <div className="fwc-compliance-row">
                        <span className="fwc-compliance-label">Violations</span>
                        <span className="fwc-compliance-value violations">{compliance.violations}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Findings Detail Toggle */}
                {compliance?.findings?.length > 0 && (
                  <>
                    <button
                      className="fwc-btn fwc-findings-toggle"
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
                <div className="fwc-actions">
                  <button className="fwc-btn fwc-btn-primary" onClick={handleOpenWizard}>
                    <Settings size={14} /> Edit Workflow
                  </button>
                  <button
                    className="fwc-btn fwc-btn-secondary"
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    title="Refresh compliance"
                  >
                    <RefreshCw size={14} className={isRefreshing ? 'fwc-spin' : ''} />
                  </button>
                </div>

                {/* AI compliance notice — always visible when card is expanded */}
                <AiComplianceNotice />
              </>
            ) : (
              <div className="fwc-unconfigured-body">
                <p className="fwc-setup-message">
                  Set up an enterprise-grade workflow with copilot instructions,
                  skills and branching rules. // Code Tutor integration removed
                </p>
                <button className="fwc-btn fwc-btn-setup" onClick={handleOpenWizard}>
                  <Shield size={14} /> Setup Workflow
                </button>
                <AiComplianceNotice />
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
 * AiComplianceNotice — Small persistent callout shown at the bottom of the
 * Forge Workflow card. Sets honest expectations about AI compliance:
 * workflow rules are strong guidance, not hard enforcement, because of how
 * large language models prioritize context. Framed as a known industry
 * characteristic, not a product limitation.
 */
function AiComplianceNotice() {
  return (
    <div className="fwc-ai-notice">
      <Info size={12} className="fwc-ai-notice-icon" />
      <p className="fwc-ai-notice-text">
        Workflow rules guide AI behavior — they are not hard enforced like a linter.
        Compliance is high in most sessions but may vary in long or complex ones.
        This reflects how large language models work today.{' '}
        <span className="fwc-ai-notice-emphasis">We are continually improving as AI capabilities advance.</span>
      </p>
    </div>
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
        <span className="fwc-badge fwc-badge-ok" title="All checks passing">
          <CheckCircle size={12} />
        </span>
      )
    case 'warnings':
      return (
        <span className="fwc-badge fwc-badge-warn" title={`${compliance.warnings} warnings`}>
          <AlertTriangle size={12} />
        </span>
      )
    case 'violations':
      return (
        <span className="fwc-badge fwc-badge-error" title={`${compliance.violations} violations`}>
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
    case 'warning':   return <span className="fwc-level-icon warning" title="Warning">⚠</span>
    case 'violation':  return <span className="fwc-level-icon violation" title="Violation">✗</span>
    case 'passing':    return <span className="fwc-level-icon passing" title="Passing">✓</span>
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
    <div className="fwc-findings-section">
      <div className="fwc-findings-list">
        {visibleFindings.map((finding, findingIndex) => (
          <div key={`${finding.rule}-${finding.filePath}-${finding.line}-${findingIndex}`} className={`fwc-finding-item level-${finding.level}`}>
            <div className="fwc-finding-header">
              {getLevelIcon(finding.level)}
              <span className="fwc-finding-rule">{finding.rule}</span>
            </div>
            {finding.filePath && (
              <div className="fwc-finding-location">
                {finding.filePath}{finding.line != null ? `:${finding.line}` : ''}
              </div>
            )}
            <div className="fwc-finding-message">{finding.message}</div>
            {finding.suggestion && (
              <div className="fwc-finding-suggestion">↳ {finding.suggestion}</div>
            )}
          </div>
        ))}
        {remainingCount > 0 && (
          <div className="fwc-findings-more">
            and {remainingCount} more…
          </div>
        )}
      </div>
      <button className="fwc-btn fwc-copy-btn" onClick={handleCopyReport} title="Copy compliance report to clipboard">
        <Copy size={14} /> Copy Report
      </button>
    </div>
  )
}

export default ForgeWorkflowCard
