import React, { useState, useEffect } from 'react';
import { X, Play, SkipForward, RotateCcw } from 'lucide-react';
import { WorkflowExecutorStep } from './WorkflowExecutorStep';
import { useWorkflowExecution } from '../../hooks/useWorkflowExecution';
import { logger } from '../../utils/logger';

/**
 * WorkflowExecutor - Execute workflow step-by-step
 * @param {Object} props
 * @param {Object} props.workflow - Workflow to execute
 * @param {Function} props.onClose - Close callback
 * @param {Function} props.onExecuteCommand - Execute command card callback
 * @param {Array} props.commandCards - Available command cards
 */
export function WorkflowExecutor({ workflow, onClose, onExecuteCommand, commandCards = [] }) {
  const {
    execution,
    startExecution,
    advanceToNext,
    markStepComplete,
    loopBackTo,
    abortExecution,
  } = useWorkflowExecution(workflow);

  const [isExecuting, setIsExecuting] = useState(false);
  const [showLoopBackMenu, setShowLoopBackMenu] = useState(false);

  useEffect(() => {
    // Auto-start execution when component mounts
    if (workflow && !execution) {
      logger.workflows('Starting workflow execution', { workflowId: workflow.id });
      startExecution();
    }
  }, [workflow, execution, startExecution]);

  if (!workflow || !execution) {
    return null;
  }

  const currentNode = workflow.nodes.find(n => n.id === execution.currentNodeId);
  const isAtEnd = currentNode?.type === 'end';

  // Get available edges from current node
  const availableEdges = workflow.edges.filter(e => e.source === execution.currentNodeId);
  const successEdge = availableEdges.find(e => e.type === 'success');
  const failureEdge = availableEdges.find(e => e.type === 'failure');
  const defaultEdge = availableEdges.find(e => e.type === 'default');

  // Get completed nodes for loop-back options
  const completedNodeIds = execution.history
    .filter(h => h.status === 'completed')
    .map(h => h.nodeId);
  const loopBackOptions = workflow.nodes.filter(n => 
    completedNodeIds.includes(n.id) && n.id !== execution.currentNodeId
  );

  const handleExecuteStep = async () => {
    if (!currentNode) return;

    setIsExecuting(true);
    logger.workflows('Executing step', { nodeId: currentNode.id, label: currentNode.label });

    try {
      // If node has command card assigned, execute it
      if (currentNode.commandCardId) {
        const commandCard = commandCards.find(c => c.id === currentNode.commandCardId);
        if (commandCard) {
          logger.workflows('Executing command card', { 
            cardId: commandCard.id, 
            command: commandCard.command 
          });
          await onExecuteCommand(commandCard);
        }
      }

      // Mark step as completed (will evaluate success criteria in future)
      // For now, always mark as completed
      markStepComplete(currentNode.id, 'completed', 'Step executed successfully');

    } catch (error) {
      logger.workflows('Step execution failed', { error: error.message });
      markStepComplete(currentNode.id, 'failed', error.message);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleNext = (edgeType = 'success') => {
    logger.workflows('Advancing to next step', { edgeType });
    advanceToNext(edgeType);
  };

  const handleLoopBack = (nodeId) => {
    logger.workflows('Looping back', { targetNodeId: nodeId });
    loopBackTo(nodeId);
    setShowLoopBackMenu(false);
  };

  const handleAbort = () => {
    logger.workflows('Aborting workflow execution');
    abortExecution();
    onClose();
  };

  // Determine if we can advance
  const canAdvance = currentNode?.type !== 'start' && !isAtEnd;
  const hasMultiplePaths = (successEdge || failureEdge) && defaultEdge;

  return (
    <div className="workflow-executor-overlay">
      <div className="workflow-executor-container">
        {/* Header */}
        <div className="workflow-executor-header">
          <div className="workflow-executor-title">
            <Play size={20} className="executor-icon" />
            <h2>{workflow.name}</h2>
            <span className="executor-status">
              {isAtEnd ? 'Completed' : 'In Progress'}
            </span>
          </div>
          <button className="btn-close-executor" onClick={handleAbort} title="Close Executor">
            <X size={20} />
          </button>
        </div>

        {/* Current Step */}
        <div className="workflow-executor-body">
          <div className="executor-current-step">
            <h3>Current Step</h3>
            <WorkflowExecutorStep
              node={currentNode}
              isActive={true}
              execution={execution}
              commandCards={commandCards}
            />
          </div>

          {/* Execution History */}
          {execution.history.length > 0 && (
            <div className="executor-history">
              <h3>Execution History</h3>
              <div className="executor-history-list">
                {execution.history.map((historyEntry, index) => {
                  const historyNode = workflow.nodes.find(n => n.id === historyEntry.nodeId);
                  return (
                    <WorkflowExecutorStep
                      key={`${historyEntry.nodeId}-${index}`}
                      node={historyNode}
                      isActive={false}
                      execution={execution}
                      historyEntry={historyEntry}
                      commandCards={commandCards}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer - Control Buttons */}
        <div className="workflow-executor-footer">
          {!isAtEnd ? (
            <>
              {/* Execute Current Step */}
              {currentNode?.type === 'command' && currentNode.commandCardId && (
                <button
                  className="btn btn-primary"
                  onClick={handleExecuteStep}
                  disabled={isExecuting}
                >
                  <Play size={16} />
                  {isExecuting ? 'Executing...' : 'Execute Step'}
                </button>
              )}

              {/* Next Button(s) */}
              {canAdvance && !hasMultiplePaths && (
                <button
                  className="btn btn-accent"
                  onClick={() => handleNext('success')}
                  disabled={isExecuting}
                >
                  <SkipForward size={16} />
                  Next
                </button>
              )}

              {/* Success/Failure Path Buttons */}
              {canAdvance && hasMultiplePaths && (
                <>
                  {(successEdge || defaultEdge) && (
                    <button
                      className="btn btn-success"
                      onClick={() => handleNext('success')}
                      disabled={isExecuting}
                    >
                      ✓ Success Path
                    </button>
                  )}
                  {failureEdge && (
                    <button
                      className="btn btn-failure"
                      onClick={() => handleNext('failure')}
                      disabled={isExecuting}
                    >
                      ✗ Failure Path
                    </button>
                  )}
                </>
              )}

              {/* Loop Back Button */}
              {loopBackOptions.length > 0 && (
                <div className="loop-back-container">
                  <button
                    className="btn btn-secondary"
                    onClick={() => setShowLoopBackMenu(!showLoopBackMenu)}
                    disabled={isExecuting}
                  >
                    <RotateCcw size={16} />
                    Loop Back
                  </button>
                  {showLoopBackMenu && (
                    <div className="loop-back-menu">
                      {loopBackOptions.map(node => (
                        <button
                          key={node.id}
                          className="loop-back-option"
                          onClick={() => handleLoopBack(node.id)}
                        >
                          {node.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="executor-completion">
              <p className="completion-message">🎉 Workflow completed successfully!</p>
              <button className="btn btn-primary" onClick={onClose}>
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
