import { useState, useEffect, useCallback } from 'react';

/**
 * useJira — manages Jira config + all API operations.
 * All Jira credentials are proxied through the Go backend; the browser
 * never touches them directly.
 */
export function useJira() {
  const [jiraConfig, setJiraConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // ── Config ──────────────────────────────────────────────────────────────────

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/jira/config');
      if (!res.ok) return;
      const cfg = await res.json();
      setJiraConfig(cfg);
    } catch (e) {
      console.error('[Jira] loadConfig failed:', e);
    }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const saveConfig = useCallback(async (cfg) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/jira/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      if (!res.ok) throw new Error('Failed to save config');
      await loadConfig();
      return { success: true };
    } catch (e) {
      setError(e.message);
      return { success: false, error: e.message };
    } finally {
      setIsLoading(false);
    }
  }, [loadConfig]);

  const verifyConfig = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/jira/config/verify', { method: 'POST' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Verification failed');
      return { success: true, projectCount: data.projectCount };
    } catch (e) {
      setError(e.message);
      return { success: false, error: e.message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Issues ───────────────────────────────────────────────────────────────────

  const fetchIssue = useCallback(async (key) => {
    try {
      const res = await fetch(`/api/jira/issue/${encodeURIComponent(key)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.error(`[Jira] fetchIssue(${key}) failed:`, e);
      return null;
    }
  }, []);

  const createIssue = useCallback(async (fields) => {
    setIsLoading(true);
    setError(null);
    try {
      const body = { fields };
      const res = await fetch('/api/jira/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      return await res.json();
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateIssue = useCallback(async (key, fields) => {
    try {
      const res = await fetch(`/api/jira/issue/${encodeURIComponent(key)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      return res.ok;
    } catch (e) {
      console.error(`[Jira] updateIssue(${key}) failed:`, e);
      return false;
    }
  }, []);

  const addComment = useCallback(async (key, body) => {
    try {
      const res = await fetch(`/api/jira/issue/${encodeURIComponent(key)}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.error(`[Jira] addComment(${key}) failed:`, e);
      return null;
    }
  }, []);

  const getTransitions = useCallback(async (key) => {
    try {
      const res = await fetch(`/api/jira/issue/${encodeURIComponent(key)}/transitions`);
      if (!res.ok) return [];
      return await res.json();
    } catch (e) {
      console.error(`[Jira] getTransitions(${key}) failed:`, e);
      return [];
    }
  }, []);

  const doTransition = useCallback(async (key, transitionId) => {
    try {
      const res = await fetch(`/api/jira/issue/${encodeURIComponent(key)}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transitionId }),
      });
      return res.ok;
    } catch (e) {
      console.error(`[Jira] doTransition(${key}) failed:`, e);
      return false;
    }
  }, []);

  // ── Projects & Search ─────────────────────────────────────────────────────

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/jira/projects');
      if (!res.ok) return [];
      return await res.json();
    } catch (e) {
      console.error('[Jira] fetchProjects failed:', e);
      return [];
    }
  }, []);

  const searchIssues = useCallback(async (jql) => {
    try {
      const res = await fetch(`/api/jira/search?jql=${encodeURIComponent(jql)}`);
      if (!res.ok) return { issues: [], total: 0 };
      return await res.json();
    } catch (e) {
      console.error('[Jira] searchIssues failed:', e);
      return { issues: [], total: 0 };
    }
  }, []);

  // ── Git Suggestions ──────────────────────────────────────────────────────

  const suggestBranch = useCallback(async (key) => {
    try {
      const res = await fetch(`/api/jira/suggest/branch?key=${encodeURIComponent(key)}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.suggestion;
    } catch (e) {
      console.error(`[Jira] suggestBranch(${key}) failed:`, e);
      return null;
    }
  }, []);

  const suggestPR = useCallback(async (key) => {
    try {
      const res = await fetch(`/api/jira/suggest/pr?key=${encodeURIComponent(key)}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.suggestion;
    } catch (e) {
      console.error(`[Jira] suggestPR(${key}) failed:`, e);
      return null;
    }
  }, []);

  // ── Derived state ─────────────────────────────────────────────────────────

  const isConfigured = Boolean(jiraConfig?.baseUrl && jiraConfig?.apiToken && jiraConfig.apiToken !== '');

  return {
    jiraConfig,
    isConfigured,
    isLoading,
    error,
    loadConfig,
    saveConfig,
    verifyConfig,
    fetchIssue,
    createIssue,
    updateIssue,
    addComment,
    getTransitions,
    doTransition,
    fetchProjects,
    searchIssues,
    suggestBranch,
    suggestPR,
  };
}
