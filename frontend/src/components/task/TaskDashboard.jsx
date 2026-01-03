/**
 * TaskDashboard - Workflow Stage Orchestration for Agentic Development
 * 
 * A task-focused view that wraps the existing terminal with stage tracking.
 * Unlike the old Notebook (isolated cells), this INTEGRATES with:
 * - Real terminal (ForgeTerminal) - embedded, not replaced
 * - Context Cart (LensFilePicker) - files become Stage 1 context
 * - AM logs - automatic history tracking
 * - Command Cards - queued for test/commit stages
 * 
 * Stages:
 * 1. Context - Gather files, understand scope
 * 2. Plan - AI generates approach (captured from CLI output)
 * 3. Implement - Work in terminal (the REAL one)
 * 4. Validate - Run tests, lint, check
 * 5. Deliver - Commit, PR, deploy
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { 
  FileCode, Brain, Terminal, CheckCircle, Rocket,
  ChevronDown, ChevronRight, Plus, X, Play, Pause,
  Clock, Check, Circle, ArrowRight, Edit2, Save
} from 'lucide-react';
import SmartRoutingPanel from '../SmartRoutingPanel';
import './TaskDashboard.css';

// Stage definitions
const STAGES = {
  CONTEXT: { id: 'context', name: 'Context', icon: FileCode, color: '#3b82f6' },
  PLAN: { id: 'plan', name: 'Plan', icon: Brain, color: '#8b5cf6' },
  IMPLEMENT: { id: 'implement', name: 'Implement', icon: Terminal, color: '#f59e0b' },
  VALIDATE: { id: 'validate', name: 'Validate', icon: CheckCircle, color: '#10b981' },
  DELIVER: { id: 'deliver', name: 'Deliver', icon: Rocket, color: '#ef4444' },
};

const STAGE_ORDER = ['context', 'plan', 'implement', 'validate', 'deliver'];

// Stage status
const STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  COMPLETE: 'complete',
  SKIPPED: 'skipped',
};

/**
 * TaskDashboard Component
 */
export default function TaskDashboard({
  tabId,
  // Integration props
  contextFiles = [],           // From LensFilePicker
  commandCards = [],           // Available command cards
  amSnapshots = [],            // AM history snapshots
  terminalRef,                 // Reference to ForgeTerminal
  // Callbacks
  onStageChange,               // Called when active stage changes
  onTaskComplete,              // Called when task is marked complete
  onOpenContextCart,           // Open LensFilePicker
  onRunCommand,                // Run a command in terminal
  onToast,                     // Show toast notification
}) {
  // Task state
  const [taskName, setTaskName] = useState('');
  const [isEditingName, setIsEditingName] = useState(true);
  const [activeStage, setActiveStage] = useState('context');
  const [stageStatuses, setStageStatuses] = useState({
    context: STATUS.ACTIVE,
    plan: STATUS.PENDING,
    implement: STATUS.PENDING,
    validate: STATUS.PENDING,
    deliver: STATUS.PENDING,
  });
  
  // Stage-specific data
  const [planNotes, setPlanNotes] = useState('');
  const [planCaptured, setPlanCaptured] = useState('');
  const [validateCommands, setValidateCommands] = useState([]);
  const [deliverCommands, setDeliverCommands] = useState([]);
  const [expandedStages, setExpandedStages] = useState({
    context: true,
    plan: false,
    implement: true,
    validate: false,
    deliver: false,
  });

  // Smart routing state
  const [implementPrompt, setImplementPrompt] = useState('');
  const [showRoutingPanel, setShowRoutingPanel] = useState(false);
  const [currentModel, setCurrentModel] = useState('claude-sonnet-4.5');

  // Compute context summary
  const contextSummary = useMemo(() => {
    const totalFiles = contextFiles.length;
    const totalTokens = contextFiles.reduce((sum, f) => sum + (f.tokens || Math.ceil((f.size || 0) / 4)), 0);
    return { totalFiles, totalTokens };
  }, [contextFiles]);

  // Auto-populate validate commands from command cards tagged with 'test'
  useEffect(() => {
    const testCards = commandCards.filter(c => 
      c.tags?.includes('test') || 
      c.command?.includes('test') ||
      c.name?.toLowerCase().includes('test')
    );
    if (testCards.length > 0 && validateCommands.length === 0) {
      setValidateCommands(testCards.map(c => ({ 
        id: c.id, 
        command: c.command, 
        name: c.name,
        status: 'pending' 
      })));
    }
  }, [commandCards]);

  // Auto-populate deliver commands from command cards tagged with 'commit' or 'deploy'
  useEffect(() => {
    const deliverCards = commandCards.filter(c => 
      c.tags?.includes('commit') || 
      c.tags?.includes('deploy') ||
      c.command?.includes('git commit') ||
      c.command?.includes('git push')
    );
    if (deliverCards.length > 0 && deliverCommands.length === 0) {
      setDeliverCommands(deliverCards.map(c => ({ 
        id: c.id, 
        command: c.command, 
        name: c.name,
        status: 'pending' 
      })));
    }
  }, [commandCards]);

  // Toggle stage expansion
  const toggleStage = useCallback((stageId) => {
    setExpandedStages(prev => ({
      ...prev,
      [stageId]: !prev[stageId]
    }));
  }, []);

  // Advance to next stage
  const advanceStage = useCallback((fromStage) => {
    const currentIndex = STAGE_ORDER.indexOf(fromStage);
    if (currentIndex < STAGE_ORDER.length - 1) {
      const nextStage = STAGE_ORDER[currentIndex + 1];
      setStageStatuses(prev => ({
        ...prev,
        [fromStage]: STATUS.COMPLETE,
        [nextStage]: STATUS.ACTIVE,
      }));
      setActiveStage(nextStage);
      setExpandedStages(prev => ({
        ...prev,
        [fromStage]: false,
        [nextStage]: true,
      }));
      onStageChange?.(nextStage);
    } else {
      // Task complete
      setStageStatuses(prev => ({
        ...prev,
        [fromStage]: STATUS.COMPLETE,
      }));
      onTaskComplete?.();
      onToast?.('🎉 Task complete!', 'success', 3000);
    }
  }, [onStageChange, onTaskComplete, onToast]);

  // Go to specific stage
  const goToStage = useCallback((stageId) => {
    setActiveStage(stageId);
    setStageStatuses(prev => ({
      ...prev,
      [stageId]: prev[stageId] === STATUS.PENDING ? STATUS.ACTIVE : prev[stageId],
    }));
    setExpandedStages(prev => ({
      ...prev,
      [stageId]: true,
    }));
    onStageChange?.(stageId);
  }, [onStageChange]);

  // Run a command from validate/deliver
  const runStageCommand = useCallback((stageId, cmdIndex) => {
    const commands = stageId === 'validate' ? validateCommands : deliverCommands;
    const cmd = commands[cmdIndex];
    if (!cmd) return;

    // Update status to running
    const setCommands = stageId === 'validate' ? setValidateCommands : setDeliverCommands;
    setCommands(prev => prev.map((c, i) => 
      i === cmdIndex ? { ...c, status: 'running' } : c
    ));

    // Execute via terminal
    if (onRunCommand) {
      onRunCommand(cmd.command);
      onToast?.(`Running: ${cmd.name || cmd.command}`, 'info', 2000);
    }

    // Mark as complete after a delay (in reality, this would be detected from terminal output)
    setTimeout(() => {
      setCommands(prev => prev.map((c, i) => 
        i === cmdIndex ? { ...c, status: 'complete' } : c
      ));
    }, 2000);
  }, [validateCommands, deliverCommands, onRunCommand, onToast]);

  // Capture plan from terminal (simplified - in reality would parse AM logs)
  const capturePlan = useCallback(() => {
    if (terminalRef?.getBuffer) {
      const buffer = terminalRef.getBuffer();
      // Look for plan-like content in the last 2000 chars
      const recentOutput = buffer.slice(-2000);
      setPlanCaptured(recentOutput);
      onToast?.('Plan captured from terminal', 'success', 2000);
    }
  }, [terminalRef, onToast]);

  // Render status icon
  const StatusIcon = ({ status }) => {
    switch (status) {
      case STATUS.COMPLETE:
        return <Check size={16} className="status-icon complete" />;
      case STATUS.ACTIVE:
        return <Circle size={16} className="status-icon active" />;
      case STATUS.SKIPPED:
        return <X size={16} className="status-icon skipped" />;
      default:
        return <Circle size={16} className="status-icon pending" />;
    }
  };

  // Render a single stage
  const renderStage = (stageKey) => {
    const stage = STAGES[stageKey.toUpperCase()];
    const status = stageStatuses[stageKey];
    const isExpanded = expandedStages[stageKey];
    const isActive = activeStage === stageKey;
    const StageIcon = stage.icon;

    return (
      <div 
        key={stageKey}
        className={`task-stage ${status} ${isActive ? 'active' : ''}`}
        style={{ '--stage-color': stage.color }}
      >
        {/* Stage Header */}
        <div 
          className="task-stage-header"
          onClick={() => toggleStage(stageKey)}
        >
          <div className="stage-header-left">
            <StatusIcon status={status} />
            <StageIcon size={18} style={{ color: stage.color }} />
            <span className="stage-name">{stage.name}</span>
            {status === STATUS.COMPLETE && (
              <span className="stage-complete-badge">✓</span>
            )}
          </div>
          <div className="stage-header-right">
            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </div>
        </div>

        {/* Stage Content */}
        {isExpanded && (
          <div className="task-stage-content">
            {stageKey === 'context' && (
              <div className="stage-context">
                <div className="context-summary">
                  <span>{contextSummary.totalFiles} files</span>
                  <span>•</span>
                  <span>{contextSummary.totalTokens.toLocaleString()} tokens</span>
                </div>
                {contextFiles.length > 0 ? (
                  <div className="context-files">
                    {contextFiles.slice(0, 5).map((file, i) => (
                      <div key={i} className="context-file">
                        <FileCode size={14} />
                        <span>{file.name || file.path?.split('/').pop()}</span>
                      </div>
                    ))}
                    {contextFiles.length > 5 && (
                      <div className="context-more">
                        +{contextFiles.length - 5} more files
                      </div>
                    )}
                  </div>
                ) : (
                  <button 
                    className="stage-action-btn"
                    onClick={onOpenContextCart}
                  >
                    <Plus size={14} />
                    Add files to context
                  </button>
                )}
                {contextFiles.length > 0 && (
                  <button 
                    className="stage-advance-btn"
                    onClick={() => advanceStage('context')}
                  >
                    Continue to Plan
                    <ArrowRight size={14} />
                  </button>
                )}
              </div>
            )}

            {stageKey === 'plan' && (
              <div className="stage-plan">
                <textarea
                  className="plan-notes"
                  placeholder="Describe your approach, or capture a plan from CLI output..."
                  value={planNotes}
                  onChange={(e) => setPlanNotes(e.target.value)}
                  rows={4}
                />
                <div className="plan-actions">
                  <button 
                    className="stage-action-btn secondary"
                    onClick={capturePlan}
                    title="Capture recent terminal output as plan"
                  >
                    <Terminal size={14} />
                    Capture from Terminal
                  </button>
                </div>
                {planCaptured && (
                  <div className="plan-captured">
                    <div className="plan-captured-header">Captured Output:</div>
                    <pre>{planCaptured.slice(0, 500)}...</pre>
                  </div>
                )}
                <button 
                  className="stage-advance-btn"
                  onClick={() => advanceStage('plan')}
                >
                  Start Implementation
                  <ArrowRight size={14} />
                </button>
              </div>
            )}

            {stageKey === 'implement' && (
              <div className="stage-implement">
                {/* Smart Routing Panel */}
                {showRoutingPanel && implementPrompt && (
                  <SmartRoutingPanel
                    prompt={implementPrompt}
                    mentionedFiles={contextFiles.map(f => f.path || f.name)}
                    currentModel={currentModel}
                    onAccept={(recommendedModel) => {
                      setCurrentModel(recommendedModel);
                      setShowRoutingPanel(false);
                      onToast?.(`Switched to ${recommendedModel}`, 'success', 2000);
                      // TODO: Actually switch model via API
                    }}
                    onReject={() => {
                      setShowRoutingPanel(false);
                    }}
                  />
                )}

                {/* Task Prompt Input */}
                <div className="implement-prompt-section">
                  <label htmlFor="task-prompt">What do you want to implement?</label>
                  <textarea
                    id="task-prompt"
                    data-testid="ht-task-input"
                    className="task-prompt-input"
                    placeholder="Describe the implementation task... (e.g., 'Refactor routing logic across 7 files')"
                    value={implementPrompt}
                    onChange={(e) => {
                      setImplementPrompt(e.target.value);
                      // Show routing panel when user types a substantial prompt
                      if (e.target.value.trim().length > 20) {
                        setShowRoutingPanel(true);
                      }
                    }}
                    rows={3}
                  />
                </div>

                <div className="implement-hint">
                  <Terminal size={16} />
                  <span>Work in the terminal below. Your changes are tracked automatically via AM.</span>
                </div>
                <div className="implement-stats">
                  <div className="stat">
                    <Clock size={14} />
                    <span>Session active</span>
                  </div>
                  <div className="stat">
                    <span>Current model: {currentModel.split('-').pop()}</span>
                  </div>
                </div>
                <button 
                  className="stage-advance-btn"
                  onClick={() => advanceStage('implement')}
                >
                  Ready to Validate
                  <ArrowRight size={14} />
                </button>
              </div>
            )}

            {stageKey === 'validate' && (
              <div className="stage-validate">
                {validateCommands.length > 0 ? (
                  <div className="validate-commands">
                    {validateCommands.map((cmd, i) => (
                      <div key={i} className={`validate-command ${cmd.status}`}>
                        <div className="command-info">
                          <code>{cmd.name || cmd.command}</code>
                        </div>
                        <button
                          className="command-run-btn"
                          onClick={() => runStageCommand('validate', i)}
                          disabled={cmd.status === 'running'}
                        >
                          {cmd.status === 'running' ? (
                            <Pause size={14} />
                          ) : cmd.status === 'complete' ? (
                            <Check size={14} />
                          ) : (
                            <Play size={14} />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="no-commands">
                    No test commands configured. Add command cards tagged with "test".
                  </div>
                )}
                <button 
                  className="stage-advance-btn"
                  onClick={() => advanceStage('validate')}
                >
                  Ready to Deliver
                  <ArrowRight size={14} />
                </button>
              </div>
            )}

            {stageKey === 'deliver' && (
              <div className="stage-deliver">
                {deliverCommands.length > 0 ? (
                  <div className="deliver-commands">
                    {deliverCommands.map((cmd, i) => (
                      <div key={i} className={`deliver-command ${cmd.status}`}>
                        <div className="command-info">
                          <code>{cmd.name || cmd.command}</code>
                        </div>
                        <button
                          className="command-run-btn"
                          onClick={() => runStageCommand('deliver', i)}
                          disabled={cmd.status === 'running'}
                        >
                          {cmd.status === 'running' ? (
                            <Pause size={14} />
                          ) : cmd.status === 'complete' ? (
                            <Check size={14} />
                          ) : (
                            <Play size={14} />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="no-commands">
                    No delivery commands configured. Add command cards tagged with "commit" or "deploy".
                  </div>
                )}
                <button 
                  className="stage-advance-btn complete"
                  onClick={() => advanceStage('deliver')}
                >
                  <Rocket size={14} />
                  Complete Task
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="task-dashboard">
      {/* Task Header */}
      <div className="task-header">
        {isEditingName ? (
          <div className="task-name-edit">
            <input
              type="text"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              placeholder="What are you building?"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && taskName.trim()) {
                  setIsEditingName(false);
                }
              }}
            />
            <button 
              onClick={() => taskName.trim() && setIsEditingName(false)}
              disabled={!taskName.trim()}
            >
              <Save size={16} />
            </button>
          </div>
        ) : (
          <div className="task-name-display">
            <h2>{taskName}</h2>
            <button onClick={() => setIsEditingName(true)}>
              <Edit2 size={14} />
            </button>
          </div>
        )}
        
        {/* Progress indicator */}
        <div className="task-progress">
          {STAGE_ORDER.map((stageKey, i) => {
            const status = stageStatuses[stageKey];
            const stage = STAGES[stageKey.toUpperCase()];
            return (
              <React.Fragment key={stageKey}>
                <div 
                  className={`progress-dot ${status}`}
                  style={{ background: status === STATUS.COMPLETE ? stage.color : undefined }}
                  onClick={() => goToStage(stageKey)}
                  title={stage.name}
                />
                {i < STAGE_ORDER.length - 1 && (
                  <div className={`progress-line ${status === STATUS.COMPLETE ? 'complete' : ''}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Stages */}
      <div className="task-stages">
        {STAGE_ORDER.map(stageKey => renderStage(stageKey))}
      </div>
    </div>
  );
}

export { STAGES, STATUS, STAGE_ORDER };
