import React, { useState, useEffect } from 'react';
import { Activity, AlertCircle } from 'lucide-react';

/**
 * AMMonitor - Displays LLM conversation activity status for current tab
 * Green: LLM conversations detected and logged
 * Red: No LLM activity detected - warns user to create manual restore points
 */
const AMMonitor = ({ tabId, amEnabled }) => {
  const [hasLLMActivity, setHasLLMActivity] = useState(false);
  const [loading, setLoading] = useState(true);
  const [conversationCount, setConversationCount] = useState(0);

  useEffect(() => {
    if (!tabId || !amEnabled) {
      setLoading(false);
      return;
    }

    const checkLLMActivity = async () => {
      try {
        const response = await fetch(`/api/am/llm/conversations/${tabId}`);
        if (response.ok) {
          const data = await response.json();
          const count = data.count || 0;
          setConversationCount(count);
          setHasLLMActivity(count > 0);
        } else {
          setHasLLMActivity(false);
        }
      } catch (err) {
        console.error('[AMMonitor] Failed to check LLM activity:', err);
        setHasLLMActivity(false);
      } finally {
        setLoading(false);
      }
    };

    // Check immediately
    checkLLMActivity();

    // Check every 10 seconds
    const interval = setInterval(checkLLMActivity, 10000);

    return () => clearInterval(interval);
  }, [tabId, amEnabled]);

  if (!amEnabled) {
    return (
      <div className="am-monitor am-disabled" title="AM Logging Disabled for this tab">
        <Activity size={14} />
        <span>AM Off</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="am-monitor am-loading" title="Checking LLM activity...">
        <Activity size={14} />
        <span>Checking...</span>
      </div>
    );
  }

  if (hasLLMActivity) {
    return (
      <div className="am-monitor am-active" title={`LLM logging active - ${conversationCount} conversation(s) captured`}>
        <Activity size={14} className="pulse" />
        <span>AM Active ({conversationCount})</span>
      </div>
    );
  }

  return (
    <div className="am-monitor am-inactive" title="⚠️ No LLM conversations detected yet. Run 'copilot' or 'claude' commands, or create manual restore points.">
      <AlertCircle size={14} />
      <span>No LLM Activity</span>
    </div>
  );
};

export default AMMonitor;
