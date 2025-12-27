import { useState, useCallback } from 'react';
import { logger } from '../utils/logger';

/**
 * Hook for managing workflow execution state
 * @param {Object} workflow - Workflow definition
 * @returns {Object} Execution state and actions
 */
export function useWorkflowExecution(workflow) {
  const [execution, setExecution] = useState(null);

  const startExecution = useCallback(() => {
    if (!workflow) {
      logger.workflows('Cannot start execution - no workflow provided');
      return;
    }

    // Find start node
    const startNode = workflow.nodes.find(n => n.type === 'start');
    if (!startNode) {
      logger.workflows('No start node found', { workflowId: workflow.id });
      return;
    }

    // Find first connected node
    const firstEdge = workflow.edges.find(e => e.source === startNode.id);
    if (!firstEdge) {
      logger.workflows('No edge from start node', { workflowId: workflow.id });
      return;
    }

    const firstNodeId = firstEdge.target;

    const newExecution = {
      workflowId: workflow.id,
      currentNodeId: firstNodeId,
      startedAt: new Date().toISOString(),
      history: [],
      variables: {},
    };

    setExecution(newExecution);
    logger.workflows('Execution started', {
      workflowId: workflow.id,
      firstNode: firstNodeId,
    });
  }, [workflow]);

  const advanceToNext = useCallback((edgeType = 'success') => {
    if (!execution || !execution.currentNodeId || !workflow) {
      logger.workflows('Cannot advance - no active execution or workflow');
      return;
    }

    // Find outgoing edge of specified type
    const edge = workflow.edges.find(
      e => e.source === execution.currentNodeId && e.type === edgeType
    );

    if (!edge) {
      // Try default edge
      const defaultEdge = workflow.edges.find(
        e => e.source === execution.currentNodeId && e.type === 'default'
      );

      if (!defaultEdge) {
        logger.workflows('No outgoing edge found', {
          nodeId: execution.currentNodeId,
          edgeType,
        });
        return;
      }

      setExecution(prev => ({
        ...prev,
        currentNodeId: defaultEdge.target,
      }));

      logger.workflows('Advanced to next node (default)', {
        from: execution.currentNodeId,
        to: defaultEdge.target,
      });
      return;
    }

    setExecution(prev => ({
      ...prev,
      currentNodeId: edge.target,
    }));

    logger.workflows('Advanced to next node', {
      from: execution.currentNodeId,
      to: edge.target,
      edgeType,
    });
  }, [execution, workflow]);

  const markStepComplete = useCallback((nodeId, status, output = null) => {
    if (!execution) {
      logger.workflows('Cannot mark step complete - no active execution');
      return;
    }

    const now = new Date().toISOString();
    const historyEntry = {
      nodeId,
      startTime: now,
      endTime: now,
      status,
      output,
      criteriaResult: null,
    };

    setExecution(prev => ({
      ...prev,
      history: [...prev.history, historyEntry],
    }));

    logger.workflows('Step marked complete', { nodeId, status });
  }, [execution]);

  const abortExecution = useCallback(() => {
    if (!execution) {
      return;
    }

    logger.workflows('Execution aborted', { workflowId: execution.workflowId });
    setExecution(null);
  }, [execution]);

  const loopBackTo = useCallback((nodeId) => {
    if (!execution) {
      logger.workflows('Cannot loop back - no active execution');
      return;
    }

    setExecution(prev => ({
      ...prev,
      currentNodeId: nodeId,
    }));

    logger.workflows('Looped back to node', { nodeId });
  }, [execution]);

  return {
    execution,
    startExecution,
    advanceToNext,
    markStepComplete,
    abortExecution,
    loopBackTo,
  };
}
