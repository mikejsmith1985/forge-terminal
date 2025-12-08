import React, { useState } from 'react';
import { X, Clock, Code2, MessageSquare } from 'lucide-react';
import './SessionRestoreModal.css';

/**
 * SessionRestoreModal - Interactive modal for restoring sessions with full context
 * Shows multiple sessions in a workspace with last command, provider, and duration
 * Allows users to choose which session to restore and with which AI provider
 */
export function SessionRestoreModal({
  workspace,
  sessions,
  onRestore,
  onDismiss,
}) {
  const [restoringSessionId, setRestoringSessionId] = useState(null);

  const handleRestore = async (session, provider) => {
    setRestoringSessionId(session.sessionId);
    try {
      await onRestore(session, provider);
    } finally {
      setRestoringSessionId(null);
    }
  };

  const formatTimeAgo = (date) => {
    const now = new Date();
    const diffMs = now - new Date(date);
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  if (!sessions || sessions.length === 0) {
    return (
      <div className="modal session-restore-modal">
        <div className="modal-content">
          <div className="modal-header">
            <h2>Session Restore</h2>
            <button
              className="modal-close"
              onClick={onDismiss}
              title="Close"
              aria-label="Close dialog"
            >
              ×
            </button>
          </div>
          <div className="modal-body">
            <p className="no-sessions">No sessions available for {workspace}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal session-restore-modal">
      <div className="modal-content">
        <div className="modal-header">
          <div className="header-title">
            <h2>Restore Session</h2>
            <p className="workspace-path">{workspace}</p>
          </div>
          <button
            className="modal-close"
            onClick={onDismiss}
            title="Close"
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>

        <div className="modal-body">
          <p className="session-count">
            Found {sessions.length} recoverable session{sessions.length !== 1 ? 's' : ''}
          </p>

          <div className="sessions-list">
            {sessions.map((session) => (
              <div key={session.sessionId} className="session-item">
                <div className="session-header">
                  <div className="session-info">
                    <h3 className="session-name">{session.tabName}</h3>
                    <p className="time-ago">{formatTimeAgo(session.lastUpdated)}</p>
                  </div>
                  <div className="session-meta">
                    <span className="provider-badge">{session.provider}</span>
                  </div>
                </div>

                <div className="session-details">
                  <div className="detail-row">
                    <Code2 size={14} />
                    <span className="detail-label">Last command:</span>
                    <code className="detail-value">
                      {session.lastCommand || 'N/A'}
                    </code>
                  </div>

                  <div className="detail-row">
                    <MessageSquare size={14} />
                    <span className="detail-label">Conversations:</span>
                    <span className="detail-value">{session.activeCount}</span>
                  </div>

                  <div className="detail-row">
                    <Clock size={14} />
                    <span className="detail-label">Duration:</span>
                    <span className="detail-value">{session.durationMinutes} min</span>
                  </div>
                </div>

                <div className="session-actions">
                  <button
                    className="btn-restore btn-copilot"
                    onClick={() => handleRestore(session, 'copilot')}
                    disabled={restoringSessionId !== null}
                    title="Restore this session with GitHub Copilot CLI"
                  >
                    {restoringSessionId === session.sessionId
                      ? 'Restoring...'
                      : 'Restore with Copilot'}
                  </button>
                  <button
                    className="btn-restore btn-claude"
                    onClick={() => handleRestore(session, 'claude')}
                    disabled={restoringSessionId !== null}
                    title="Restore this session with Claude CLI"
                  >
                    {restoringSessionId === session.sessionId
                      ? 'Restoring...'
                      : 'Restore with Claude'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-footer">
          <p className="helper-text">
            Select a session above to restore it with your preferred AI provider
          </p>
        </div>
      </div>
    </div>
  );
}

export default SessionRestoreModal;
