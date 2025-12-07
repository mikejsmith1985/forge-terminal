import React, { useState, useEffect } from 'react';
import { Activity, AlertCircle, Heart } from 'lucide-react';

/**
 * AMMonitor - Displays AM system health and LLM conversation activity
 * Only visible in Dev Mode
 */
const AMMonitor = ({ tabId, amEnabled, devMode = false }) => {
  const [health, setHealth] = useState(null);
  const [hasLLMActivity, setHasLLMActivity] = useState(false);
  const [loading, setLoading] = useState(true);
  const [conversationCount, setConversationCount] = useState(0);

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
          setConversationCount(count);
          setHasLLMActivity(count > 0);
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
  const layersOp = health?.metrics?.layersOperational || 0;
  const layersTotal = health?.metrics?.layersTotal || 4;

  const statusClass = {
    'HEALTHY': 'am-active',
    'WARNING': 'am-warning',
    'DEGRADED': 'am-warning',
    'CRITICAL': 'am-inactive',
    'NOT_INITIALIZED': 'am-disabled'
  }[systemStatus] || 'am-disabled';

  const statusIcon = systemStatus === 'HEALTHY' ? (
    <Heart size={14} className="pulse" />
  ) : systemStatus === 'CRITICAL' ? (
    <AlertCircle size={14} />
  ) : (
    <Activity size={14} />
  );

  const title = `AM System: ${systemStatus}\nLayers: ${layersOp}/${layersTotal} operational\nConversations: ${conversationCount}`;

  return (
    <div className={`am-monitor ${statusClass}`} title={title}>
      {statusIcon}
      <span>AM {systemStatus === 'HEALTHY' ? `(${conversationCount})` : systemStatus}</span>
    </div>
  );
};

export default AMMonitor;
