import React, { useState, useEffect } from 'react';
import { Activity, AlertCircle, Heart } from 'lucide-react';
import ConversationViewer from './ConversationViewer';

/**
 * AMMonitor - Displays AM system health and LLM conversation activity
 * Only visible in Dev Mode
 */
const AMMonitor = ({ tabId, amEnabled, devMode = false }) => {
  const [health, setHealth] = useState(null);
  const [hasLLMActivity, setHasLLMActivity] = useState(false);
  const [loading, setLoading] = useState(true);
  const [conversationCount, setConversationCount] = useState(0);
  const [conversations, setConversations] = useState([]);
  const [viewingConversation, setViewingConversation] = useState(null);
  const [projectName, setProjectName] = useState('');

  // Helper to detect project from metadata
  const detectProject = (metadata) => {
    if (!metadata || !metadata.workingDirectory) return 'adhoc';
    
    const path = metadata.workingDirectory;
    const parts = path.split('/');
    const dirName = parts[parts.length - 1];
    
    // Simple heuristic - use last directory name
    return dirName || 'adhoc';
  };

  useEffect(() => {
    if (!devMode) {
      setLoading(false);
      return;
    }

    const checkHealth = async () => {
      try {
        const [healthRes, convRes] = await Promise.all([
          fetch('/api/am/health'),
          tabId && amEnabled ? fetch(`/api/am/llm/conversations/${tabId}`) : Promise.resolve(null)
        ]);

        if (healthRes.ok) {
          const healthData = await healthRes.json();
          setHealth(healthData);
        }

        if (convRes && convRes.ok) {
          const convData = await convRes.json();
          const count = convData.count || 0;
          const convList = convData.conversations || [];
          setConversationCount(count);
          setConversations(convList);
          setHasLLMActivity(count > 0);
          
          // Detect project from most recent conversation
          if (convList.length > 0 && convList[0].metadata) {
            setProjectName(detectProject(convList[0].metadata));
          }
        }
      } catch (err) {
        console.error('[AMMonitor] Health check failed:', err);
      } finally {
        setLoading(false);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, [tabId, amEnabled, devMode]);

  if (!devMode) {
    return null;
  }

  if (loading) {
    return (
      <div className="am-monitor am-loading" title="Checking AM system...">
        <Activity size={14} />
        <span>AM...</span>
      </div>
    );
  }

  const systemStatus = health?.status || 'UNKNOWN';
  const conversationsActive = health?.metrics?.conversationsActive || 0;
  const snapshotsCaptured = health?.metrics?.snapshotsCaptured || 0;
  const inputBytes = health?.metrics?.inputBytesCaptured || 0;
  const outputBytes = health?.metrics?.outputBytesCaptured || 0;

  const statusClass = {
    'HEALTHY': 'am-active',
    'WARNING': 'am-warning',
    'DEGRADED': 'am-warning',
    'CRITICAL': 'am-inactive',
    'FAILED': 'am-inactive',
    'NOT_INITIALIZED': 'am-disabled'
  }[systemStatus] || 'am-disabled';

  const statusIcon = systemStatus === 'HEALTHY' ? (
    <Heart size={14} className="pulse" />
  ) : (systemStatus === 'CRITICAL' || systemStatus === 'FAILED') ? (
    <AlertCircle size={14} />
  ) : (
    <Activity size={14} />
  );

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 10) / 10 + ' ' + sizes[i];
  };

  const title = `AM System: ${systemStatus}\nProject: ${projectName || 'adhoc'}\nActive: ${conversationsActive} | Tracked: ${conversationCount}\nSnapshots: ${snapshotsCaptured} | Input: ${formatBytes(inputBytes)} | Output: ${formatBytes(outputBytes)}\n\nClick to view conversations`;

  const handleClick = () => {
    if (conversations.length > 0) {
      // Open the most recent conversation
      setViewingConversation(conversations[0]);
    }
  };

  return (
    <>
      <div 
        className={`am-monitor ${statusClass} ${conversationCount > 0 ? 'clickable' : ''}`} 
        title={title}
        onClick={conversationCount > 0 ? handleClick : undefined}
        style={{ cursor: conversationCount > 0 ? 'pointer' : 'default' }}
      >
        {statusIcon}
        <span>
          {systemStatus === 'HEALTHY' 
            ? `${projectName || 'AM'} (${conversationCount})` 
            : `AM ${systemStatus}`}
        </span>
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
