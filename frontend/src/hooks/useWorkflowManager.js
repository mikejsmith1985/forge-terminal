import { useState, useEffect, useCallback } from 'react';
import { logger } from '../utils/logger';

/**
 * Hook for managing workflows (CRUD operations)
 * @returns {Object} Workflow state and actions
 */
export function useWorkflowManager() {
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load workflows on mount
  useEffect(() => {
    loadWorkflows();
  }, []);

  const loadWorkflows = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch('/api/workflows');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      setWorkflows(data);
      logger.workflows('Workflows loaded', { count: data.length });
    } catch (err) {
      logger.workflows('Failed to load workflows', { error: err.message });
      setError(err.message);
      setWorkflows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const createWorkflow = useCallback(async (workflow) => {
    try {
      // Generate new ID (max + 1)
      const maxId = workflows.reduce((max, wf) => Math.max(max, wf.id || 0), 0);
      const newWorkflow = {
        ...workflow,
        id: maxId + 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const updated = [...workflows, newWorkflow];

      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      setWorkflows(updated);
      logger.workflows('Workflow created', { id: newWorkflow.id, name: newWorkflow.name });
      return { success: true, workflow: newWorkflow };
    } catch (err) {
      logger.workflows('Failed to create workflow', { error: err.message });
      return { success: false, error: err.message };
    }
  }, [workflows]);

  const updateWorkflow = useCallback(async (workflowId, updates) => {
    try {
      const updated = workflows.map(wf =>
        wf.id === workflowId
          ? { ...wf, ...updates, updatedAt: new Date().toISOString() }
          : wf
      );

      const workflow = updated.find(wf => wf.id === workflowId);
      if (!workflow) {
        throw new Error('Workflow not found');
      }

      const res = await fetch(`/api/workflows/${workflowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workflow),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      setWorkflows(updated);
      logger.workflows('Workflow updated', { id: workflowId });
      return { success: true };
    } catch (err) {
      logger.workflows('Failed to update workflow', { error: err.message });
      return { success: false, error: err.message };
    }
  }, [workflows]);

  const deleteWorkflow = useCallback(async (workflowId) => {
    try {
      const res = await fetch(`/api/workflows/${workflowId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const updated = workflows.filter(wf => wf.id !== workflowId);
      setWorkflows(updated);
      logger.workflows('Workflow deleted', { id: workflowId });
      return { success: true };
    } catch (err) {
      logger.workflows('Failed to delete workflow', { error: err.message });
      return { success: false, error: err.message };
    }
  }, [workflows]);

  return {
    workflows,
    loading,
    error,
    loadWorkflows,
    createWorkflow,
    updateWorkflow,
    deleteWorkflow,
  };
}
