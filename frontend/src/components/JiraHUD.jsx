import { useState, useEffect, useRef } from 'react';

const AUTO_DISMISS_MS = 8000;

/**
 * JiraHUD — a non-blocking floating overlay that appears briefly when a Jira issue key
 * is detected in terminal output. Shows a quick preview and offers one-click actions.
 */
export default function JiraHUD({
  detectedKey,       // The Jira key just detected (null = hidden)
  onLinkToTab,       // () => void — link detectedKey to the current tab
  onDismiss,         // () => void — hide the HUD
  jiraApi,
  isConfigured,
}) {
  const [issue, setIssue] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(100); // progress bar for auto-dismiss
  const timerRef = useRef(null);
  const progressRef = useRef(null);

  // Fetch issue preview whenever a new key is detected
  useEffect(() => {
    if (!detectedKey || !isConfigured) {
      setIssue(null);
      return;
    }
    setLoading(true);
    setProgress(100);
    jiraApi.fetchIssue(detectedKey).then(iss => {
      setIssue(iss);
      setLoading(false);
    });
  }, [detectedKey, isConfigured, jiraApi]);

  // Auto-dismiss countdown
  useEffect(() => {
    if (!detectedKey) return;
    clearTimeout(timerRef.current);
    clearInterval(progressRef.current);

    const start = Date.now();
    progressRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.max(0, 100 - (elapsed / AUTO_DISMISS_MS) * 100);
      setProgress(pct);
      if (pct <= 0) clearInterval(progressRef.current);
    }, 50);

    timerRef.current = setTimeout(() => {
      clearInterval(progressRef.current);
      onDismiss();
    }, AUTO_DISMISS_MS);

    return () => {
      clearTimeout(timerRef.current);
      clearInterval(progressRef.current);
    };
  }, [detectedKey, onDismiss]);

  if (!detectedKey || !isConfigured) return null;

  const statusName = issue?.fields?.status?.name;
  const statusColor = statusName === 'Done' ? '#22c55e'
    : statusName === 'In Progress' ? '#3b82f6'
    : statusName === 'Blocked' ? '#ef4444'
    : '#6b7280';

  return (
    <div className="jira-hud">
      {/* Progress bar for auto-dismiss */}
      <div className="jira-hud__progress" style={{ width: `${progress}%` }} />

      <div className="jira-hud__content">
        <div className="jira-hud__key-row">
          <span className="jira-hud__icon">🎟</span>
          <span className="jira-hud__key">{detectedKey}</span>
          {statusName && (
            <span className="jira-hud__status" style={{ background: statusColor }}>{statusName}</span>
          )}
          <button className="jira-hud__close" onClick={onDismiss} title="Dismiss">✕</button>
        </div>

        {loading && <div className="jira-hud__loading">Loading…</div>}

        {!loading && issue && (
          <div className="jira-hud__summary">{issue.fields.summary}</div>
        )}

        {!loading && (
          <div className="jira-hud__actions">
            <button className="jira-btn jira-btn--hud-primary" onClick={() => { onLinkToTab(); onDismiss(); }}>
              🔗 Link to Tab
            </button>
            {jiraApi.jiraConfig?.baseUrl && (
              <button
                className="jira-btn jira-btn--hud-secondary"
                onClick={() => window.open(`${jiraApi.jiraConfig.baseUrl}/browse/${detectedKey}`, '_blank')}
              >
                🌐 Open
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
