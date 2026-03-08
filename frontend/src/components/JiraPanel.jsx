import { useState, useEffect, useCallback } from 'react';

const STATUS_COLORS = {
  'To Do':       '#6b7280',
  'In Progress': '#3b82f6',
  'In Review':   '#f59e0b',
  'Done':        '#22c55e',
  'Closed':      '#22c55e',
  'Blocked':     '#ef4444',
};

function statusColor(name) {
  return STATUS_COLORS[name] || '#6b7280';
}

/**
 * JiraPanel — persistent sidebar panel showing the linked Jira ticket for the active tab.
 * Supports viewing, status transitions, commenting, and searching/creating tickets.
 */
export default function JiraPanel({
  tabId,
  jiraTicketKey,     // currently linked key for this tab
  onLinkTicket,      // (key) => void — call to link a ticket to this tab
  onUnlinkTicket,    // () => void  — call to unlink
  jiraApi,           // the useJira() return value
  isConfigured,
}) {
  const [issue, setIssue]               = useState(null);
  const [transitions, setTransitions]   = useState([]);
  const [loading, setLoading]           = useState(false);
  const [commentText, setCommentText]   = useState('');
  const [commentSaving, setCommentSaving] = useState(false);
  const [commentSuccess, setCommentSuccess] = useState(false);
  const [searchQuery, setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching]       = useState(false);
  const [view, setView]                 = useState('ticket'); // 'ticket' | 'search' | 'create'
  const [createForm, setCreateForm]     = useState({ summary: '', description: '', issueType: 'Task', priority: 'Medium' });
  const [creating, setCreating]         = useState(false);
  const [branchSuggestion, setBranchSuggestion] = useState('');
  const [prSuggestion, setPrSuggestion] = useState('');

  // Load issue whenever the linked key changes
  useEffect(() => {
    if (!jiraTicketKey || !isConfigured) {
      setIssue(null);
      setTransitions([]);
      setBranchSuggestion('');
      setPrSuggestion('');
      return;
    }
    setLoading(true);
    Promise.all([
      jiraApi.fetchIssue(jiraTicketKey),
      jiraApi.getTransitions(jiraTicketKey),
      jiraApi.suggestBranch(jiraTicketKey),
      jiraApi.suggestPR(jiraTicketKey),
    ]).then(([iss, trans, branch, pr]) => {
      setIssue(iss);
      setTransitions(trans || []);
      setBranchSuggestion(branch || '');
      setPrSuggestion(pr || '');
    }).finally(() => setLoading(false));
  }, [jiraTicketKey, isConfigured, jiraApi]);

  const handleTransition = useCallback(async (transitionId) => {
    if (!jiraTicketKey) return;
    const ok = await jiraApi.doTransition(jiraTicketKey, transitionId);
    if (ok) {
      const updated = await jiraApi.fetchIssue(jiraTicketKey);
      setIssue(updated);
      const trans = await jiraApi.getTransitions(jiraTicketKey);
      setTransitions(trans || []);
    }
  }, [jiraTicketKey, jiraApi]);

  const handleAddComment = useCallback(async () => {
    if (!commentText.trim() || !jiraTicketKey) return;
    setCommentSaving(true);
    const result = await jiraApi.addComment(jiraTicketKey, commentText.trim());
    setCommentSaving(false);
    if (result) {
      setCommentText('');
      setCommentSuccess(true);
      setTimeout(() => setCommentSuccess(false), 2000);
    }
  }, [commentText, jiraTicketKey, jiraApi]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    // Build a simple JQL: text search + unresolved only
    const jql = `text ~ "${searchQuery.replace(/"/g, '\\"')}" AND resolution = Unresolved ORDER BY updated DESC`;
    const { issues } = await jiraApi.searchIssues(jql);
    setSearchResults(issues || []);
    setSearching(false);
  }, [searchQuery, jiraApi]);

  const handleCreate = useCallback(async () => {
    if (!createForm.summary.trim()) return;
    setCreating(true);
    const issue = await jiraApi.createIssue({
      summary: createForm.summary,
      description: createForm.description,
      issuetype: { name: createForm.issueType },
      priority: { name: createForm.priority },
    });
    setCreating(false);
    if (issue?.key) {
      onLinkTicket(issue.key);
      setView('ticket');
    }
  }, [createForm, jiraApi, onLinkTicket]);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  if (!isConfigured) {
    return (
      <div className="jira-panel jira-panel--unconfigured">
        <div className="jira-panel__header">
          <span className="jira-panel__logo">🎟</span>
          <span className="jira-panel__title">Jira</span>
        </div>
        <div className="jira-panel__empty">
          <p>Jira is not configured.</p>
          <p>Open <strong>Settings → Jira</strong> to connect your instance.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="jira-panel">
      {/* Header */}
      <div className="jira-panel__header">
        <span className="jira-panel__logo">🎟</span>
        <span className="jira-panel__title">
          {jiraTicketKey
            ? <a href="#" className="jira-panel__key" onClick={e => { e.preventDefault(); jiraApi.jiraConfig?.baseUrl && window.open(`${jiraApi.jiraConfig.baseUrl}/browse/${jiraTicketKey}`, '_blank'); }}>{jiraTicketKey}</a>
            : 'Jira'}
        </span>
        <div className="jira-panel__header-actions">
          <button className={`jira-panel__tab-btn ${view === 'ticket' ? 'active' : ''}`} onClick={() => setView('ticket')} title="Ticket">🎫</button>
          <button className={`jira-panel__tab-btn ${view === 'search' ? 'active' : ''}`} onClick={() => setView('search')} title="Search">🔍</button>
          <button className={`jira-panel__tab-btn ${view === 'create' ? 'active' : ''}`} onClick={() => setView('create')} title="Create">➕</button>
        </div>
      </div>

      {/* TICKET VIEW */}
      {view === 'ticket' && (
        <div className="jira-panel__body">
          {!jiraTicketKey && (
            <div className="jira-panel__empty">
              <p>No ticket linked to this tab.</p>
              <button className="jira-btn jira-btn--secondary" onClick={() => setView('search')}>🔍 Search &amp; Link</button>
              <button className="jira-btn jira-btn--primary" onClick={() => setView('create')}>➕ Create Ticket</button>
            </div>
          )}

          {jiraTicketKey && loading && (
            <div className="jira-panel__loading">Loading {jiraTicketKey}…</div>
          )}

          {jiraTicketKey && !loading && issue && (
            <>
              {/* Ticket summary row */}
              <div className="jira-ticket-card">
                <div className="jira-ticket-card__meta">
                  <span className="jira-badge" style={{ background: statusColor(issue.fields.status?.name) }}>
                    {issue.fields.status?.name}
                  </span>
                  {issue.fields.priority && (
                    <span className="jira-priority">{issue.fields.priority.name}</span>
                  )}
                  {issue.fields.issueType && (
                    <span className="jira-type">{issue.fields.issueType.name}</span>
                  )}
                </div>
                <div className="jira-ticket-card__summary">{issue.fields.summary}</div>
                {issue.fields.assignee && (
                  <div className="jira-ticket-card__assignee">👤 {issue.fields.assignee.displayName}</div>
                )}
              </div>

              {/* Transitions */}
              {transitions.length > 0 && (
                <div className="jira-section">
                  <div className="jira-section__label">Move to</div>
                  <div className="jira-transitions">
                    {transitions.map(t => (
                      <button key={t.id} className="jira-btn jira-btn--transition" onClick={() => handleTransition(t.id)}>
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Git suggestions */}
              {(branchSuggestion || prSuggestion) && (
                <div className="jira-section">
                  <div className="jira-section__label">Git</div>
                  {branchSuggestion && (
                    <div className="jira-suggestion" onClick={() => copyToClipboard(branchSuggestion)} title="Click to copy">
                      <span className="jira-suggestion__icon">🌿</span>
                      <code className="jira-suggestion__text">{branchSuggestion}</code>
                      <span className="jira-suggestion__copy">📋</span>
                    </div>
                  )}
                  {prSuggestion && (
                    <div className="jira-suggestion" onClick={() => copyToClipboard(prSuggestion)} title="Click to copy">
                      <span className="jira-suggestion__icon">🔀</span>
                      <code className="jira-suggestion__text">{prSuggestion}</code>
                      <span className="jira-suggestion__copy">📋</span>
                    </div>
                  )}
                </div>
              )}

              {/* Comment */}
              <div className="jira-section">
                <div className="jira-section__label">Add Comment</div>
                <textarea
                  className="jira-textarea"
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  placeholder="Write a comment…"
                  rows={3}
                />
                <div className="jira-section__actions">
                  <button
                    className="jira-btn jira-btn--primary"
                    onClick={handleAddComment}
                    disabled={!commentText.trim() || commentSaving}
                  >
                    {commentSaving ? 'Saving…' : commentSuccess ? '✓ Saved' : 'Add Comment'}
                  </button>
                  <button className="jira-btn jira-btn--ghost" onClick={onUnlinkTicket}>Unlink</button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* SEARCH VIEW */}
      {view === 'search' && (
        <div className="jira-panel__body">
          <div className="jira-search">
            <input
              className="jira-input"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Search tickets (text or PROJ-123)…"
              autoFocus
            />
            <button className="jira-btn jira-btn--primary" onClick={handleSearch} disabled={searching}>
              {searching ? '…' : '🔍'}
            </button>
          </div>
          <div className="jira-results">
            {searchResults.map(iss => (
              <div key={iss.key} className="jira-result-row" onClick={() => { onLinkTicket(iss.key); setView('ticket'); }}>
                <span className="jira-result-row__key">{iss.key}</span>
                <span className="jira-result-row__summary">{iss.fields.summary}</span>
                <span className="jira-badge jira-badge--sm" style={{ background: statusColor(iss.fields.status?.name) }}>
                  {iss.fields.status?.name}
                </span>
              </div>
            ))}
            {searchResults.length === 0 && !searching && searchQuery && (
              <div className="jira-panel__empty-sm">No results</div>
            )}
          </div>
        </div>
      )}

      {/* CREATE VIEW */}
      {view === 'create' && (
        <div className="jira-panel__body">
          <div className="jira-form">
            <label className="jira-label">Summary *</label>
            <input className="jira-input" value={createForm.summary} onChange={e => setCreateForm(f => ({ ...f, summary: e.target.value }))} placeholder="Short description of the issue" />

            <label className="jira-label">Description</label>
            <textarea className="jira-textarea" value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} placeholder="Detailed description (optional)" rows={4} />

            <div className="jira-form-row">
              <div>
                <label className="jira-label">Issue Type</label>
                <select className="jira-select" value={createForm.issueType} onChange={e => setCreateForm(f => ({ ...f, issueType: e.target.value }))}>
                  {['Bug', 'Task', 'Story', 'Epic'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="jira-label">Priority</label>
                <select className="jira-select" value={createForm.priority} onChange={e => setCreateForm(f => ({ ...f, priority: e.target.value }))}>
                  {['Highest', 'High', 'Medium', 'Low', 'Lowest'].map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
            </div>

            <div className="jira-section__actions">
              <button className="jira-btn jira-btn--primary" onClick={handleCreate} disabled={!createForm.summary.trim() || creating}>
                {creating ? 'Creating…' : '➕ Create & Link'}
              </button>
              <button className="jira-btn jira-btn--ghost" onClick={() => setView('ticket')}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
