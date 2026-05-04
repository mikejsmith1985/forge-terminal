/**
 * useEZTestTasks.js — React hook for polling the Forge MCP task broker.
 *
 * Fetches all in-flight and completed tasks from /api/mcp/ui-tasks every
 * POLLING_INTERVAL_MS while the panel is open. Provides a computed badge
 * count (active tasks only) so the TabBar button can alert the user without
 * them opening the panel.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ── Constants ────────────────────────────────────────────────────────────────

/** How often to re-fetch the task list when the panel is open (5 seconds). */
const POLLING_INTERVAL_MS = 5000;

/** Task statuses that count toward the "active" badge on the TabBar button. */
const ACTIVE_STATUSES = new Set(['pending', 'running']);

// ── Hook ────────────────────────────────────────────────────────────────────

/**
 * Polls /api/mcp/ui-tasks while the panel is open.
 *
 * @param {boolean} isPanelOpen - Whether the EZTest panel is currently visible.
 *   Polling starts when true and stops when false to avoid unnecessary requests.
 * @returns {{ tasks: Array, activeBadgeCount: number, isLoading: boolean, error: string|null, refresh: Function }}
 */
export function useEZTestTasks(isPanelOpen) {
  const [tasks, setTasks] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Keep a stable reference to the fetch function — avoids re-creating the
  // polling interval on every render while still reading the latest state.
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const fetchTasks = useCallback(async () => {
    if (!isMountedRef.current) return;

    try {
      const response = await fetch('/api/mcp/ui-tasks');
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
      const responseBody = await response.json();
      if (isMountedRef.current) {
        setTasks(responseBody.tasks ?? []);
        setError(null);
      }
    } catch (fetchError) {
      if (isMountedRef.current) {
        setError(fetchError.message);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  // Start polling when the panel opens; stop when it closes. Also do an
  // immediate fetch so the panel shows data without waiting for the first tick.
  useEffect(() => {
    if (!isPanelOpen) return;

    setIsLoading(true);
    fetchTasks();

    const pollingInterval = setInterval(fetchTasks, POLLING_INTERVAL_MS);
    return () => clearInterval(pollingInterval);
  }, [isPanelOpen, fetchTasks]);

  // Badge count: only pending + running tasks matter for the alert indicator.
  const activeBadgeCount = tasks.filter(task => ACTIVE_STATUSES.has(task.status)).length;

  return {
    tasks,
    activeBadgeCount,
    isLoading,
    error,
    refresh: fetchTasks,
  };
}
