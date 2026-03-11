import React, { useState, useEffect } from 'react';

// ─── Step status icon ─────────────────────────────────────────────────────────
const StepIcon = ({ status }) => {
  if (status === 'ok')    return <span style={{ color: '#4ade80', fontSize: '16px' }}>✓</span>;
  if (status === 'error') return <span style={{ color: '#f87171', fontSize: '16px' }}>✗</span>;
  if (status === 'skip')  return <span style={{ color: '#facc15', fontSize: '14px' }}>↷</span>;
  return (
    <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid #8b5cf6', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', verticalAlign: 'middle' }} />
  );
};

// ─── Input field ──────────────────────────────────────────────────────────────
const Field = ({ label, hint, value, onChange, type = 'text', placeholder }) => (
  <div style={{ marginBottom: '16px' }}>
    <label style={{ display: 'block', fontSize: '13px', color: '#aaa', marginBottom: '5px', fontWeight: '500' }}>
      {label}
    </label>
    {hint && <p style={{ fontSize: '12px', color: '#666', margin: '0 0 6px' }}>{hint}</p>}
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      autoComplete="off"
      spellCheck={false}
      style={{
        width: '100%',
        padding: '9px 12px',
        background: '#111',
        border: '1px solid #333',
        borderRadius: '7px',
        color: '#e2e8f0',
        fontSize: '13px',
        fontFamily: type === 'password' ? 'monospace' : 'inherit',
        outline: 'none',
        boxSizing: 'border-box',
      }}
    />
  </div>
);

// ─── Progress step row ────────────────────────────────────────────────────────
const StepRow = ({ step, isActive }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '9px 12px',
    background: isActive ? 'rgba(139,92,246,0.08)' : 'transparent',
    borderRadius: '7px',
    transition: 'background 0.2s',
  }}>
    <div style={{ width: '20px', textAlign: 'center', flexShrink: 0 }}>
      <StepIcon status={step.status} />
    </div>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: '13px', color: step.status === 'error' ? '#f87171' : '#ddd', fontWeight: '500' }}>
        {step.name}
      </div>
      {step.detail && (
        <div style={{ fontSize: '12px', color: step.status === 'error' ? '#fca5a5' : '#888', marginTop: '2px', lineHeight: '1.4' }}>
          {step.detail}
        </div>
      )}
    </div>
  </div>
);

// ─── Main wizard ──────────────────────────────────────────────────────────────
const MCPAtlassianWizard = () => {
  const [jiraUrl, setJiraUrl]     = useState('');
  const [email, setEmail]         = useState('');
  const [apiToken, setApiToken]   = useState('');
  const [phase, setPhase]         = useState('form'); // 'form' | 'running' | 'done' | 'error'
  const [steps, setSteps]         = useState([]);
  const [status, setStatus]       = useState(null); // existing config status

  // Load existing config on mount
  useEffect(() => {
    fetch('/api/atlassian/status')
      .then(r => r.json())
      .then(s => {
        setStatus(s);
        if (s.jiraUrl)  setJiraUrl(s.jiraUrl);
        if (s.email)    setEmail(s.email);
      })
      .catch(() => {});
  }, []);

  const handleConnect = async () => {
    if (!jiraUrl.trim() || !email.trim() || !apiToken.trim()) return;
    setPhase('running');
    setSteps([{ name: 'Starting setup…', status: 'pending' }]);

    try {
      const res = await fetch('/api/atlassian/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jiraUrl: jiraUrl.trim(), email: email.trim(), apiToken: apiToken.trim() }),
      });
      const data = await res.json();
      setSteps(data.steps || []);
      setPhase(data.success ? 'done' : 'error');
      if (data.success) {
        setStatus({ configured: true, uvxPresent: true, jiraUrl: jiraUrl.trim(), email: email.trim() });
        setApiToken(''); // clear token from memory
      }
    } catch (err) {
      setSteps([{ name: 'Setup failed', status: 'error', detail: String(err) }]);
      setPhase('error');
    }
  };

  const handleDisconnect = async () => {
    await fetch('/api/atlassian/config', { method: 'DELETE' }).catch(() => {});
    setStatus(null);
    setApiToken('');
    setPhase('form');
    setSteps([]);
  };

  // ── Already configured ─────────────────────────────────────────────────────
  if (status?.configured && phase === 'form') {
    return (
      <div style={{ padding: '28px', maxWidth: '560px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <span style={{ fontSize: '28px' }}>🎟</span>
          <div>
            <h2 style={{ margin: 0, fontSize: '17px', color: '#fff', fontWeight: '600' }}>Jira via Copilot CLI</h2>
            <p style={{ margin: '3px 0 0', fontSize: '13px', color: '#4ade80' }}>✓ Connected</p>
          </div>
        </div>

        <div style={{ background: '#0d1117', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '14px 16px', marginBottom: '20px' }}>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Jira URL</div>
          <div style={{ fontSize: '13px', color: '#ddd' }}>{status.jiraUrl}</div>
          <div style={{ fontSize: '12px', color: '#666', marginTop: '10px', marginBottom: '4px' }}>Email</div>
          <div style={{ fontSize: '13px', color: '#ddd' }}>{status.email}</div>
        </div>

        <div style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: '8px', padding: '14px 16px', marginBottom: '20px' }}>
          <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#c4b5fd', fontWeight: '500' }}>💬 Ask Copilot CLI things like:</p>
          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', color: '#9ca3af', lineHeight: '2' }}>
            <li><em>"Create a Jira ticket for this bug"</em></li>
            <li><em>"What's in my backlog?"</em></li>
            <li><em>"Move KAN-42 to In Progress"</em></li>
            <li><em>"Add a comment to KAN-17"</em></li>
          </ul>
          <p style={{ margin: '10px 0 0', fontSize: '12px', color: '#666' }}>
            Restart Copilot CLI if it was already open when you set this up.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => { setPhase('form'); setStatus(s => ({ ...s, configured: false })); }}
            style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #444', borderRadius: '7px', color: '#aaa', cursor: 'pointer', fontSize: '13px' }}
          >
            Update credentials
          </button>
          <button
            onClick={handleDisconnect}
            style={{ padding: '8px 16px', background: 'transparent', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '7px', color: '#f87171', cursor: 'pointer', fontSize: '13px' }}
          >
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  // ── Running / done / error ─────────────────────────────────────────────────
  if (phase === 'running' || phase === 'done' || phase === 'error') {
    return (
      <div style={{ padding: '28px', maxWidth: '560px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
          <span style={{ fontSize: '28px' }}>{phase === 'done' ? '🎉' : phase === 'error' ? '❌' : '⚙️'}</span>
          <h2 style={{ margin: 0, fontSize: '17px', color: '#fff', fontWeight: '600' }}>
            {phase === 'done' ? 'All set!' : phase === 'error' ? 'Setup failed' : 'Setting up…'}
          </h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '24px' }}>
          {steps.map((s, i) => (
            <StepRow key={i} step={s} isActive={i === steps.length - 1 && phase === 'running'} />
          ))}
        </div>

        {phase === 'done' && (
          <div style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: '8px', padding: '14px 16px', marginBottom: '20px' }}>
            <p style={{ margin: 0, fontSize: '13px', color: '#86efac', lineHeight: '1.6' }}>
              🚀 Jira is now connected to Copilot CLI. Start a new Copilot CLI session and try: <em>"List my Jira projects"</em>
            </p>
          </div>
        )}

        {phase === 'error' && (
          <button
            onClick={() => setPhase('form')}
            style={{ padding: '9px 20px', background: 'transparent', border: '1px solid #555', borderRadius: '7px', color: '#aaa', cursor: 'pointer', fontSize: '14px' }}
          >
            ← Try again
          </button>
        )}
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  const isValid = jiraUrl.trim() && email.trim() && apiToken.trim();

  return (
    <div style={{ padding: '28px', maxWidth: '520px' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <span style={{ fontSize: '28px' }}>🎟</span>
        <h2 style={{ margin: 0, fontSize: '17px', color: '#fff', fontWeight: '600' }}>Connect Jira to Copilot CLI</h2>
      </div>
      <p style={{ fontSize: '13px', color: '#666', marginBottom: '24px', lineHeight: '1.6' }}>
        Fill in your details and hit <strong style={{ color: '#aaa' }}>Connect</strong>. Forge will check dependencies, verify your credentials, and write the config — no terminal needed.
      </p>

      <Field
        label="Jira URL"
        hint="The website address you use to open Jira."
        placeholder="https://your-company.atlassian.net"
        value={jiraUrl}
        onChange={setJiraUrl}
      />

      <Field
        label="Email address"
        hint="The email you log in to Atlassian with."
        placeholder="you@example.com"
        value={email}
        onChange={setEmail}
      />

      <Field
        label="API Token"
        hint={<>Generate one at <strong style={{ color: '#8b5cf6' }}>id.atlassian.com → Security → API tokens</strong>. It's like a password just for apps.</>}
        placeholder="Paste your API token here"
        type="password"
        value={apiToken}
        onChange={setApiToken}
      />

      <button
        onClick={handleConnect}
        disabled={!isValid}
        style={{
          width: '100%',
          padding: '11px',
          background: isValid ? '#7c3aed' : '#2a2a2a',
          border: 'none',
          borderRadius: '8px',
          color: isValid ? '#fff' : '#555',
          fontSize: '14px',
          fontWeight: '600',
          cursor: isValid ? 'pointer' : 'default',
          transition: 'background 0.2s',
          marginTop: '4px',
        }}
      >
        Connect →
      </button>

      {!status?.uvxPresent && (
        <p style={{ fontSize: '12px', color: '#666', marginTop: '12px', lineHeight: '1.5' }}>
          ℹ️ <strong style={{ color: '#888' }}>uv</strong> is not installed yet — Forge will install it automatically when you click Connect.
        </p>
      )}
    </div>
  );
};

export default MCPAtlassianWizard;
