import React, { useState, useEffect } from 'react';
import { Circle, Eye, EyeOff, AlertTriangle, MessageSquare } from 'lucide-react';
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

        if (statusRes.ok) {
          const statusData = await statusRes.json();
          setStatus(statusData);
        }

        if (convRes && convRes.ok) {
          const convData = await convRes.json();
          setConversations(convData.conversations || []);
        }
      } catch (err) {
        if (!isMounted) return;
        // Silent fail for connection errors during server restarts
        const isConnectionError = err.message?.includes('Failed to fetch');
        if (!isConnectionError) {
          console.error('[AMMonitor] Status check failed:', err);
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
      case 'active':
        return status?.isCapturing 
          ? <Circle size={14} className="recording-dot" fill="currentColor" />
          : <Eye size={14} />;
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

  const handleClick = () => {
    if (hasConversations) {
      setViewingConversation(conversations[0]);
    }
  };

  return (
    <>
      <div 
        className={`am-monitor ${statusClass} ${hasConversations ? 'clickable' : ''}`} 
        title={getDetailedTooltip()}
        onClick={hasConversations ? handleClick : undefined}
        style={{ cursor: hasConversations ? 'pointer' : 'default' }}
      >
        {getIcon()}
        <span>{getDisplayText()}</span>
      </div>

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
