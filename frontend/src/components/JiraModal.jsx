import { useState, useCallback, useEffect, useRef } from 'react';

/**
 * JiraModal — quick-access floating modal for searching and creating Jira tickets.
 * Triggered by a command card or keyboard shortcut.
 */
export default function JiraModal({
  isOpen,
  onClose,
  onLinkTicket,  // (key) => void
  jiraApi,
  isConfigured,
}) {
  const [activeTab, setActiveTab]       = useState('find');
  const [searchQuery, setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching]       = useState(false);
  const [createForm, setCreateForm]     = useState({ summary: '', description: '', issueType: 'Task', priority: 'Medium' });
  const [creating, setCreating]         = useState(false);
  const [createError, setCreateError]   = useState('');
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (isOpen && activeTab === 'find') {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen, activeTab]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    // If query looks like a key (PROJECT-123), fetch directly; otherwise run JQL text search.
    const keyPattern = /^[A-Z]{2,10}-\d+$/;
    let issues;
    if (keyPattern.test(q.toUpperCase())) {
      const iss = await jiraApi.fetchIssue(q.toUpperCase());
      issues = iss ? [iss] : [];
    } else {
      const jql = `text ~ "${q.replace(/"/g, '\\"')}" AND resolution = Unresolved ORDER BY updated DESC`;
      const result = await jiraApi.searchIssues(jql);
      issues = result.issues || [];
    }
    setSearchResults(issues);
    setSearching(false);
  }, [searchQuery, jiraApi]);

  const handleCreate = useCallback(async () => {
    if (!createForm.summary.trim()) return;
    setCreating(true);
    setCreateError('');
    const issue = await jiraApi.createIssue({
      summary: createForm.summary,
      description: createForm.description,
      issuetype: { name: createForm.issueType },
      priority: { name: createForm.priority },
    });
    setCreating(false);
    if (issue?.key) {
      onLinkTicket(issue.key);
      onClose();
    } else {
      setCreateError('Failed to create ticket. Check your Jira configuration.');
    }
  }, [createForm, jiraApi, onLinkTicket, onClose]);

  if (!isOpen) return null;

  return (
    <div className="jira-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="jira-modal">
        <div className="jira-modal__header">
          <span className="jira-modal__title">🎟 Jira</span>
          <button className="jira-modal__close" onClick={onClose}>✕</button>
        </div>

        {!isConfigured ? (
          <div className="jira-modal__body jira-panel__empty">
            <p>Jira is not configured.</p>
            <p>Open <strong>Settings → Jira</strong> to connect your instance.</p>
          </div>
        ) : (
          <>
            <div className="jira-modal__tabs">
              <button className={`jira-modal__tab ${activeTab === 'find' ? 'active' : ''}`} onClick={() => setActiveTab('find')}>Find Ticket</button>
              <button className={`jira-modal__tab ${activeTab === 'create' ? 'active' : ''}`} onClick={() => setActiveTab('create')}>Create Ticket</button>
            </div>

            <div className="jira-modal__body">
              {activeTab === 'find' && (
                <div className="jira-search-pane">
                  <div className="jira-search">
                    <input
                      ref={searchInputRef}
                      className="jira-input"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSearch()}
                      placeholder="Enter ticket key (PROJ-123) or search text…"
                    />
                    <button className="jira-btn jira-btn--primary" onClick={handleSearch} disabled={searching}>
                      {searching ? '…' : 'Search'}
                    </button>
                  </div>
                  <div className="jira-results">
                    {searchResults.map(iss => (
                      <div key={iss.key} className="jira-result-row" onClick={() => { onLinkTicket(iss.key); onClose(); }}>
                        <span className="jira-result-row__key">{iss.key}</span>
                        <span className="jira-result-row__summary">{iss.fields.summary}</span>
                        <span className="jira-status-badge" style={{ background: iss.fields.status?.name === 'Done' ? '#22c55e' : iss.fields.status?.name === 'In Progress' ? '#3b82f6' : '#6b7280' }}>
                          {iss.fields.status?.name}
                        </span>
                      </div>
                    ))}
                    {searchResults.length === 0 && !searching && searchQuery && (
                      <div className="jira-panel__empty-sm">No results found</div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'create' && (
                <div className="jira-create-pane">
                  {createError && <div className="jira-error">{createError}</div>}
                  <label className="jira-label">Summary *</label>
                  <input className="jira-input" value={createForm.summary} onChange={e => setCreateForm(f => ({ ...f, summary: e.target.value }))} placeholder="Short description" autoFocus={activeTab === 'create'} />

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

                  <button className="jira-btn jira-btn--primary jira-btn--full" onClick={handleCreate} disabled={!createForm.summary.trim() || creating}>
                    {creating ? 'Creating…' : '➕ Create & Link to Tab'}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
