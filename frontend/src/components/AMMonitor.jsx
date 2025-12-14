import React, { useState, useEffect, useCallback } from 'react';
import { Activity, Circle, Eye, EyeOff, MessageSquare } from 'lucide-react';
import ConversationViewer from './ConversationViewer';
import { AM_CONFIG } from '../config';

/**
 * AMMonitor - Simplified AM status indicator
 * 
 * Design principles:
 * 1. Simple status: Recording ON/OFF
 * 2. Activity indicator when capturing
 * 3. Click to view conversations
 * 4. No confusing metrics
 * 
 * Only visible in Dev Mode
 */
const AMMonitor = ({ tabId, amEnabled, devMode = false }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [hasActivity, setHasActivity] = useState(false);
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState([]);
  const [viewingConversation, setViewingConversation] = useState(null);
  const [lastActivityTime, setLastActivityTime] = useState(null);
  const [lastConvUpdateTime, setLastConvUpdateTime] = useState(null);
  const [pollingInterval] = useState(() => AM_CONFIG.getPollingInterval());

  // Normalize paths for display (handle Windows backslashes)
  const normalizePath = useCallback((path) => {
    if (!path) return '';
    // Replace Windows backslashes with forward slashes
    return path.replace(/\\/g, '/');
  }, []);

  // Get project name from path
  const getProjectName = useCallback((path) => {
    if (!path) return null;
    const normalized = normalizePath(path);
    const parts = normalized.split('/').filter(Boolean);
    // Get the last non-empty part
    return parts.length > 0 ? parts[parts.length - 1] : null;
  }, [normalizePath]);

  useEffect(() => {
    if (!devMode) {
      setLoading(false);
      return;
    }

    const checkStatus = async () => {
      try {
        const [healthRes, convRes] = await Promise.all([
          fetch('/api/am/health'),
          tabId && amEnabled ? fetch(`/api/am/llm/conversations/${tabId}`) : Promise.resolve(null)
        ]);

        if (healthRes.ok) {
          const healthData = await healthRes.json();
          const status = healthData?.status || 'UNKNOWN';
          setIsRecording(status === 'HEALTHY' && amEnabled);
          
          // Check for recent activity (within last 30 seconds)
          const lastCapture = healthData?.metrics?.lastCaptureTime;
          if (lastCapture) {
            const lastTime = new Date(lastCapture);
            const now = new Date();
            const diffSeconds = (now - lastTime) / 1000;
            setHasActivity(diffSeconds < 30);
            setLastActivityTime(lastTime);
          }
        }

        if (convRes && convRes.ok) {
          const convData = await convRes.json();
          const convList = convData.conversations || [];
          setConversations(convList);
          setLastConvUpdateTime(new Date());
        }
      } catch (err) {
        console.error('[AMMonitor] Status check failed:', err);
        setIsRecording(false);
      } finally {
        setLoading(false);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, pollingInterval);
    return () => clearInterval(interval);
  }, [tabId, amEnabled, devMode, pollingInterval]);

  if (!devMode) {
    return null;
  }

  if (loading) {
    return (
      <div className="am-monitor am-loading" title="Checking AM status...">
        <Activity size={14} />
        <span>AM</span>
      </div>
    );
  }

  // Determine display state
  const hasConversations = conversations.length > 0;
  const activeConversation = conversations.find(c => !c.complete);
  
  // Check if conversations are stale (not updated in last 2 minutes)
  const isDataStale = lastConvUpdateTime && 
    (new Date() - lastConvUpdateTime) > 120000; // 2 minutes
  
  // Format time difference for display
  const formatTimeDiff = (date) => {
    if (!date) return null;
    const diffMs = new Date() - date;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return 'stale';
  };

  // Build status class
  let statusClass = 'am-disabled';
  if (!amEnabled) {
    statusClass = 'am-disabled';
  } else if (hasActivity) {
    statusClass = 'am-recording';
  } else if (isDataStale && hasConversations) {
    statusClass = 'am-stale';
  } else if (isRecording) {
    statusClass = 'am-active';
  }

  // Build tooltip
  const buildTooltip = () => {
    const lines = [];
    
    if (!amEnabled) {
      lines.push('Conversation logging: OFF');
      lines.push('Enable via tab context menu');
    } else if (hasActivity) {
      lines.push('🔴 Recording conversation');
      if (activeConversation) {
        const provider = activeConversation.provider || 'unknown';
        lines.push(`Provider: ${provider}`);
      }
    } else if (isDataStale && hasConversations) {
      lines.push('⚠️ Logging: No recent activity');
      const timeDiff = formatTimeDiff(lastConvUpdateTime);
      lines.push(`Last update: ${timeDiff}`);
    } else if (isRecording) {
      lines.push('✓ Logging: Idle');
      lines.push('Ready to capture LLM activity');
    } else {
      lines.push('Logging: Initializing...');
    }
    
    if (hasConversations) {
      lines.push('');
      lines.push(`${conversations.length} conversation${conversations.length !== 1 ? 's' : ''} logged`);
      lines.push(`Storage: ~/.forge/am/`);
      lines.push('Click to view');
    }
    
    return lines.join('\n');
  };

  const handleClick = () => {
    if (hasConversations) {
      // Open the most recent conversation
      setViewingConversation(conversations[0]);
    }
  };

  // Build display text
  const getDisplayText = () => {
    if (!amEnabled) {
      return 'Log Off';
    }
    if (hasActivity) {
      return '● Recording';
    }
    if (isDataStale && hasConversations) {
      const timeDiff = formatTimeDiff(lastConvUpdateTime);
      return `${conversations.length} (${timeDiff})`;
    }
    if (hasConversations) {
      return `${conversations.length} log${conversations.length !== 1 ? 's' : ''}`;
    }
    return 'Ready';
  };

  // Build icon
  const getIcon = () => {
    if (!amEnabled) {
      return <EyeOff size={14} />;
    }
    if (hasActivity) {
      return <Circle size={14} className="recording-dot" fill="currentColor" />;
    }
    if (hasConversations) {
      return <MessageSquare size={14} />;
    }
    return <Eye size={14} />;
  };

  return (
    <>
      <div 
        className={`am-monitor ${statusClass} ${hasConversations ? 'clickable' : ''}`} 
        title={buildTooltip()}
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
