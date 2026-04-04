import React, { useState, useEffect, useCallback } from 'react'
import { Shield, ChevronDown, ChevronUp, Settings, RefreshCw, CheckCircle, AlertTriangle, XCircle } from 'lucide-react'
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
 */
const EnterpriseWorkflowCard = ({ onExecuteCommand, onToast, cwd }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const workflow = useWorkflowSetup()

  const { status, compliance, checkStatus, scanCompliance } = workflow

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

  const handleRefresh = useCallback(() => {
    if (cwd) {
      checkStatus(cwd)
      if (status?.configured) {
        scanCompliance(cwd)
      }
    }
  }, [cwd, status?.configured, checkStatus, scanCompliance])

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

                {/* Action Buttons */}
                <div className="ewc-actions">
                  <button className="ewc-btn ewc-btn-primary" onClick={handleOpenWizard}>
                    <Settings size={14} /> Edit Workflow
                  </button>
                  <button className="ewc-btn ewc-btn-secondary" onClick={handleRefresh} title="Refresh compliance">
                    <RefreshCw size={14} />
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

export default EnterpriseWorkflowCard
