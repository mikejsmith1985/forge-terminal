import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Folder, AlertCircle } from 'lucide-react';
import SessionRestoreModal from './SessionRestoreModal';
import './WorkspaceSessionList.css';

/**
 * WorkspaceSessionList - Displays recoverable sessions organized by workspace
 * Allows users to expand/collapse workspaces and select sessions to restore
 */
export function WorkspaceSessionList({ groups, onRestore, onDismiss, loading, error }) {
  const [expandedWorkspace, setExpandedWorkspace] = useState(null);
  const [selectedSessions, setSelectedSessions] = useState(null);

  if (loading) {
    return (
      <div className="workspace-session-list loading">
        <div className="spinner"></div>
        <p>Loading sessions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="workspace-session-list error">
        <AlertCircle size={20} />
        <p>Error loading sessions: {error}</p>
      </div>
    );
  }

  if (!groups || groups.length === 0) {
    return (
      <div className="workspace-session-list empty">
        <AlertCircle size={20} />
        <p>No recoverable sessions found</p>
      </div>
    );
  }

  const toggleWorkspace = (workspace) => {
    setExpandedWorkspace(expandedWorkspace === workspace ? null : workspace);
  };

  const handleSessionSelect = (group) => {
    setSelectedSessions(group);
  };

  const handleRestoreSession = async (session, provider) => {
    await onRestore(session, provider);
    setSelectedSessions(null);
  };

  return (
    <div className="workspace-session-list">
      <div className="list-header">
        <h2>Recoverable Sessions</h2>
        <p className="total-sessions">{groups.reduce((sum, g) => sum + g.count, 0)} session{groups.reduce((sum, g) => sum + g.count, 0) !== 1 ? 's' : ''}</p>
      </div>

      <div className="workspace-groups">
        {groups.map((group) => (
          <div key={group.workspace} className="workspace-group">
            <button
              className={`workspace-header ${expandedWorkspace === group.workspace ? 'expanded' : ''}`}
              onClick={() => toggleWorkspace(group.workspace)}
            >
              {expandedWorkspace === group.workspace ? (
                <ChevronDown size={18} />
              ) : (
                <ChevronRight size={18} />
              )}
              <Folder size={16} />
              <div className="workspace-info">
                <span className="workspace-path">{group.workspace}</span>
                <span className="session-badge">{group.count} session{group.count !== 1 ? 's' : ''}</span>
              </div>
            </button>

            {expandedWorkspace === group.workspace && (
              <div className="workspace-sessions">
                {group.sessions.map((session) => (
                  <div key={session.sessionId} className="workspace-session-item">
                    <div className="session-row">
                      <div className="session-left">
                        <h3 className="session-tab-name">{session.tabName}</h3>
                        <p className="session-last-command">{session.lastCommand || 'No command'}</p>
                      </div>
                      <div className="session-right">
                        <span className="provider-badge">{session.provider}</span>
                        <span className="time-badge">{formatTimeAgo(session.lastUpdated)}</span>
                      </div>
                    </div>
                    <div className="session-meta-row">
                      <span className="meta-item">{session.activeCount} conversation{session.activeCount !== 1 ? 's' : ''}</span>
                      <span className="meta-divider">·</span>
                      <span className="meta-item">{session.durationMinutes} min</span>
                    </div>
                    <div className="session-actions">
                      <button
                        className="btn-select-copilot"
                        onClick={() => handleSessionSelect({ ...group, selectedSession: session })}
                      >
                        Restore with Copilot
                      </button>
                      <button
                        className="btn-select-claude"
                        onClick={() => handleSessionSelect({ ...group, selectedSession: session })}
                      >
                        Restore with Claude
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {selectedSessions && (
        <SessionRestoreModal
          workspace={selectedSessions.workspace}
          sessions={[selectedSessions.selectedSession]}
          onRestore={handleRestoreSession}
          onDismiss={() => setSelectedSessions(null)}
        />
      )}
    </div>
  );
}

function formatTimeAgo(date) {
  const now = new Date();
  const diffMs = now - new Date(date);
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export default WorkspaceSessionList;
