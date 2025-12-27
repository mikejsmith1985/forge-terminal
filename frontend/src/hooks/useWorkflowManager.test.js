import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useWorkflowManager } from './useWorkflowManager';

// Mock fetch globally
global.fetch = vi.fn();

describe('useWorkflowManager', () => {
  beforeEach(() => {
    // Reset fetch mock before each test
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should start with loading state', () => {
      fetch.mockImplementationOnce(() => 
        new Promise(() => {}) // Never resolves
      );

      const { result } = renderHook(() => useWorkflowManager());

      expect(result.current.loading).toBe(true);
      expect(result.current.workflows).toEqual([]);
      expect(result.current.error).toBeNull();
    });

    it('should load workflows on mount', async () => {
      const mockWorkflows = [
        {
          id: 1,
          name: 'Test Workflow',
          description: 'Test',
          nodes: [],
          edges: [],
          settings: { autoAdvance: false, requireConfirmation: true },
          projects: [],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          favorite: false,
        },
      ];

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockWorkflows,
      });

      const { result } = renderHook(() => useWorkflowManager());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.workflows).toEqual(mockWorkflows);
      expect(result.current.error).toBeNull();
    });

    it('should handle load error', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const { result } = renderHook(() => useWorkflowManager());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.workflows).toEqual([]);
      expect(result.current.error).toBeTruthy();
    });

    it('should handle network error', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useWorkflowManager());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.workflows).toEqual([]);
      expect(result.current.error).toBe('Network error');
    });
  });

  describe('createWorkflow', () => {
    it('should create a new workflow', async () => {
      // Initial load
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const { result } = renderHook(() => useWorkflowManager());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Create workflow
      const newWorkflow = {
        name: 'New Workflow',
        description: 'Test',
        nodes: [],
        edges: [],
        settings: { autoAdvance: false, requireConfirmation: false },
        projects: ['test-project'],
        favorite: false,
      };

      fetch.mockResolvedValueOnce({
        ok: true,
      });

      let createResult;
      await act(async () => {
        createResult = await result.current.createWorkflow(newWorkflow);
      });

      expect(createResult.success).toBe(true);
      expect(createResult.workflow.id).toBe(1);
      expect(createResult.workflow.name).toBe('New Workflow');
      expect(result.current.workflows).toHaveLength(1);
    });

    it('should auto-increment workflow IDs', async () => {
      // Initial load with existing workflows
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: 1, name: 'First', nodes: [], edges: [], settings: {}, projects: [] },
          { id: 3, name: 'Third', nodes: [], edges: [], settings: {}, projects: [] },
        ],
      });

      const { result } = renderHook(() => useWorkflowManager());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Create new workflow - should get ID 4 (max + 1)
      fetch.mockResolvedValueOnce({ ok: true });

      let createResult;
      await act(async () => {
        createResult = await result.current.createWorkflow({
          name: 'New',
          nodes: [],
          edges: [],
          settings: {},
          projects: [],
        });
      });

      expect(createResult.workflow.id).toBe(4);
    });

    it('should set timestamps on create', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const { result } = renderHook(() => useWorkflowManager());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      fetch.mockResolvedValueOnce({ ok: true });

      let createResult;
      await act(async () => {
        createResult = await result.current.createWorkflow({
          name: 'Test',
          nodes: [],
          edges: [],
          settings: {},
          projects: [],
        });
      });

      expect(createResult.workflow.createdAt).toBeTruthy();
      expect(createResult.workflow.updatedAt).toBeTruthy();
    });

    it('should handle create error', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const { result } = renderHook(() => useWorkflowManager());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      let createResult;
      await act(async () => {
        createResult = await result.current.createWorkflow({
          name: 'Test',
          nodes: [],
          edges: [],
          settings: {},
          projects: [],
        });
      });

      expect(createResult.success).toBe(false);
      expect(createResult.error).toBeTruthy();
    });
  });

  describe('updateWorkflow', () => {
    it('should update an existing workflow', async () => {
      const initialWorkflows = [
        {
          id: 1,
          name: 'Original',
          description: 'Original description',
          nodes: [],
          edges: [],
          settings: {},
          projects: [],
        },
      ];

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => initialWorkflows,
      });

      const { result } = renderHook(() => useWorkflowManager());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Update workflow
      fetch.mockResolvedValueOnce({ ok: true });

      let updateResult;
      await act(async () => {
        updateResult = await result.current.updateWorkflow(1, {
          name: 'Updated',
          description: 'New description',
        });
      });

      expect(updateResult.success).toBe(true);
      expect(result.current.workflows[0].name).toBe('Updated');
      expect(result.current.workflows[0].description).toBe('New description');
    });

    it('should update updatedAt timestamp', async () => {
      const oldTimestamp = '2024-01-01T00:00:00Z';
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 1,
            name: 'Test',
            nodes: [],
            edges: [],
            settings: {},
            projects: [],
            createdAt: oldTimestamp,
            updatedAt: oldTimestamp,
          },
        ],
      });

      const { result } = renderHook(() => useWorkflowManager());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      fetch.mockResolvedValueOnce({ ok: true });

      await act(async () => {
        await result.current.updateWorkflow(1, { name: 'Updated' });
      });

      expect(result.current.workflows[0].updatedAt).not.toBe(oldTimestamp);
    });

    it('should handle update error', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: 1, name: 'Test', nodes: [], edges: [], settings: {}, projects: [] },
        ],
      });

      const { result } = renderHook(() => useWorkflowManager());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      let updateResult;
      await act(async () => {
        updateResult = await result.current.updateWorkflow(1, { name: 'Updated' });
      });

      expect(updateResult.success).toBe(false);
      expect(updateResult.error).toBeTruthy();
    });
  });

  describe('deleteWorkflow', () => {
    it('should delete a workflow', async () => {
      const initialWorkflows = [
        { id: 1, name: 'First', nodes: [], edges: [], settings: {}, projects: [] },
        { id: 2, name: 'Second', nodes: [], edges: [], settings: {}, projects: [] },
      ];

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => initialWorkflows,
      });

      const { result } = renderHook(() => useWorkflowManager());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Delete workflow
      fetch.mockResolvedValueOnce({ ok: true });

      let deleteResult;
      await act(async () => {
        deleteResult = await result.current.deleteWorkflow(1);
      });

      expect(deleteResult.success).toBe(true);
      expect(result.current.workflows).toHaveLength(1);
      expect(result.current.workflows[0].id).toBe(2);
    });

    it('should handle delete error', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: 1, name: 'Test', nodes: [], edges: [], settings: {}, projects: [] },
        ],
      });

      const { result } = renderHook(() => useWorkflowManager());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      let deleteResult;
      await act(async () => {
        deleteResult = await result.current.deleteWorkflow(1);
      });

      expect(deleteResult.success).toBe(false);
      expect(deleteResult.error).toBeTruthy();
      expect(result.current.workflows).toHaveLength(1); // Not deleted
    });
  });

  describe('loadWorkflows', () => {
    it('should reload workflows', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const { result } = renderHook(() => useWorkflowManager());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Reload
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: 1, name: 'New', nodes: [], edges: [], settings: {}, projects: [] },
        ],
      });

      await act(async () => {
        await result.current.loadWorkflows();
      });

      expect(result.current.workflows).toHaveLength(1);
      expect(result.current.workflows[0].name).toBe('New');
    });
  });
});
