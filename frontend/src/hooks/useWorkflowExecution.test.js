import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorkflowExecution } from './useWorkflowExecution';

const mockWorkflow = {
  id: 1,
  name: 'Test Workflow',
  description: 'Test',
  nodes: [
    {
      id: 'node-start',
      type: 'start',
      label: 'Start',
      position: { x: 0, y: 0 },
      status: 'pending',
      metadata: { retryCount: 0 },
    },
    {
      id: 'node-1',
      type: 'command',
      label: 'Step 1',
      commandCardId: 1,
      position: { x: 100, y: 0 },
      status: 'pending',
      metadata: { retryCount: 0 },
    },
    {
      id: 'node-2',
      type: 'command',
      label: 'Step 2',
      commandCardId: 2,
      position: { x: 200, y: 0 },
      status: 'pending',
      metadata: { retryCount: 0 },
    },
    {
      id: 'node-end',
      type: 'end',
      label: 'End',
      position: { x: 300, y: 0 },
      status: 'pending',
      metadata: { retryCount: 0 },
    },
  ],
  edges: [
    { id: 'edge-1', source: 'node-start', target: 'node-1', type: 'default', animated: false },
    { id: 'edge-2', source: 'node-1', target: 'node-2', type: 'success', animated: false },
    { id: 'edge-3', source: 'node-2', target: 'node-end', type: 'success', animated: false },
  ],
  settings: { autoAdvance: false, requireConfirmation: false },
  projects: [],
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  favorite: false,
};

describe('useWorkflowExecution', () => {
  describe('initialization', () => {
    it('should start with null execution', () => {
      const { result } = renderHook(() => useWorkflowExecution(mockWorkflow));

      expect(result.current.execution).toBeNull();
    });

    it('should provide startExecution function', () => {
      const { result } = renderHook(() => useWorkflowExecution(mockWorkflow));

      expect(typeof result.current.startExecution).toBe('function');
    });
  });

  describe('startExecution', () => {
    it('should initialize execution with first node', () => {
      const { result } = renderHook(() => useWorkflowExecution(mockWorkflow));

      act(() => {
        result.current.startExecution();
      });

      expect(result.current.execution).not.toBeNull();
      expect(result.current.execution.workflowId).toBe(1);
      expect(result.current.execution.currentNodeId).toBe('node-1'); // First node after start
      expect(result.current.execution.history).toEqual([]);
    });

    it('should set startedAt timestamp', () => {
      const { result } = renderHook(() => useWorkflowExecution(mockWorkflow));

      act(() => {
        result.current.startExecution();
      });

      expect(result.current.execution.startedAt).toBeTruthy();
    });

    it('should handle workflow without start node', () => {
      const workflowNoStart = {
        ...mockWorkflow,
        nodes: mockWorkflow.nodes.filter(n => n.type !== 'start'),
        edges: mockWorkflow.edges.filter(e => e.source !== 'node-start'),
      };

      const { result } = renderHook(() => useWorkflowExecution(workflowNoStart));

      act(() => {
        result.current.startExecution();
      });

      expect(result.current.execution).toBeNull();
    });
  });

  describe('advanceToNext', () => {
    it('should advance to next node via success edge', () => {
      const { result } = renderHook(() => useWorkflowExecution(mockWorkflow));

      act(() => {
        result.current.startExecution();
      });

      expect(result.current.execution.currentNodeId).toBe('node-1');

      act(() => {
        result.current.advanceToNext('success');
      });

      expect(result.current.execution.currentNodeId).toBe('node-2');
    });

    it('should fallback to default edge if no success edge', () => {
      const workflowWithDefault = {
        ...mockWorkflow,
        edges: [
          { id: 'edge-1', source: 'node-start', target: 'node-1', type: 'default', animated: false },
          { id: 'edge-2', source: 'node-1', target: 'node-2', type: 'default', animated: false },
        ],
      };

      const { result } = renderHook(() => useWorkflowExecution(workflowWithDefault));

      act(() => {
        result.current.startExecution();
      });

      act(() => {
        result.current.advanceToNext('success');
      });

      expect(result.current.execution.currentNodeId).toBe('node-2');
    });

    it('should handle failure edge', () => {
      const workflowWithFailure = {
        ...mockWorkflow,
        nodes: [
          ...mockWorkflow.nodes,
          {
            id: 'node-retry',
            type: 'command',
            label: 'Retry',
            position: { x: 150, y: 100 },
            status: 'pending',
            metadata: { retryCount: 0 },
          },
        ],
        edges: [
          { id: 'edge-1', source: 'node-start', target: 'node-1', type: 'default', animated: false },
          { id: 'edge-2', source: 'node-1', target: 'node-2', type: 'success', animated: false },
          { id: 'edge-3', source: 'node-1', target: 'node-retry', type: 'failure', animated: false },
        ],
      };

      const { result } = renderHook(() => useWorkflowExecution(workflowWithFailure));

      act(() => {
        result.current.startExecution();
      });

      act(() => {
        result.current.advanceToNext('failure');
      });

      expect(result.current.execution.currentNodeId).toBe('node-retry');
    });

    it('should not advance if no matching edge found', () => {
      const { result } = renderHook(() => useWorkflowExecution(mockWorkflow));

      act(() => {
        result.current.startExecution();
      });

      const beforeNodeId = result.current.execution.currentNodeId;

      act(() => {
        result.current.advanceToNext('nonexistent');
      });

      expect(result.current.execution.currentNodeId).toBe(beforeNodeId);
    });
  });

  describe('markStepComplete', () => {
    it('should add entry to history', () => {
      const { result } = renderHook(() => useWorkflowExecution(mockWorkflow));

      act(() => {
        result.current.startExecution();
      });

      act(() => {
        result.current.markStepComplete('node-1', 'completed', 'Test output');
      });

      expect(result.current.execution.history).toHaveLength(1);
      expect(result.current.execution.history[0]).toMatchObject({
        nodeId: 'node-1',
        status: 'completed',
        output: 'Test output',
      });
    });

    it('should set start and end timestamps', () => {
      const { result } = renderHook(() => useWorkflowExecution(mockWorkflow));

      act(() => {
        result.current.startExecution();
      });

      act(() => {
        result.current.markStepComplete('node-1', 'completed');
      });

      const historyEntry = result.current.execution.history[0];
      expect(historyEntry.startTime).toBeTruthy();
      expect(historyEntry.endTime).toBeTruthy();
    });

    it('should support multiple history entries', () => {
      const { result } = renderHook(() => useWorkflowExecution(mockWorkflow));

      act(() => {
        result.current.startExecution();
      });

      act(() => {
        result.current.markStepComplete('node-1', 'completed');
      });

      act(() => {
        result.current.advanceToNext('success');
      });

      act(() => {
        result.current.markStepComplete('node-2', 'completed');
      });

      expect(result.current.execution.history).toHaveLength(2);
      expect(result.current.execution.history[0].nodeId).toBe('node-1');
      expect(result.current.execution.history[1].nodeId).toBe('node-2');
    });
  });

  describe('loopBackTo', () => {
    it('should set currentNodeId to specified node', () => {
      const { result } = renderHook(() => useWorkflowExecution(mockWorkflow));

      act(() => {
        result.current.startExecution();
      });

      act(() => {
        result.current.advanceToNext('success'); // Move to node-2
      });

      expect(result.current.execution.currentNodeId).toBe('node-2');

      act(() => {
        result.current.loopBackTo('node-1');
      });

      expect(result.current.execution.currentNodeId).toBe('node-1');
    });

    it('should allow looping back multiple times', () => {
      const { result } = renderHook(() => useWorkflowExecution(mockWorkflow));

      act(() => {
        result.current.startExecution();
      });

      act(() => {
        result.current.advanceToNext('success'); // node-2
      });

      act(() => {
        result.current.loopBackTo('node-1'); // Back to node-1
      });

      act(() => {
        result.current.advanceToNext('success'); // node-2 again
      });

      expect(result.current.execution.currentNodeId).toBe('node-2');
    });
  });

  describe('abortExecution', () => {
    it('should reset execution to null', () => {
      const { result } = renderHook(() => useWorkflowExecution(mockWorkflow));

      act(() => {
        result.current.startExecution();
      });

      expect(result.current.execution).not.toBeNull();

      act(() => {
        result.current.abortExecution();
      });

      expect(result.current.execution).toBeNull();
    });

    it('should allow starting new execution after abort', () => {
      const { result } = renderHook(() => useWorkflowExecution(mockWorkflow));

      act(() => {
        result.current.startExecution();
        result.current.abortExecution();
        result.current.startExecution();
      });

      expect(result.current.execution).not.toBeNull();
      expect(result.current.execution.currentNodeId).toBe('node-1');
    });
  });

  describe('edge cases', () => {
    it('should handle null workflow', () => {
      const { result } = renderHook(() => useWorkflowExecution(null));

      act(() => {
        result.current.startExecution();
      });

      expect(result.current.execution).toBeNull();
    });

    it('should handle workflow with no edges', () => {
      const workflowNoEdges = {
        ...mockWorkflow,
        edges: [],
      };

      const { result } = renderHook(() => useWorkflowExecution(workflowNoEdges));

      act(() => {
        result.current.startExecution();
      });

      expect(result.current.execution).toBeNull();
    });
  });
});
