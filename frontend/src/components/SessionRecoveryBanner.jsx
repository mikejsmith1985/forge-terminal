import React, { useState, useEffect } from 'react';
import { History, X, ChevronRight, RefreshCw } from 'lucide-react';

/**
 * SessionRecoveryBanner - Displays recoverable sessions on startup
 * 
 * Shows a banner at the top of the terminal when there are
 * crashed or incomplete sessions that can be recovered.
 */
const SessionRecoveryBanner = ({ 
  onRestore, 
  onDismiss,
  enabled = true 
}) => {
  const [sessions, setSessions] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const fetchSessions = async () => {
      try {
        // Try v2 API first
        const [sessionsRes, projectsRes] = await Promise.all([
          fetch('/api/am/v2/sessions'),
          fetch('/api/am/v2/projects')
        ]);

        if (sessionsRes.ok) {
          const sessionsData = await sessionsRes.json();
          setSessions(sessionsData.sessions || []);
        }

        if (projectsRes.ok) {
          const projectsData = await projectsRes.json();
          setProjects(projectsData.projects || []);
        }
      } catch (err) {
        console.error('[SessionRecoveryBanner] Failed to fetch sessions:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSessions();
  }, [enabled]);

  const handleDismiss = () => {
    setDismissed(true);
    if (onDismiss) onDismiss();
  };

  const handleRestore = (session) => {
    if (onRestore) {
      onRestore(session);
    }
  };

  // Format time ago
  const formatTimeAgo = (isoString) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'yesterday';
    return `${diffDays}d ago`;
  };

  // Don't render if dismissed, loading, or no sessions
  if (dismissed || loading || sessions.length === 0) {
    return null;
  }

  const recoverableSessions = sessions.filter(
    s => s.status === 'crashed' || s.status === 'active'
  );

  if (recoverableSessions.length === 0) {
    return null;
  }

  return (
    <div style={{
      backgroundColor: '#1a365d',
      borderBottom: '1px solid #2c5282',
      padding: '8px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      fontSize: '13px',
    }}>
      {/* Header Row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <History size={16} style={{ color: '#63b3ed' }} />
          <span style={{ color: '#e2e8f0' }}>
            <strong>{recoverableSessions.length}</strong> session{recoverableSessions.length !== 1 ? 's' : ''} can be recovered
          </span>
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              background: 'none',
              border: 'none',
              color: '#63b3ed',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
            }}
          >
            {expanded ? 'Hide' : 'Show'}
            <ChevronRight 
              size={14} 
              style={{ 
                transform: expanded ? 'rotate(90deg)' : 'none',
                transition: 'transform 0.2s'
              }} 
            />
          </button>
        </div>

        <button
          onClick={handleDismiss}
          style={{
            background: 'none',
            border: 'none',
            color: '#a0aec0',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
          }}
          title="Dismiss"
        >
          <X size={16} />
        </button>
      </div>

      {/* Expanded Session List */}
      {expanded && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          paddingTop: '8px',
          borderTop: '1px solid #2c5282',
        }}>
          {recoverableSessions.slice(0, 5).map((session) => (
            <div
              key={session.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 8px',
                backgroundColor: '#2c5282',
                borderRadius: '4px',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ 
                  color: '#e2e8f0', 
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span>{session.project || 'Unknown Project'}</span>
                  {session.provider && (
                    <span style={{ 
                      color: '#63b3ed',
                      fontSize: '11px',
                      backgroundColor: '#1a365d',
                      padding: '2px 6px',
                      borderRadius: '3px',
                    }}>
                      {session.provider}
                    </span>
                  )}
                </div>
                <div style={{ 
                  color: '#a0aec0', 
                  fontSize: '11px',
                  marginTop: '2px',
                  display: 'flex',
                  gap: '12px',
                }}>
                  <span>{formatTimeAgo(session.startTime)}</span>
                  <span>{session.turnCount} turn{session.turnCount !== 1 ? 's' : ''}</span>
                  {session.lastTopic && (
                    <span style={{ 
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '300px',
                    }}>
                      "{session.lastTopic}"
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => handleRestore(session)}
                style={{
                  backgroundColor: '#3182ce',
                  color: 'white',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <RefreshCw size={12} />
                Restore
              </button>
            </div>
          ))}

          {recoverableSessions.length > 5 && (
            <div style={{ 
              color: '#a0aec0', 
              fontSize: '11px',
              textAlign: 'center',
              paddingTop: '4px',
            }}>
              +{recoverableSessions.length - 5} more session{recoverableSessions.length - 5 !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SessionRecoveryBanner;
