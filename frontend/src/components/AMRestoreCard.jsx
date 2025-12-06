import React, { useState } from 'react';
import { RefreshCw, X, FileText } from 'lucide-react';

/**
 * AMRestoreCard - Shows when recoverable AM sessions are found
 * Allows user to restore previous session context with AI
 */
export function AMRestoreCard({ session, onRestore, onDismiss, onViewLog }) {
  const [isRestoring, setIsRestoring] = useState(false);

  const handleRestore = async (aiTool) => {
    setIsRestoring(true);
    try {
      await onRestore(session, aiTool);
    } finally {
      setIsRestoring(false);
    }
  };

  // Extract last activity hint from session content
  const getLastActivity = () => {
    const content = session.content || session.Content || '';
    const lines = content.split('\n');
    // Look for the last non-empty content entry
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line && !line.startsWith('#') && !line.startsWith('|') && !line.startsWith('-')) {
        // Truncate if too long
        return line.length > 60 ? line.substring(0, 57) + '...' : line;
      }
    }
    return 'Previous terminal session';
  };

  const timeAgo = () => {
    const lastUpdated = session.lastUpdated || session.LastUpdated;
    const diff = Date.now() - new Date(lastUpdated).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'just now';
  };

  return (
    <div className="card am-restore-card">
      <div className="card-header">
        <div className="card-title-row">
          <RefreshCw size={18} className="card-icon" />
          <span className="card-title">Session Recovery Available</span>
        </div>
        <div className="card-actions-top">
          <div className="action-icon" onClick={onDismiss} title="Dismiss">
            <X size={18} />
          </div>
        </div>
      </div>

      <div className="card-body">
        <div className="am-restore-info">
          <p className="am-restore-message">
            A previous session was interrupted <strong>{timeAgo()}</strong>.
          </p>
          <div className="am-restore-activity">
            <small>Last activity:</small>
            <div className="activity-preview">{getLastActivity()}</div>
          </div>
        </div>
      </div>

      <div className="card-footer am-restore-footer">
        <div className="restore-actions">
          <button
            className="btn-action btn-restore"
            onClick={() => handleRestore('copilot')}
            disabled={isRestoring}
            title="Restore with GitHub Copilot CLI"
          >
            {isRestoring ? 'Restoring...' : 'Restore with Copilot'}
          </button>
          <button
            className="btn-action btn-restore"
            onClick={() => handleRestore('claude')}
            disabled={isRestoring}
            title="Restore with Claude CLI"
          >
            {isRestoring ? 'Restoring...' : 'Restore with Claude'}
          </button>
        </div>
        <button
          className="btn-action btn-view-log"
          onClick={() => onViewLog(session)}
          title="View session log"
        >
          <FileText size={14} /> View Log
        </button>
      </div>
    </div>
  );
}

export default AMRestoreCard;
