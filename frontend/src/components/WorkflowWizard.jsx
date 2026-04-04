import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Layers,
  Settings,
  Eye,
  Rocket,
  Check,
  X,
  Save,
  FileText,
  FilePlus,
  FileWarning,
  SkipForward,
  Shield,
  Zap,
  BookOpen,
  GitBranch,
  TestTube,
  FileCheck,
  ScrollText,
  Users,
  AlertTriangle,
  GitPullRequest,
  Bot,
  User,
  Sliders,
  ArrowRight,
  MousePointerClick,
} from 'lucide-react'
import './WorkflowWizard.css'

// Module metadata for the UI (icons, descriptions)
const MODULE_DISPLAY_INFO = {
  'copilot-instructions': {
    icon: FileText,
    color: '#3b82f6',
    shortDescription: 'Agent behavior rules, naming standards, quality mode',
  },
  'branching-strategy': {
    icon: GitBranch,
    color: '#8b5cf6',
    shortDescription: 'GitHub Flow — feature branches, PR required for main',
  },
  'code-quality': {
    icon: Shield,
    color: '#10b981',
    shortDescription: 'Human-readable naming, comment standards, readability',
  },
  'testing-standards': {
    icon: TestTube,
    color: '#f59e0b',
    shortDescription: 'TDD workflow, test layers, coverage expectations',
  },
  'pr-workflow': {
    icon: FileCheck,
    color: '#ef4444',
    shortDescription: 'PR template, checklist, merge rules, CHANGELOG gate',
  },
  'documentation': {
    icon: ScrollText,
    color: '#06b6d4',
    shortDescription: 'Living CHANGELOG, no doc sprawl, README discipline',
  },
  'code-tutor': {
    icon: BookOpen,
    color: '#ec4899',
    shortDescription: 'Auto-notify on changes, multi-depth explanations',
  },
  'multi-agent': {
    icon: Users,
    color: '#f97316',
    shortDescription: 'BEST mode orchestration, sub-agents, model routing',
  },
  'copilot-agent-setup': {
    icon: Bot,
    color: '#7c3aed',
    shortDescription: 'Pre-install dependencies for the Copilot coding agent environment',
  },
}

const WIZARD_STEPS = [
  { id: 'detect',    label: 'Detect',    icon: Search,         description: 'Scan project' },
  { id: 'preset',    label: 'Preset',    icon: Layers,         description: 'Choose template' },
  { id: 'configure', label: 'Configure', icon: Settings,       description: 'Select modules' },
  { id: 'pr-review', label: 'PR Review', icon: GitPullRequest, description: 'Review strategy' },
  { id: 'apply',     label: 'Apply',     icon: Rocket,         description: 'Preview & deploy' },
]

/**
 * WorkflowWizard — A 4-step modal wizard for configuring and applying
 * enterprise workflow settings to a project.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the wizard modal is visible
 * @param {Function} props.onClose - Callback to close the wizard
 * @param {string} props.projectPath - Absolute path to the target project
 * @param {Object} props.workflow - The useWorkflowSetup hook instance
 * @param {Function} props.onToast - Callback to show a toast notification
 */
const WorkflowWizard = ({ isOpen, onClose, projectPath, workflow, onToast }) => {
  const [currentStep, setCurrentStep] = useState(0)
  const [savePresetName, setSavePresetName] = useState('')
  const [showSavePreset, setShowSavePreset] = useState(false)

  const {
    detection,
    presets,
    selectedPreset,
    config,
    preview,
    applyResult,
    modules: moduleCatalog,
    isDetecting,
    isPreviewing,
    isApplying,
    error,
    detect,
    loadPresets,
    loadModules,
    selectPreset,
    savePreset,
    deletePreset,
    updateConfig,
    toggleModule,
    setQualityMode,
    generatePreview,
    applyWorkflow,
    clearError,
    reset,
  } = workflow

  // On open, auto-detect and load presets
  useEffect(() => {
    if (isOpen && projectPath) {
      detect(projectPath)
      loadPresets()
      loadModules()
    }
  }, [isOpen, projectPath, detect, loadPresets, loadModules])

  // Set project name from detection
  useEffect(() => {
    if (detection?.projectName && !config.projectName) {
      updateConfig({ projectName: detection.projectName })
    }
  }, [detection, config.projectName, updateConfig])

  // Auto-generate preview when entering the apply step (step index 4)
  useEffect(() => {
    if (currentStep === 4 && projectPath && !preview && !isPreviewing) {
      generatePreview(projectPath)
    }
  }, [currentStep, projectPath, preview, isPreviewing, generatePreview])

  const handleClose = useCallback(() => {
    setCurrentStep(0)
    reset()
    onClose()
  }, [reset, onClose])

  const handleNext = useCallback(() => {
    setCurrentStep(previousStep => Math.min(previousStep + 1, WIZARD_STEPS.length - 1))
  }, [])
  const handleBack = useCallback(() => {
    setCurrentStep(previousStep => Math.max(previousStep - 1, 0))
  }, [])

  const handleApply = useCallback(async () => {
    const result = await applyWorkflow(projectPath)
    if (result && onToast) {
      const createdCount = result.filesCreated?.length || 0
      const updatedCount = result.filesUpdated?.length || 0
      onToast(`Workflow applied: ${createdCount} created, ${updatedCount} updated`, 'success')
    }
  }, [applyWorkflow, projectPath, onToast])

  const handleSavePreset = useCallback(async () => {
    if (!savePresetName.trim()) return
    await savePreset(savePresetName.trim())
    setSavePresetName('')
    setShowSavePreset(false)
    if (onToast) onToast(`Preset "${savePresetName}" saved`, 'success')
  }, [savePresetName, savePreset, onToast])

  // Count of enabled modules
  const enabledModuleCount = useMemo(() => {
    return (config.enabledModules || []).length
  }, [config.enabledModules])

  if (!isOpen) return null

  return (
    <div className="workflow-wizard-overlay" onClick={handleClose}>
      <div className="workflow-wizard-modal" onClick={(event) => event.stopPropagation()}>
        {/* Header */}
        <div className="ww-header">
          <div className="ww-header-title">
            <Shield size={20} />
            <span>Enterprise Workflow Architect</span>
          </div>
          <button className="ww-close-btn" onClick={handleClose} title="Close">
            <X size={18} />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="ww-steps">
          {WIZARD_STEPS.map((step, stepIndex) => {
            const StepIcon = step.icon
            const isActive = stepIndex === currentStep
            const isCompleted = stepIndex < currentStep
            return (
              <div
                key={step.id}
                className={`ww-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
                onClick={() => stepIndex < currentStep && setCurrentStep(stepIndex)}
              >
                <div className="ww-step-icon">
                  {isCompleted ? <Check size={14} /> : <StepIcon size={14} />}
                </div>
                <div className="ww-step-label">{step.label}</div>
              </div>
            )
          })}
        </div>

        {/* Error Banner */}
        {error && (
          <div className="ww-error-banner">
            <AlertTriangle size={14} />
            <span>{error}</span>
            <button onClick={clearError}><X size={12} /></button>
          </div>
        )}

        {/* Step Content */}
        <div className="ww-content">
          {currentStep === 0 && (
            <StepDetect
              detection={detection}
              isDetecting={isDetecting}
              projectPath={projectPath}
            />
          )}
          {currentStep === 1 && (
            <StepPreset
              presets={presets}
              selectedPreset={selectedPreset}
              onSelect={selectPreset}
              onDelete={deletePreset}
            />
          )}
          {currentStep === 2 && (
            <StepConfigure
              config={config}
              moduleCatalog={moduleCatalog}
              onToggleModule={toggleModule}
              onSetQualityMode={setQualityMode}
              onUpdateConfig={updateConfig}
            />
          )}
          {currentStep === 3 && (
            <StepPRReview
              config={config}
              onUpdateConfig={updateConfig}
            />
          )}
          {currentStep === 4 && (
            <StepReview
              preview={preview}
              applyResult={applyResult}
              isPreviewing={isPreviewing}
              isApplying={isApplying}
              config={config}
              enabledModuleCount={enabledModuleCount}
              showSavePreset={showSavePreset}
              savePresetName={savePresetName}
              onToggleSavePreset={() => setShowSavePreset(!showSavePreset)}
              onSavePresetNameChange={setSavePresetName}
              onSavePreset={handleSavePreset}
            />
          )}
        </div>

        {/* Footer Navigation */}
        <div className="ww-footer">
          <button
            className="ww-btn ww-btn-secondary"
            onClick={currentStep === 0 ? handleClose : handleBack}
          >
            {currentStep === 0 ? 'Cancel' : <><ChevronLeft size={14} /> Back</>}
          </button>

          {currentStep < 4 ? (
            <button
              className="ww-btn ww-btn-primary"
              onClick={handleNext}
              disabled={currentStep === 0 && isDetecting}
            >
              Next <ChevronRight size={14} />
            </button>
          ) : (
            <button
              className="ww-btn ww-btn-apply"
              onClick={handleApply}
              disabled={isApplying || !!applyResult}
            >
              {isApplying ? (
                <><span className="ww-spinner" /> Applying...</>
              ) : applyResult ? (
                <><Check size={14} /> Applied!</>
              ) : (
                <><Rocket size={14} /> Apply Workflow</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Step 1: Detect ──────────────────────────────────────────────────────────

function StepDetect({ detection, isDetecting, projectPath }) {
  if (isDetecting) {
    return (
      <div className="ww-step-content ww-centered">
        <div className="ww-spinner-large" />
        <p className="ww-detecting-label">Scanning project structure...</p>
        <p className="ww-path-display">{projectPath}</p>
      </div>
    )
  }

  if (!detection) {
    return (
      <div className="ww-step-content ww-centered">
        <Search size={32} className="ww-muted-icon" />
        <p>No project detected. Enter a project path to begin.</p>
      </div>
    )
  }

  return (
    <div className="ww-step-content">
      <h3 className="ww-section-title">Project Analysis</h3>

      <div className="ww-detection-grid">
        <div className="ww-detection-item">
          <span className="ww-detection-label">Project</span>
          <span className="ww-detection-value">{detection.projectName}</span>
        </div>
        <div className="ww-detection-item">
          <span className="ww-detection-label">Type</span>
          <span className="ww-detection-value ww-badge">{detection.projectType || 'Unknown'}</span>
        </div>
        <div className="ww-detection-item">
          <span className="ww-detection-label">Git</span>
          <span className={`ww-detection-value ${detection.hasGit ? 'ww-ok' : 'ww-warn'}`}>
            {detection.hasGit ? '✓ Initialized' : '✗ Not initialized'}
          </span>
        </div>
        <div className="ww-detection-item">
          <span className="ww-detection-label">.github/</span>
          <span className={`ww-detection-value ${detection.hasGitHub ? 'ww-ok' : 'ww-neutral'}`}>
            {detection.hasGitHub ? '✓ Exists' : '○ Will create'}
          </span>
        </div>
      </div>

      {detection.existingFiles && detection.existingFiles.length > 0 && (
        <div className="ww-existing-files">
          <h4>Existing Workflow Files</h4>
          <ul>
            {detection.existingFiles.map((filePath) => (
              <li key={filePath}>{filePath}</li>
            ))}
          </ul>
        </div>
      )}

      {detection.recommendations && detection.recommendations.length > 0 && (
        <div className="ww-recommendations">
          <h4>Recommendations</h4>
          <ul>
            {detection.recommendations.map((recommendation, recommendationIndex) => (
              <li key={recommendationIndex}>{recommendation}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── Step 2: Preset ──────────────────────────────────────────────────────────

function StepPreset({ presets, selectedPreset, onSelect, onDelete }) {
  return (
    <div className="ww-step-content">
      <h3 className="ww-section-title">Choose a Workflow Preset</h3>
      <p className="ww-section-desc">
        Start from a preset or skip to configure modules individually.
      </p>

      <div className="ww-preset-list">
        {presets.map((preset) => {
          const isSelected = selectedPreset?.id === preset.id
          return (
            <div
              key={preset.id}
              className={`ww-preset-card ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelect(preset)}
            >
              <div className="ww-preset-header">
                <span className="ww-preset-name">{preset.name}</span>
                {preset.builtIn && <span className="ww-badge ww-badge-builtin">Built-in</span>}
                {isSelected && <Check size={16} className="ww-preset-check" />}
              </div>
              {preset.description && (
                <p className="ww-preset-desc">{preset.description}</p>
              )}
              {!preset.builtIn && (
                <button
                  className="ww-preset-delete"
                  onClick={(event) => { event.stopPropagation(); onDelete(preset.id) }}
                  title="Delete preset"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {presets.length === 0 && (
        <p className="ww-muted-text">No presets available. Configure modules in the next step.</p>
      )}
    </div>
  )
}

// ─── Step 3: Configure ───────────────────────────────────────────────────────

function StepConfigure({ config, moduleCatalog, onToggleModule, onSetQualityMode, onUpdateConfig }) {
  const enabledModules = config.enabledModules || []

  return (
    <div className="ww-step-content">
      {/* Quality Mode Toggle */}
      <div className="ww-quality-section">
        <h3 className="ww-section-title">Quality Mode</h3>
        <div className="ww-quality-toggle">
          <button
            className={`ww-quality-btn ${config.qualityMode === 'best' ? 'active best' : ''}`}
            onClick={() => onSetQualityMode('best')}
          >
            <Shield size={16} />
            <div>
              <strong>BEST</strong>
              <span>Multi-agent, thorough, Code Tutor</span>
            </div>
          </button>
          <button
            className={`ww-quality-btn ${config.qualityMode === 'fast' ? 'active fast' : ''}`}
            onClick={() => onSetQualityMode('fast')}
          >
            <Zap size={16} />
            <div>
              <strong>FAST</strong>
              <span>Single-agent, lightweight</span>
            </div>
          </button>
        </div>
      </div>

      {/* Module Toggles */}
      <h3 className="ww-section-title">Workflow Modules</h3>
      <p className="ww-section-desc">
        Toggle modules to include in your workflow. Each generates copilot skills and enforcement rules.
      </p>

      <div className="ww-modules-grid">
        {(moduleCatalog.length > 0 ? moduleCatalog : Object.keys(MODULE_DISPLAY_INFO)).map((moduleItem) => {
          const moduleId = typeof moduleItem === 'string' ? moduleItem : moduleItem.id
          const displayInfo = MODULE_DISPLAY_INFO[moduleId] || {}
          const catalogInfo = typeof moduleItem === 'object' ? moduleItem : {}
          const ModuleIcon = displayInfo.icon || FileText
          const isEnabled = enabledModules.includes(moduleId)
          const moduleDescription = catalogInfo.description || displayInfo.shortDescription || ''

          return (
            <div
              key={moduleId}
              className={`ww-module-toggle ${isEnabled ? 'enabled' : 'disabled'}`}
              onClick={() => onToggleModule(moduleId)}
            >
              <div className="ww-module-icon" style={{ color: displayInfo.color || 'var(--accent)' }}>
                <ModuleIcon size={18} />
              </div>
              <div className="ww-module-info">
                <span className="ww-module-name">{catalogInfo.name || moduleId}</span>
                <span className="ww-module-desc">{moduleDescription}</span>
              </div>
              <div className={`ww-toggle-switch ${isEnabled ? 'on' : 'off'}`}>
                <div className="ww-toggle-knob" />
              </div>
            </div>
          )
        })}
      </div>

      {/* Conflict Strategy */}
      <div className="ww-conflict-section">
        <h4>Existing File Handling</h4>
        <select
          value={config.conflictStrategy || 'skip'}
          onChange={(event) => onUpdateConfig({ conflictStrategy: event.target.value })}
          className="ww-select"
        >
          <option value="skip">Skip — keep existing files</option>
          <option value="overwrite">Overwrite — replace with generated</option>
          <option value="merge">Merge — append where possible</option>
        </select>
      </div>
    </div>
  )
}

// ─── Step 4: PR Review Strategy ─────────────────────────────────────────────

/**
 * StepPRReview lets the user choose how pull requests will be reviewed.
 *
 * Four strategies are available:
 * - manual: user inspects diffs themselves
 * - tutor: Code Tutor explains each changed file with streaming walkthroughs
 * - agent: Quality Agent posts structured findings (naming, tests, architecture)
 * - tutor-and-agent: both run in parallel (recommended for enterprise)
 */
function StepPRReview({ config, onUpdateConfig }) {
  // Which strategy cards are currently shown as selected
  const selectedStrategy = config.prReviewStrategy || 'tutor-and-agent'

  const reviewStrategies = [
    {
      id: 'manual',
      label: 'Manual Review',
      icon: User,
      color: '#6b7280',
      description: 'Review diffs yourself. No AI assistance.',
    },
    {
      id: 'tutor',
      label: 'Code Tutor',
      icon: BookOpen,
      color: '#3b82f6',
      description: 'Code Tutor auto-explains each changed file with toast notifications and streaming walkthroughs.',
    },
    {
      id: 'agent',
      label: 'Quality Agent',
      icon: Bot,
      color: '#10b981',
      description: 'A dedicated AI reviewer analyzes the diff and posts structured findings: naming, complexity, tests, architecture, security.',
    },
    {
      id: 'tutor-and-agent',
      label: 'Tutor + Agent',
      icon: Users,
      color: '#8b5cf6',
      description: 'Best of both: Code Tutor explains changes to you while the Quality Agent performs an automated review in parallel. Recommended.',
      isRecommended: true,
    },
  ]

  const agentFocusOptions = [
    { id: 'naming',       label: 'Naming Conventions' },
    { id: 'complexity',   label: 'Complexity' },
    { id: 'tests',        label: 'Test Coverage' },
    { id: 'architecture', label: 'Architecture' },
    { id: 'security',     label: 'Security' },
  ]

  const selectedFocusAreas = config.prReviewAgentFocusAreas || ['naming', 'complexity', 'tests', 'architecture', 'security']

  const handleToggleFocusArea = useCallback((areaId) => {
    const isCurrentlySelected = selectedFocusAreas.includes(areaId)
    const updatedAreas = isCurrentlySelected
      ? selectedFocusAreas.filter(existingId => existingId !== areaId)
      : [...selectedFocusAreas, areaId]
    onUpdateConfig({ prReviewAgentFocusAreas: updatedAreas })
  }, [selectedFocusAreas, onUpdateConfig])

  const hasAgentComponent = selectedStrategy === 'agent' || selectedStrategy === 'tutor-and-agent'

  return (
    <div className="ww-step-content">
      <h3 className="ww-section-title">PR Review Strategy</h3>
      <p className="ww-section-desc">
        Choose how pull requests are reviewed in this project. This setting is saved to your workflow configuration.
      </p>

      {/* Strategy Cards */}
      <div className="ww-pr-strategy-grid">
        {reviewStrategies.map((strategy) => {
          const StrategyIcon = strategy.icon
          const isSelected = selectedStrategy === strategy.id
          return (
            <div
              key={strategy.id}
              className={`ww-pr-strategy-card ${isSelected ? 'selected' : ''}`}
              onClick={() => onUpdateConfig({ prReviewStrategy: strategy.id })}
              style={{ '--strategy-color': strategy.color }}
            >
              {strategy.isRecommended && (
                <span className="ww-pr-recommended-badge">Recommended</span>
              )}
              <div className="ww-pr-strategy-icon" style={{ color: strategy.color }}>
                <StrategyIcon size={22} />
              </div>
              <div className="ww-pr-strategy-info">
                <span className="ww-pr-strategy-name">{strategy.label}</span>
                <span className="ww-pr-strategy-desc">{strategy.description}</span>
              </div>
              {isSelected && <Check size={16} className="ww-pr-strategy-check" />}
            </div>
          )
        })}
      </div>

      {/* Auto-trigger toggle */}
      <div className="ww-pr-option-row">
        <div className="ww-pr-option-info">
          <span className="ww-pr-option-label">Auto-trigger on PR create/update</span>
          <span className="ww-pr-option-desc">Automatically run the review when a PR is opened or updated</span>
        </div>
        <div
          className={`ww-toggle-switch ${config.prReviewAutoTrigger ? 'on' : 'off'}`}
          onClick={() => onUpdateConfig({ prReviewAutoTrigger: !config.prReviewAutoTrigger })}
        >
          <div className="ww-toggle-knob" />
        </div>
      </div>

      {/* Require changelog toggle */}
      <div className="ww-pr-option-row">
        <div className="ww-pr-option-info">
          <span className="ww-pr-option-label">Require CHANGELOG update</span>
          <span className="ww-pr-option-desc">Block PR if CHANGELOG.md was not updated alongside source changes</span>
        </div>
        <div
          className={`ww-toggle-switch ${config.prReviewRequireChangelog ? 'on' : 'off'}`}
          onClick={() => onUpdateConfig({ prReviewRequireChangelog: !config.prReviewRequireChangelog })}
        >
          <div className="ww-toggle-knob" />
        </div>
      </div>

      {/* Agent-specific options — only shown when agent component is selected */}
      {hasAgentComponent && (
        <div className="ww-pr-agent-options">
          <h4 className="ww-section-subtitle">
            <Bot size={14} /> Quality Agent Settings
          </h4>

          {/* Strictness selector */}
          <div className="ww-pr-strictness">
            <label className="ww-pr-option-label">Review Strictness</label>
            <div className="ww-pr-strictness-buttons">
              {['lenient', 'standard', 'strict'].map((level) => (
                <button
                  key={level}
                  className={`ww-pr-strictness-btn ${config.prReviewAgentStrictness === level ? 'active' : ''}`}
                  onClick={() => onUpdateConfig({ prReviewAgentStrictness: level })}
                >
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Focus area toggles */}
          <div className="ww-pr-focus-areas">
            <label className="ww-pr-option-label">Focus Areas</label>
            <div className="ww-pr-focus-grid">
              {agentFocusOptions.map((focusOption) => {
                const isActive = selectedFocusAreas.includes(focusOption.id)
                return (
                  <button
                    key={focusOption.id}
                    className={`ww-pr-focus-chip ${isActive ? 'active' : ''}`}
                    onClick={() => handleToggleFocusArea(focusOption.id)}
                  >
                    {isActive && <Check size={10} />}
                    {focusOption.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Step 5: Review & Apply ──────────────────────────────────────────────────

function StepReview({
  preview,
  applyResult,
  isPreviewing,
  isApplying,
  config,
  enabledModuleCount,
  showSavePreset,
  savePresetName,
  onToggleSavePreset,
  onSavePresetNameChange,
  onSavePreset,
}) {
  if (applyResult) {
    const createdFiles = applyResult.filesCreated || []
    const updatedFiles = applyResult.filesUpdated || []
    const skippedFiles = applyResult.filesSkipped || []
    const errorList = applyResult.errors || []

    return (
      <div className="ww-step-content">
        <div className="ww-apply-success">
          <Check size={32} className="ww-success-icon" />
          <h3>Workflow Applied Successfully</h3>
          <div className="ww-apply-stats">
            {createdFiles.length > 0 && <span className="ww-stat created">{createdFiles.length} created</span>}
            {updatedFiles.length > 0 && <span className="ww-stat updated">{updatedFiles.length} updated</span>}
            {skippedFiles.length > 0 && <span className="ww-stat skipped">{skippedFiles.length} skipped</span>}
            {errorList.length > 0 && <span className="ww-stat error">{errorList.length} errors</span>}
          </div>
        </div>

        {errorList.length > 0 && (
          <div className="ww-error-list">
            <h4>Errors</h4>
            {errorList.map((errorMessage, errorIndex) => (
              <p key={errorIndex} className="ww-error-item">{errorMessage}</p>
            ))}
          </div>
        )}

        {/* Explain how AI agents are actually enforced via command cards */}
        <AgentEnforcementExplainer />
      </div>
    )
  }

  return (
    <div className="ww-step-content">
      <h3 className="ww-section-title">Review Configuration</h3>

      {/* Summary */}
      <div className="ww-review-summary">
        <div className="ww-review-item">
          <span>Quality Mode</span>
          <span className={`ww-badge ${config.qualityMode === 'best' ? 'ww-badge-best' : 'ww-badge-fast'}`}>
            {config.qualityMode?.toUpperCase()}
          </span>
        </div>
        <div className="ww-review-item">
          <span>Modules Enabled</span>
          <span>{enabledModuleCount} of 8</span>
        </div>
        <div className="ww-review-item">
          <span>Conflict Strategy</span>
          <span>{config.conflictStrategy || 'skip'}</span>
        </div>
      </div>

      {/* File Preview */}
      <h4 className="ww-section-subtitle">Files to Generate</h4>
      {isPreviewing ? (
        <div className="ww-centered">
          <div className="ww-spinner-large" />
          <p>Generating preview...</p>
        </div>
      ) : preview ? (
        <div className="ww-file-preview">
          <div className="ww-preview-stats">
            <span className="ww-stat created">{preview.newFiles || 0} new</span>
            <span className="ww-stat updated">{preview.updateFiles || 0} update</span>
            <span className="ww-stat skipped">{preview.skipFiles || 0} skip</span>
          </div>
          <div className="ww-file-list">
            {(preview.files || []).map((file) => (
              <div key={file.path} className={`ww-file-item ${file.action}`}>
                <FileIcon action={file.action} />
                <span className="ww-file-path">{file.path}</span>
                <span className={`ww-file-action ${file.action}`}>{file.action}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="ww-muted-text">Preview will generate automatically...</p>
      )}

      {/* Save as Preset */}
      <div className="ww-save-preset">
        <button className="ww-btn ww-btn-secondary" onClick={onToggleSavePreset}>
          <Save size={14} />
          {showSavePreset ? 'Cancel' : 'Save as Preset'}
        </button>
        {showSavePreset && (
          <div className="ww-save-preset-form">
            <input
              type="text"
              className="ww-input"
              placeholder="Preset name..."
              value={savePresetName}
              onChange={(event) => onSavePresetNameChange(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && onSavePreset()}
            />
            <button className="ww-btn ww-btn-primary" onClick={onSavePreset} disabled={!savePresetName.trim()}>
              Save
            </button>
          </div>
        )}
      </div>

      {/* Show the enforcement explainer in preview mode too so users understand
          how the workflow will actually be enforced before they click Apply */}
      <AgentEnforcementExplainer />
    </div>
  )
}

// ─── Agent Enforcement Explainer ─────────────────────────────────────────────

/**
 * AgentEnforcementExplainer — Explains how Forge enforces the workflow with
 * AI agents end-to-end using command card macro injection.
 *
 * This is shown in the WorkflowWizard after workflow files are applied (or in
 * preview) so users understand the full enforcement chain, not just the files.
 */
function AgentEnforcementExplainer() {
  return (
    <div className="ww-enforcement-explainer">
      <div className="ww-enforcement-header">
        <Bot size={16} className="ww-enforcement-icon" />
        <h4>How AI Agents Are Enforced</h4>
      </div>

      <p className="ww-enforcement-intro">
        Workflow files alone don't stop an agent from skipping steps. Forge enforces the
        full workflow <strong>automatically</strong> through command card macro injection.
      </p>

      {/* Step-by-step enforcement chain */}
      <div className="ww-enforcement-chain">
        <div className="ww-enforcement-step">
          <span className="ww-chain-number">1</span>
          <MousePointerClick size={14} />
          <div className="ww-chain-text">
            <strong>Click a Copilot command card</strong>
            <span>Use "🛡️ Copilot (Workflow Enforced)" or "🤖 Copilot (Fresh)" from the command panel</span>
          </div>
        </div>
        <ArrowRight size={14} className="ww-chain-arrow" />

        <div className="ww-enforcement-step">
          <span className="ww-chain-number">2</span>
          <Zap size={14} />
          <div className="ww-chain-text">
            <strong>Macro injection fires automatically</strong>
            <span>After Copilot starts (2 second delay), Forge sends an enforcement prompt as the agent's first message — no typing required</span>
          </div>
        </div>
        <ArrowRight size={14} className="ww-chain-arrow" />

        <div className="ww-enforcement-step">
          <span className="ww-chain-number">3</span>
          <FileText size={14} />
          <div className="ww-chain-text">
            <strong>Agent reads AGENTS.md</strong>
            <span>The injected prompt instructs the agent to read AGENTS.md, which contains the circuit breaker rule: first tool call on any code task must be <code>skill: workflow-enforcer</code></span>
          </div>
        </div>
        <ArrowRight size={14} className="ww-chain-arrow" />

        <div className="ww-enforcement-step">
          <span className="ww-chain-number">4</span>
          <Shield size={14} />
          <div className="ww-chain-text">
            <strong>Skill chain cascades</strong>
            <span>workflow-enforcer loads and immediately triggers: enterprise-workflow → code-quality → branching-strategy → code-tutor-workflow</span>
          </div>
        </div>
        <ArrowRight size={14} className="ww-chain-arrow" />

        <div className="ww-enforcement-step">
          <span className="ww-chain-number">5</span>
          <GitBranch size={14} />
          <div className="ww-chain-text">
            <strong>Branch created before code</strong>
            <span>Skills enforce: branch must exist before any file is written. Naming, comments, tests, and CHANGELOG are checked at every delivery</span>
          </div>
        </div>
      </div>

      <div className="ww-enforcement-cards-note">
        <strong>Command cards to use:</strong>
        <ul>
          <li><code>🛡️ Copilot (Workflow Enforced)</code> — strongest enforcement, explicitly names the full skill chain</li>
          <li><code>🤖 Copilot (Fresh)</code> — standard fresh session with enforcement injection</li>
          <li><code>🔄 Copilot (Resume)</code> — resumes a previous session with enforcement injection</li>
        </ul>
        <p className="ww-enforcement-note-text">
          These cards are pre-configured with the correct macro payload. You can customize
          the payload in the command card editor (click the card's edit icon in the command panel).
        </p>
      </div>
    </div>
  )
}

function FileIcon({ action }) {
  switch (action) {
    case 'create': return <FilePlus size={14} className="ww-file-icon create" />
    case 'update': return <FileWarning size={14} className="ww-file-icon update" />
    case 'skip': return <SkipForward size={14} className="ww-file-icon skip" />
    default: return <FileText size={14} className="ww-file-icon" />
  }
}

export default WorkflowWizard
