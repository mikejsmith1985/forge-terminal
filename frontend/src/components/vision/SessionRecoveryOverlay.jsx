import React, { useState, useEffect } from 'react';
import { RefreshCw, Clock, GitBranch, MessageSquare, Play, Eye, X } from 'lucide-react';
import './vision.css';

/**
 * SessionRecoveryOverlay - Vision overlay for recovering previous sessions
 * 
 * Appears when:
 * 1. User enters a directory with recoverable sessions
 * 2. Triggered by `/restore` command
 * 3. On startup if incomplete sessions exist
 * 
 * Integrates with the Vision system for keyboard navigation
 */
export default function SessionRecoveryOverlay({ 
  data, 
  onAction, 
  onDismiss, 
  selectedIndex = 0 
}) {
  const { sessions, projectName, triggerReason } = data;
  const [previewSession, setPreviewSession] = useState(null);
  const [isRestoring, setIsRestoring] = useState(false);

  // Format time ago
  const formatTimeAgo = (timestamp) => {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  // Get provider icon
  const getProviderIcon = (provider) => {
    switch (provider?.toLowerCase()) {
      case 'github-copilot':
      case 'copilot':
        return '🤖';
      case 'claude':
        return '🧠';
      case 'aider':
        return '🔧';
      default:
        return '💬';
    }
  };

  // Handle restore action
  const handleRestore = async (session, provider) => {
    setIsRestoring(true);
    try {
      // Fetch full restore context
      const response = await fetch(`/api/am/restore/context/${session.conversationId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch restore context');
      }
      const context = await response.json();

      // Build the restore command
      // NOTE: Use standalone "copilot" not "gh copilot"
      let command;
      if (provider === 'copilot') {
        // Just launch copilot - user can paste the context themselves
        // The copilot CLI doesn't support command-line prompts
        command = 'copilot';
      } else if (provider === 'claude') {
        command = `claude "${context.restorePrompt}"`;
      }

      // Inject command into terminal
      onAction({
        type: 'INJECT_COMMAND',
        command: command,
        context: context.fullContext
      });

      onDismiss();
    } catch (err) {
      console.error('[SessionRecovery] Restore failed:', err);
      onAction({
        type: 'SHOW_ERROR',
        message: `Failed to restore session: ${err.message}`
      });
    } finally {
      setIsRestoring(false);
    }
  };

  // Handle preview action
  const handlePreview = async (session) => {
    try {
      const response = await fetch(`/api/am/restore/context/${session.conversationId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch context');
      }
      const context = await response.json();
      setPreviewSession({ ...session, context });
    } catch (err) {
      console.error('[SessionRecovery] Preview failed:', err);
    }
  };

  // If no sessions, show empty state
  if (!sessions || sessions.length === 0) {
    return (
      <div className="vision-overlay session-recovery-overlay">
        <div className="vision-overlay-header">
          <div className="vision-overlay-title">
            <RefreshCw size={18} />
            <span>Session Recovery</span>
          </div>
          <button className="vision-close-btn" onClick={onDismiss}>
            <X size={16} />
          </button>
        </div>
        <div className="vision-overlay-content" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <p style={{ color: '#888' }}>No recoverable sessions found</p>
          {projectName && (
            <p style={{ color: '#666', fontSize: '0.85em', marginTop: '8px' }}>
              for {projectName}
            </p>
          )}
        </div>
        <div className="vision-overlay-footer">
          <span className="vision-hint">ESC Close</span>
        </div>
      </div>
    );
  }

  // Preview mode
  if (previewSession) {
    return (
      <div className="vision-overlay session-recovery-overlay preview-mode">
        <div className="vision-overlay-header">
          <div className="vision-overlay-title">
            <button 
              className="back-btn"
              onClick={() => setPreviewSession(null)}
              style={{
                background: 'none',
                border: 'none',
                color: '#888',
                cursor: 'pointer',
                marginRight: '8px',
                padding: '4px'
              }}
            >
              ← Back
            </button>
            <span>Session Preview</span>
          </div>
          <button className="vision-close-btn" onClick={onDismiss}>
            <X size={16} />
          </button>
        </div>

        <div className="vision-overlay-content" style={{ maxHeight: '400px', overflowY: 'auto' }}>
          {/* Session Summary */}
          <div style={{
            background: '#1a2e1a',
            border: '1px solid #22c55e',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '1.2em' }}>{getProviderIcon(previewSession.provider)}</span>
              <strong style={{ color: '#22c55e' }}>{previewSession.context?.summary || 'Session'}</strong>
            </div>
            <div style={{ color: '#86efac', fontSize: '0.85em' }}>
              <span>{previewSession.context?.turnCount || 0} exchanges</span>
              <span style={{ margin: '0 8px' }}>•</span>
              <span>{formatTimeAgo(previewSession.lastActivity)}</span>
            </div>
          </div>

          {/* Last Exchange */}
          {previewSession.context?.lastUserPrompt && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ color: '#888', fontSize: '0.8em', marginBottom: '4px' }}>Last User Prompt:</div>
              <div style={{
                background: '#262626',
                border: '1px solid #333',
                borderRadius: '6px',
                padding: '10px',
                color: '#e5e5e5',
                fontSize: '0.9em',
                whiteSpace: 'pre-wrap'
              }}>
                {previewSession.context.lastUserPrompt}
              </div>
            </div>
          )}

          {previewSession.context?.lastAssistantMsg && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ color: '#888', fontSize: '0.8em', marginBottom: '4px' }}>Last Assistant Response:</div>
              <div style={{
                background: '#1a1a2e',
                border: '1px solid #4338ca',
                borderRadius: '6px',
                padding: '10px',
                color: '#c7d2fe',
                fontSize: '0.9em',
                whiteSpace: 'pre-wrap',
                maxHeight: '150px',
                overflowY: 'auto'
              }}>
                {previewSession.context.lastAssistantMsg}
              </div>
            </div>
          )}

          {/* Suggested Restore Prompt */}
          {previewSession.context?.restorePrompt && (
            <div>
              <div style={{ color: '#888', fontSize: '0.8em', marginBottom: '4px' }}>
                Restore prompt (will be sent to AI):
              </div>
              <div style={{
                background: '#1e293b',
                border: '1px solid #3b82f6',
                borderRadius: '6px',
                padding: '10px',
                color: '#93c5fd',
                fontSize: '0.85em',
                fontStyle: 'italic'
              }}>
                {previewSession.context.restorePrompt}
              </div>
            </div>
          )}
        </div>

        <div className="vision-overlay-footer" style={{ 
          display: 'flex', 
          gap: '10px', 
          justifyContent: 'center',
          padding: '12px'
        }}>
          <button
            className="vision-action-btn"
            data-action="true"
            onClick={() => handleRestore(previewSession, 'copilot')}
            disabled={isRestoring}
            style={{
              background: '#22c55e',
              color: '#000',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '6px',
              fontWeight: 500,
              cursor: 'pointer',
              opacity: isRestoring ? 0.6 : 1
            }}
          >
            {isRestoring ? '...' : '🤖 Restore with Copilot'}
          </button>
          <button
            className="vision-action-btn"
            data-action="true"
            onClick={() => handleRestore(previewSession, 'claude')}
            disabled={isRestoring}
            style={{
              background: '#8b5cf6',
              color: '#fff',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '6px',
              fontWeight: 500,
              cursor: 'pointer',
              opacity: isRestoring ? 0.6 : 1
            }}
          >
            {isRestoring ? '...' : '🧠 Restore with Claude'}
          </button>
        </div>
      </div>
    );
  }

  // Main session list
  return (
    <div className="vision-overlay session-recovery-overlay">
      <div className="vision-overlay-header">
        <div className="vision-overlay-title">
          <RefreshCw size={18} />
          <span>Session Recovery</span>
          {projectName && (
            <span className="vision-branch-name">{projectName}</span>
          )}
        </div>
        <button className="vision-close-btn" onClick={onDismiss}>
          <X size={16} />
        </button>
      </div>

      {/* Trigger reason context */}
      {triggerReason && (
        <div style={{
          background: '#1e293b',
          borderBottom: '1px solid #334155',
          padding: '8px 16px',
          fontSize: '0.85em',
          color: '#94a3b8'
        }}>
          {triggerReason === 'directory_change' && '📂 Detected recoverable sessions for this project'}
          {triggerReason === 'startup' && '👋 Welcome back! You have unfinished sessions'}
          {triggerReason === 'manual' && '🔍 Available sessions to restore'}
        </div>
      )}

      <div className="vision-overlay-content" style={{ maxHeight: '350px', overflowY: 'auto' }}>
        {sessions.map((session, idx) => (
          <div 
            key={session.conversationId} 
            className={`session-item ${idx === selectedIndex ? 'selected' : ''}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              padding: '12px',
              background: idx === selectedIndex ? '#1a2e1a' : '#1a1a1a',
              border: idx === selectedIndex ? '1px solid #22c55e' : '1px solid #333',
              borderRadius: '8px',
              marginBottom: '10px'
            }}
          >
            {/* Session header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.3em' }}>{getProviderIcon(session.provider)}</span>
                <div>
                  <div style={{ fontWeight: 500, color: '#e5e5e5' }}>
                    {session.projectName || session.metadata?.workingDirectory?.split('/').pop() || 'Session'}
                  </div>
                  <div style={{ fontSize: '0.8em', color: '#888', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock size={12} />
                    {formatTimeAgo(session.lastActivity || session.startTime)}
                    {session.metadata?.gitBranch && (
                      <>
                        <span>•</span>
                        <GitBranch size={12} />
                        {session.metadata.gitBranch}
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ 
                background: session.wasInterrupted ? '#7f1d1d' : '#1e293b',
                border: session.wasInterrupted ? '1px solid #ef4444' : '1px solid #334155',
                color: session.wasInterrupted ? '#fca5a5' : '#94a3b8',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '0.75em'
              }}>
                {session.wasInterrupted ? 'Interrupted' : 'Incomplete'}
              </div>
            </div>

            {/* Session summary */}
            {session.summary && (
              <div style={{ 
                color: '#a3a3a3', 
                fontSize: '0.85em',
                paddingLeft: '34px'
              }}>
                {session.summary}
              </div>
            )}

            {/* Session stats */}
            <div style={{ 
              display: 'flex', 
              gap: '16px', 
              paddingLeft: '34px',
              fontSize: '0.8em',
              color: '#666'
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <MessageSquare size={12} />
                {session.turnCount || 0} turns
              </span>
              <span>{session.provider}</span>
            </div>

            {/* Actions */}
            <div style={{ 
              display: 'flex', 
              gap: '8px', 
              marginTop: '4px',
              paddingLeft: '34px'
            }}>
              <button
                className="vision-action-btn compact"
                data-action="true"
                onClick={() => handlePreview(session)}
                style={{
                  background: '#262626',
                  border: '1px solid #404040',
                  color: '#e5e5e5',
                  padding: '6px 12px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.85em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Eye size={14} />
                Preview
              </button>
              <button
                className="vision-action-btn compact"
                data-action="true"
                onClick={() => handleRestore(session, 'copilot')}
                disabled={isRestoring}
                style={{
                  background: '#166534',
                  border: 'none',
                  color: '#fff',
                  padding: '6px 12px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.85em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Play size={14} />
                Copilot
              </button>
              <button
                className="vision-action-btn compact"
                data-action="true"
                onClick={() => handleRestore(session, 'claude')}
                disabled={isRestoring}
                style={{
                  background: '#5b21b6',
                  border: 'none',
                  color: '#fff',
                  padding: '6px 12px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.85em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Play size={14} />
                Claude
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="vision-overlay-footer">
        <span className="vision-hint">↑↓ Navigate • Enter Select • 1-9 Quick • ESC Close</span>
      </div>
    </div>
  );
}
