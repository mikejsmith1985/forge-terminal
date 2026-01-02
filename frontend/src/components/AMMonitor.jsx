import React, { useState, useEffect, useRef } from 'react';
import { Circle, Eye, EyeOff, AlertTriangle, MessageSquare, X, FileText, RefreshCw } from 'lucide-react';
import ConversationViewer from './ConversationViewer';

/**
 * AMMonitor - 3-State AM Status Indicator
 * 
 * v3.9.1: Simplified to use new /api/am/tab-status endpoint
 * 
 * States:
 * 🟢 Active (green): "AM Logging is Active in this tab"
 * 🟡 Disabled (yellow): "AM Logging is Disabled for this tab"  
 * 🔴 Broken (red): "AM Logging is enabled but not capturing data"
 * 
 * Only visible in Dev Mode
 */
const AMMonitor = ({ tabId, amEnabled, devMode = false }) => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState([]);
  const [viewingConversation, setViewingConversation] = useState(null);
  const [showDetailsPanel, setShowDetailsPanel] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const panelRef = useRef(null);

  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setShowDetailsPanel(false);
      }
    };
    if (showDetailsPanel) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDetailsPanel]);

  useEffect(() => {
    if (!devMode || !tabId) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    const checkStatus = async () => {
      try {
        // Use new tab-status endpoint for accurate 3-state detection
        const [statusRes, convRes] = await Promise.all([
          fetch(`/api/am/tab-status/${tabId}?amEnabled=${amEnabled}`),
          amEnabled ? fetch(`/api/am/llm/conversations/${tabId}`) : Promise.resolve(null)
        ]);

        if (!isMounted) return;

        // Process status response
        if (statusRes && statusRes.ok) {
          const statusData = await statusRes.json();
          if (isMounted) {
            setStatus(statusData);
          }
        } else if (statusRes && !statusRes.ok) {
          console.warn('[AMMonitor] Status endpoint returned', statusRes.status);
          if (isMounted) {
            setStatus({
              tabId,
              status: amEnabled ? 'active' : 'disabled',
              statusText: amEnabled ? 'AM Active' : 'AM Disabled'
            });
          }
        }

        // Process conversations response
        if (convRes && convRes.ok) {
          const convData = await convRes.json();
          if (isMounted) {
            // Handle both response formats
            const convArray = Array.isArray(convData) 
              ? convData 
              : convData.conversations || [];
            setConversations(convArray);
          }
        } else if (convRes) {
          // If conversations endpoint fails, just set empty array
          if (isMounted) {
            setConversations([]);
          }
        }
      } catch (err) {
        if (!isMounted) return;
        // Silent fail for connection errors during server restarts
        const isConnectionError = err.message?.includes('Failed to fetch');
        if (!isConnectionError) {
          console.error('[AMMonitor] Status check failed:', err);
        }
        // Set default status on error
        if (isMounted) {
          setStatus({
            tabId,
            status: amEnabled ? 'active' : 'disabled',
            statusText: amEnabled ? 'AM Active' : 'AM Disabled'
          });
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 5000); // Poll every 5s
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [tabId, amEnabled, devMode]);

  if (!devMode) return null;

  if (loading) {
    return (
      <div className="am-monitor am-loading" title="Checking AM status...">
        <Eye size={14} />
        <span>AM</span>
      </div>
    );
  }

  // Determine visual state from backend status
  const statusType = status?.status || (amEnabled ? 'active' : 'disabled');
  const statusText = status?.statusText || (amEnabled ? 'AM Active' : 'AM Disabled');
  const hasConversations = conversations.length > 0;

  // Map status to CSS class
  const statusClassMap = {
    'active': 'am-active',      // Green
    'disabled': 'am-disabled',  // Yellow
    'broken': 'am-broken'       // Red
  };
  const statusClass = statusClassMap[statusType] || 'am-disabled';

  // Map status to icon
  const getIcon = () => {
    switch (statusType) {
      case 'active': {
        // Show recording dot when actively capturing
        if (status?.isCapturing) {
          return (
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Circle size={14} className="recording-dot" fill="currentColor" />
            </div>
          );
        }
        return <Eye size={14} />;
      }
      case 'disabled':
        return <EyeOff size={14} />;
      case 'broken':
        return <AlertTriangle size={14} />;
      default:
        return <Eye size={14} />;
    }
  };

  // Display text
  const getDisplayText = () => {
    if (statusType === 'disabled') return 'AM Off';
    if (statusType === 'broken') return 'AM Error';
    if (status?.isCapturing) return '● Recording';
    if (hasConversations) return `${conversations.length} log${conversations.length !== 1 ? 's' : ''}`;
    return 'AM Ready';
  };
  
  // Build detailed tooltip
  const getDetailedTooltip = () => {
    if (!status) return statusText;
    
    let tooltip = `${status.statusText}\n\n`;
    
    // Add detailed reason if available
    if (status.detailedReason) {
      tooltip += `Status: ${status.detailedReason}\n\n`;
    }
    
    // Add redundancy system status
    if (status.redundancy) {
      tooltip += `Redundancy Systems:\n`;
      tooltip += `  Primary Layer: ${status.redundancy.primaryLayerOk ? '✓ OK' : '✗ Down'}\n`;
      tooltip += `  Native Recovery: ${status.redundancy.nativeSessionOk ? '✓ OK' : '✗ Down'}\n`;
      tooltip += `  Periodic Capture: ${status.redundancy.periodicCaptureOk ? '✓ OK' : '✗ Down'}\n`;
      tooltip += `  Health Monitor: ${status.redundancy.healthMonitorOk ? '✓ OK' : '✗ Down'}\n\n`;
    }
    
    // Add native session info
    if (status.nativeRecoveryOk) {
      tooltip += `Native Sessions: ${status.nativeSessionCount} detected\n`;
    } else {
      tooltip += `Native Sessions: Recovery system offline\n`;
    }
    
    // Add capture metrics
    if (status.turnsCaptured > 0) {
      tooltip += `\nCapture Stats:\n`;
      tooltip += `  Turns: ${status.turnsCaptured}\n`;
      if (status.secondsSinceCapture !== undefined) {
        tooltip += `  Last: ${status.secondsSinceCapture}s ago\n`;
      }
    }
    
    return tooltip;
  };

  const handleClick = (e) => {
    e.stopPropagation();
    setShowDetailsPanel(true);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const [statusRes, convRes] = await Promise.all([
        fetch(`/api/am/tab-status/${tabId}?amEnabled=${amEnabled}`),
        amEnabled ? fetch(`/api/am/llm/conversations/${tabId}`) : Promise.resolve(null)
      ]);

      if (statusRes && statusRes.ok) {
        const statusData = await statusRes.json();
        setStatus(statusData);
      }

      if (convRes && convRes.ok) {
        const convData = await convRes.json();
        const convArray = Array.isArray(convData) 
          ? convData 
          : convData.conversations || [];
        setConversations(convArray);
      }
    } catch (err) {
      console.error('[AMMonitor] Refresh failed:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleViewLogs = () => {
    if (hasConversations && conversations.length > 0) {
      const mostRecent = conversations[0];
      if (mostRecent && mostRecent.conversationId) {
        setViewingConversation(mostRecent);
        setShowDetailsPanel(false);
      }
    }
  };

  // Format relative time
  const formatRelativeTime = (seconds) => {
    if (!seconds && seconds !== 0) return 'Never';
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <>
      <div 
        className={`am-monitor ${statusClass} clickable`} 
        title="Click for AM details"
        onClick={handleClick}
        style={{ cursor: 'pointer' }}
      >
        {getIcon()}
        <span>{getDisplayText()}</span>
      </div>

      {/* Details Panel - shown on click instead of going straight to logs */}
      {showDetailsPanel && (
        <div 
          ref={panelRef}
          className="am-details-panel"
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: '#1e1e1e',
            border: '1px solid #444',
            borderRadius: '8px',
            padding: '16px',
            minWidth: '320px',
            maxWidth: '450px',
            zIndex: 10000,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            color: '#c9d1d9',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Eye size={16} />
              AM Logger Status
            </h3>
            <button
              onClick={() => setShowDetailsPanel(false)}
              style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: '4px' }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Status Badge */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            padding: '8px 12px', 
            borderRadius: '6px',
            marginBottom: '12px',
            background: statusType === 'active' ? 'rgba(46,160,67,0.15)' : 
                       statusType === 'broken' ? 'rgba(248,81,73,0.15)' : 'rgba(187,128,9,0.15)',
            border: `1px solid ${statusType === 'active' ? '#2ea043' : statusType === 'broken' ? '#f85149' : '#bb8009'}`,
          }}>
            {getIcon()}
            <span style={{ fontWeight: 500 }}>{statusText}</span>
          </div>

          {/* Detailed Reason */}
          {status?.detailedReason && (
            <div style={{ 
              fontSize: '12px', 
              color: '#8b949e', 
              marginBottom: '12px',
              padding: '8px',
              background: '#0d1117',
              borderRadius: '4px',
              lineHeight: 1.5,
            }}>
              {status.detailedReason}
            </div>
          )}

          {/* Stats Grid */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: '1fr 1fr', 
            gap: '8px', 
            marginBottom: '12px',
            fontSize: '12px',
          }}>
            <div style={{ padding: '8px', background: '#0d1117', borderRadius: '4px' }}>
              <div style={{ color: '#8b949e', marginBottom: '2px' }}>Turns Captured</div>
              <div style={{ fontWeight: 600, fontSize: '16px' }}>{status?.turnsCaptured || 0}</div>
            </div>
            <div style={{ padding: '8px', background: '#0d1117', borderRadius: '4px' }}>
              <div style={{ color: '#8b949e', marginBottom: '2px' }}>Last Activity</div>
              <div style={{ fontWeight: 600, fontSize: '16px' }}>
                {formatRelativeTime(status?.secondsSinceCapture)}
              </div>
            </div>
            <div style={{ padding: '8px', background: '#0d1117', borderRadius: '4px' }}>
              <div style={{ color: '#8b949e', marginBottom: '2px' }}>Conversations</div>
              <div style={{ fontWeight: 600, fontSize: '16px' }}>{conversations.length}</div>
            </div>
            <div style={{ padding: '8px', background: '#0d1117', borderRadius: '4px' }}>
              <div style={{ color: '#8b949e', marginBottom: '2px' }}>Native Sessions</div>
              <div style={{ fontWeight: 600, fontSize: '16px' }}>{status?.nativeSessionCount || 0}</div>
            </div>
          </div>

          {/* Redundancy Status */}
          {status?.redundancy && (
            <div style={{ marginBottom: '12px', fontSize: '11px' }}>
              <div style={{ color: '#8b949e', marginBottom: '4px', fontWeight: 500 }}>Redundancy Systems</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                <span style={{ 
                  padding: '2px 6px', 
                  borderRadius: '3px',
                  background: status.redundancy.primaryLayerOk ? '#238636' : '#6e4040',
                  color: 'white',
                }}>Primary {status.redundancy.primaryLayerOk ? '✓' : '✗'}</span>
                <span style={{ 
                  padding: '2px 6px', 
                  borderRadius: '3px',
                  background: status.redundancy.nativeSessionOk ? '#238636' : '#6e4040',
                  color: 'white',
                }}>Native {status.redundancy.nativeSessionOk ? '✓' : '✗'}</span>
                <span style={{ 
                  padding: '2px 6px', 
                  borderRadius: '3px',
                  background: status.redundancy.healthMonitorOk ? '#238636' : '#6e4040',
                  color: 'white',
                }}>Health {status.redundancy.healthMonitorOk ? '✓' : '✗'}</span>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '8px 12px',
                background: '#21262d',
                border: '1px solid #30363d',
                borderRadius: '6px',
                color: '#c9d1d9',
                cursor: refreshing ? 'wait' : 'pointer',
                fontSize: '12px',
                fontWeight: 500,
              }}
            >
              <RefreshCw size={14} className={refreshing ? 'spinning' : ''} />
              Refresh
            </button>
            <button
              onClick={handleViewLogs}
              disabled={!hasConversations}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '8px 12px',
                background: hasConversations ? '#238636' : '#21262d',
                border: '1px solid',
                borderColor: hasConversations ? '#2ea043' : '#30363d',
                borderRadius: '6px',
                color: hasConversations ? 'white' : '#8b949e',
                cursor: hasConversations ? 'pointer' : 'not-allowed',
                fontSize: '12px',
                fontWeight: 500,
              }}
            >
              <FileText size={14} />
              View Logs ({conversations.length})
            </button>
          </div>
        </div>
      )}

      {/* Backdrop for details panel */}
      {showDetailsPanel && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 9999,
          }}
          onClick={() => setShowDetailsPanel(false)}
        />
      )}

      {viewingConversation && (
        <ConversationViewer
          tabId={tabId}
          conversationId={viewingConversation.conversationId}
          onClose={() => setViewingConversation(null)}
        />
      )}
    </>
  );
};

export default AMMonitor;
