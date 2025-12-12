import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * useSessionRecovery - Hook for detecting and managing recoverable sessions
 * 
 * Features:
 * 1. Auto-detect recoverable sessions for a project
 * 2. Track directory changes to trigger recovery prompts
 * 3. Provide methods to fetch and restore sessions
 * 
 * Usage:
 * const { 
 *   recoverableSessions, 
 *   hasRecoverableSessions,
 *   checkForRecoverableSessions,
 *   triggerRecoveryOverlay,
 *   restoreSession
 * } = useSessionRecovery({ projectPath, tabId, onShowOverlay });
 */
export function useSessionRecovery({ 
  projectPath, 
  tabId, 
  onShowOverlay, 
  onShowToast,
  enabled = true 
}) {
  const [recoverableSessions, setRecoverableSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastCheckedPath, setLastCheckedPath] = useState(null);
  const checkedPathsRef = useRef(new Set());

  // Fetch all recoverable sessions from API
  const fetchRecoverableSessions = useCallback(async () => {
    if (!enabled) return [];
    
    try {
      const response = await fetch('/api/am/restore/sessions');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      return data.sessions || [];
    } catch (err) {
      console.error('[useSessionRecovery] Failed to fetch sessions:', err);
      return [];
    }
  }, [enabled]);

  // Check for recoverable sessions matching the current project
  const checkForRecoverableSessions = useCallback(async (path) => {
    if (!enabled || !path) return [];

    setLoading(true);
    try {
      const allSessions = await fetchRecoverableSessions();
      
      // Filter sessions that match the current project path
      const projectName = path.split('/').filter(Boolean).pop();
      const matchingSessions = allSessions.filter(session => {
        const sessionProject = session.metadata?.workingDirectory?.split('/').pop();
        return sessionProject === projectName || 
               session.metadata?.workingDirectory?.includes(path);
      });

      setRecoverableSessions(matchingSessions);
      setLastCheckedPath(path);
      return matchingSessions;
    } catch (err) {
      console.error('[useSessionRecovery] Check failed:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, [enabled, fetchRecoverableSessions]);

  // Trigger the recovery overlay with current sessions
  const triggerRecoveryOverlay = useCallback((reason = 'manual') => {
    if (!onShowOverlay || recoverableSessions.length === 0) return;

    const projectName = projectPath?.split('/').filter(Boolean).pop();
    
    onShowOverlay({
      type: 'SESSION_RECOVERY',
      payload: {
        sessions: recoverableSessions,
        projectName,
        triggerReason: reason
      }
    });
  }, [onShowOverlay, recoverableSessions, projectPath]);

  // Restore a specific session with chosen provider
  const restoreSession = useCallback(async (conversationId, provider) => {
    try {
      // Fetch restore context
      const response = await fetch(`/api/am/restore/context/${conversationId}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const context = await response.json();

      // Build restore command based on provider
      // NOTE: Use standalone "copilot" not "gh copilot"
      let command;
      const prompt = context.restorePrompt || 'Continue from where we left off';
      
      if (provider === 'copilot') {
        // Copilot CLI doesn't support command-line prompts, just launch it
        command = 'copilot';
      } else if (provider === 'claude') {
        command = `claude "${prompt.replace(/"/g, '\\"')}"`;
      } else {
        command = prompt;
      }

      return {
        success: true,
        command,
        context,
        provider
      };
    } catch (err) {
      console.error('[useSessionRecovery] Restore failed:', err);
      return {
        success: false,
        error: err.message
      };
    }
  }, []);

  // Auto-check when project path changes
  useEffect(() => {
    if (!enabled || !projectPath) return;
    
    // Normalize path for comparison
    const normalizedPath = projectPath.replace(/\/+$/, '');
    
    // Skip if we've already checked this path in this session
    if (checkedPathsRef.current.has(normalizedPath)) {
      return;
    }

    // Mark as checked
    checkedPathsRef.current.add(normalizedPath);

    // Check for sessions
    const checkAndNotify = async () => {
      const sessions = await checkForRecoverableSessions(normalizedPath);
      
      if (sessions.length > 0 && onShowToast) {
        onShowToast({
          type: 'info',
          message: `${sessions.length} recoverable session${sessions.length > 1 ? 's' : ''} found`,
          action: {
            label: 'View',
            onClick: () => triggerRecoveryOverlay('directory_change')
          },
          duration: 8000
        });
      }
    };

    // Delay check slightly to avoid spam on rapid directory changes
    const timer = setTimeout(checkAndNotify, 500);
    return () => clearTimeout(timer);
  }, [projectPath, enabled, checkForRecoverableSessions, onShowToast, triggerRecoveryOverlay]);

  // Check on initial mount for startup notification
  useEffect(() => {
    if (!enabled) return;

    const checkOnStartup = async () => {
      const allSessions = await fetchRecoverableSessions();
      if (allSessions.length > 0) {
        setRecoverableSessions(allSessions);
        
        // Show startup toast after a brief delay
        setTimeout(() => {
          if (onShowToast) {
            onShowToast({
              type: 'info',
              message: `${allSessions.length} session${allSessions.length > 1 ? 's' : ''} can be recovered`,
              action: {
                label: 'Restore',
                onClick: () => triggerRecoveryOverlay('startup')
              },
              duration: 10000
            });
          }
        }, 2000);
      }
    };

    checkOnStartup();
  }, [enabled, fetchRecoverableSessions, onShowToast, triggerRecoveryOverlay]);

  return {
    recoverableSessions,
    hasRecoverableSessions: recoverableSessions.length > 0,
    loading,
    lastCheckedPath,
    checkForRecoverableSessions,
    triggerRecoveryOverlay,
    restoreSession,
    fetchAllSessions: fetchRecoverableSessions
  };
}

export default useSessionRecovery;
