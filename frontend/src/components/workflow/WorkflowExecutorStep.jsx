import React from 'react';
import { CheckCircle, XCircle, Clock, Circle } from 'lucide-react';

/**
 * WorkflowExecutorStep - Display a single step in workflow execution
 * @param {Object} props
 * @param {Object} props.node - Workflow node
 * @param {boolean} props.isActive - Whether this is the current step
 * @param {Object} props.execution - Execution state
 * @param {Object} props.historyEntry - History entry (for completed steps)
 * @param {Array} props.commandCards - Available command cards
 */
export function WorkflowExecutorStep({ 
  node, 
  isActive, 
  execution, 
  historyEntry, 
  commandCards = [] 
}) {
  if (!node) return null;

  // Get status from history entry or default to pending
  const status = historyEntry?.status || (isActive ? 'running' : 'pending');
  
  // Get command card if assigned
  const commandCard = node.commandCardId 
    ? commandCards.find(c => c.id === node.commandCardId) 
    : null;

  // Get icon based on status
  const getStatusIcon = () => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={20} className="status-icon status-icon-completed" />;
      case 'failed':
        return <XCircle size={20} className="status-icon status-icon-failed" />;
      case 'running':
        return <Clock size={20} className="status-icon status-icon-running" />;
      default:
        return <Circle size={20} className="status-icon status-icon-pending" />;
    }
  };

  // Get node type emoji
  const getNodeEmoji = () => {
    switch (node.type) {
      case 'start':
        return '▶️';
      case 'end':
        return '🏁';
      case 'decision':
        return '❓';
      case 'command':
        return '⚙️';
      default:
        return '📦';
    }
  };

  // Format execution time
  const formatExecutionTime = () => {
    if (!historyEntry?.startTime || !historyEntry?.endTime) return null;
    const start = new Date(historyEntry.startTime);
    const end = new Date(historyEntry.endTime);
    const duration = (end - start) / 1000; // seconds
    return duration < 60 
      ? `${duration.toFixed(1)}s` 
      : `${Math.floor(duration / 60)}m ${(duration % 60).toFixed(0)}s`;
  };

  const executionTime = formatExecutionTime();

  return (
    <div className={`executor-step ${isActive ? 'executor-step-active' : ''} executor-step-${status}`}>
      <div className="executor-step-header">
        <div className="executor-step-icon-container">
          {getStatusIcon()}
          <span className="executor-step-emoji">{getNodeEmoji()}</span>
        </div>
        <div className="executor-step-info">
          <h4 className="executor-step-label">{node.label}</h4>
          {node.description && (
            <p className="executor-step-description">{node.description}</p>
          )}
        </div>
      </div>

      {/* Command Card Info */}
      {commandCard && (
        <div className="executor-step-command">
          <div className="executor-command-label">Command:</div>
          <code className="executor-command-code">
            {commandCard.command || commandCard.description}
          </code>
        </div>
      )}

      {/* Success Criteria */}
      {node.successCriteria && (
        <div className="executor-step-criteria">
          <div className="executor-criteria-label">Success Criteria:</div>
          <div className="executor-criteria-value">
            {node.successCriteria.type === 'manual' && 'Manual confirmation required'}
            {node.successCriteria.type === 'exitCode' && 
              `Exit code ${node.successCriteria.operator || '=='} ${node.successCriteria.threshold || 0}`}
            {node.successCriteria.type === 'testCoverage' && 
              `Test coverage ${node.successCriteria.operator || '>='} ${node.successCriteria.threshold || 80}%`}
            {node.successCriteria.type === 'passRate' && 
              `Pass rate ${node.successCriteria.operator || '>='} ${node.successCriteria.threshold || 100}%`}
          </div>
        </div>
      )}

      {/* Execution Details (for completed steps) */}
      {historyEntry && (
        <div className="executor-step-details">
          {executionTime && (
            <div className="executor-detail-item">
              <span className="executor-detail-label">Duration:</span>
              <span className="executor-detail-value">{executionTime}</span>
            </div>
          )}
          {historyEntry.output && (
            <div className="executor-detail-item executor-detail-output">
              <span className="executor-detail-label">Output:</span>
              <pre className="executor-output-text">{historyEntry.output}</pre>
            </div>
          )}
          {historyEntry.criteriaResult && (
            <div className="executor-detail-item">
              <span className="executor-detail-label">Criteria Result:</span>
              <span className={`executor-criteria-result ${historyEntry.criteriaResult.met ? 'met' : 'not-met'}`}>
                {historyEntry.criteriaResult.met ? '✓ Met' : '✗ Not Met'}
                {historyEntry.criteriaResult.actual !== null && 
                  ` (${historyEntry.criteriaResult.actual}${historyEntry.criteriaResult.expected ? ` vs ${historyEntry.criteriaResult.expected}` : ''})`}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
