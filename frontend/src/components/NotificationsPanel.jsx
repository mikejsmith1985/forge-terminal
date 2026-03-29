import React, { useState, useEffect } from 'react';
import { Bell, Send, CheckCircle, AlertCircle } from 'lucide-react';

const DEFAULT_CONFIG = {
  idleDetectionEnabled: true,
  idleTimeoutSeconds: 30,
  baseURL: '',
  tunnelAutoStart: false,
  renderAPIKey: '',
  renderServiceID: '',
};

const NotificationsPanel = ({ onToast }) => {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // 'ok' | 'error' | null

  // Tunnel state
  const [tunnelStatus, setTunnelStatus] = useState({ running: false, url: '', error: '' });
  const [tunnelLoading, setTunnelLoading] = useState(false);

  // Poll tunnel status every 4s
  useEffect(() => {
    const poll = () => {
      fetch('/api/tunnel/status')
        .then(r => r.json())
        .then(s => setTunnelStatus(s))
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, 4000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetch('/api/notify/config')
      .then(r => r.json())
      .then(data => {
        setConfig({ ...DEFAULT_CONFIG, ...data });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/notify/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
      onToast?.('Notification settings saved', 'success');
    } catch (e) {
      onToast?.(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    // Save first so the test uses current form values
    await handleSave();
    try {
      const res = await fetch('/api/notify/test', { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error || 'Test failed');
      setTestResult('ok');
      onToast?.('Test notification sent! Check your phone.', 'success');
    } catch (e) {
      setTestResult('error');
      onToast?.(e.message, 'error');
    } finally {
      setTesting(false);
    }
  };

  const update = (key, value) => setConfig(c => ({ ...c, [key]: value }));

  // Auto-save a single field immediately (used by the idle detection toggle so
  // the preference persists even if the user closes the modal without hitting Save).
  const updateAndSave = async (key, value) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    try {
      await fetch('/api/notify/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig),
      });
    } catch {
      // silently swallow — the Save Settings button remains as fallback
    }
  };

  if (loading) {
    return <div style={{ padding: '24px', color: 'var(--text-muted, #888)' }}>Loading…</div>;
  }

  const transport = config.transport || 'ntfy';
  const isNtfy = transport === 'ntfy';
  const isConfigured = !!config.ntfyTopic;

  return (
    <div style={{ padding: '24px', maxWidth: '520px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Header */}
      <div>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text-primary, #e0e0e0)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bell size={16} /> Agent Notifications
        </h3>
        <p style={{ margin: '6px 0 0', fontSize: '13px', color: 'var(--text-muted, #888)', lineHeight: 1.5 }}>
          Get a push notification on your phone when the agent finishes or needs your input.
        </p>
      </div>

      {/* ── Transport selector ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary, #ccc)' }}>Delivery Method</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          {[
            { value: 'ntfy', label: '🔔 ntfy.sh', sublabel: 'Recommended — zero setup' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => update('transport', opt.value)}
              style={{
                flex: 1,
                border: `2px solid ${transport === opt.value ? 'var(--accent, #7c9ef7)' : 'var(--border, #444)'}`,
                borderRadius: '8px',
                background: transport === opt.value ? 'rgba(124,158,247,0.1)' : 'var(--surface, #1e1e1e)',
                color: transport === opt.value ? 'var(--accent, #7c9ef7)' : 'var(--text-muted, #888)',
                cursor: 'pointer',
                padding: '8px 12px',
                textAlign: 'center',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 600 }}>{opt.label}</div>
              <div style={{ fontSize: '11px', marginTop: '2px', opacity: 0.75 }}>{opt.sublabel}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ── ntfy.sh config ──────────────────────────────────────────────── */}
      {isNtfy && (
        <>
          <div style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '6px', padding: '10px 14px', fontSize: '12px', color: '#86efac', lineHeight: 1.6 }}>
            <strong style={{ color: '#4ade80' }}>Quickstart:</strong> Install the free <a href="https://ntfy.sh" target="_blank" rel="noreferrer" style={{ color: '#4ade80' }}>ntfy app</a> on your phone,
            choose a unique topic name below, and subscribe to it in the app. No account required.
          </div>

          {/* Outbound topic */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary, #ccc)' }}>
              Notification Topic <span style={{ color: '#ef4444', fontWeight: 700 }}>*</span>
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={config.ntfyTopic || ''}
                onChange={e => update('ntfyTopic', e.target.value)}
                placeholder="forge-abc123  (make this unique and hard to guess)"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={() => navigator.clipboard.writeText(config.ntfyTopic || '').then(() => onToast?.('Copied', 'success'))}
                style={iconBtnStyle}
                title="Copy topic"
              >📋</button>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted, #888)', lineHeight: 1.5 }}>
              Forge will publish notifications to <code style={codeStyle}>ntfy.sh/{config.ntfyTopic || 'YOUR_TOPIC'}</code>.
              Subscribe to this topic in the ntfy app on your phone.
            </span>
          </div>

          {/* Inbound topic (optional) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary, #ccc)' }}>
              Inbound Topic <span style={{ fontWeight: 400, color: 'var(--text-muted, #888)' }}>(optional — for phone→PC replies)</span>
            </label>
            <input
              type="text"
              value={config.ntfyInboundTopic || ''}
              onChange={e => update('ntfyInboundTopic', e.target.value)}
              placeholder="forge-abc123-in"
              style={inputStyle}
            />
            <span style={{ fontSize: '11px', color: 'var(--text-muted, #888)', lineHeight: 1.5 }}>
              When set, Forge polls this topic for messages you publish from your phone.
              In the ntfy app: tap Publish → enter this topic → type your message.
              Messages are injected into the agent as if you typed them.
            </span>
          </div>

          {/* Self-hosted ntfy server (advanced) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary, #ccc)' }}>
              ntfy Server URL <span style={{ fontWeight: 400, color: 'var(--text-muted, #888)' }}>(optional — leave blank for ntfy.sh)</span>
            </label>
            <input
              type="url"
              value={config.ntfyServerURL || ''}
              onChange={e => update('ntfyServerURL', e.target.value)}
              placeholder="https://ntfy.sh"
              style={inputStyle}
            />
          </div>
        </>
      )}

      {/* ── Shared: idle detection ──────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid var(--border, #333)' }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <button
          onClick={() => updateAndSave('idleDetectionEnabled', !config.idleDetectionEnabled)}
          style={{ ...toggleStyle, background: config.idleDetectionEnabled ? 'var(--accent, #7c9ef7)' : 'var(--surface, #333)' }}
          aria-label="Toggle idle detection"
        >
          <span style={{ ...toggleKnobStyle, transform: config.idleDetectionEnabled ? 'translateX(18px)' : 'translateX(2px)' }} />
        </button>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary, #ccc)' }}>
            Notify when terminal goes idle or agent finishes
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted, #888)', marginTop: '2px' }}>
            Sends a notification when the terminal has no output for the timeout below, or when the AI agent completes a response.
          </div>
        </div>
      </div>

      {config.idleDetectionEnabled && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary, #ccc)' }}>
            Idle timeout: <strong>{config.idleTimeoutSeconds}s</strong>
          </label>
          <input
            type="range" min={10} max={300} step={5}
            value={config.idleTimeoutSeconds}
            onChange={e => update('idleTimeoutSeconds', Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--accent, #7c9ef7)' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted, #888)' }}>
            <span>10s</span><span>5 min</span>
          </div>
        </div>
      )}

      {/* ── Actions ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
        <button onClick={handleSave} disabled={saving} style={{ ...btnStyle, background: 'var(--accent, #7c9ef7)', color: '#000' }}>
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
        <button
          onClick={handleTest}
          disabled={testing || !isConfigured}
          style={{ ...btnStyle, background: 'var(--surface-2, #444)', color: 'var(--text-primary, #e0e0e0)', display: 'flex', alignItems: 'center', gap: '6px' }}
          title={!isConfigured ? 'Enter a notification topic first' : 'Send a test notification to your phone'}
        >
          {testing ? 'Sending…' : <><Send size={13} /> Test Notification</>}
        </button>
        {testResult === 'ok' && <CheckCircle size={20} style={{ color: '#4caf50', alignSelf: 'center' }} />}
        {testResult === 'error' && <AlertCircle size={20} style={{ color: '#f44336', alignSelf: 'center' }} />}
      </div>

      {/* Setup reminder */}
      {!isConfigured && (
        <div style={{ background: 'rgba(255,200,0,0.08)', border: '1px solid rgba(255,200,0,0.2)', borderRadius: '6px', padding: '10px 14px', fontSize: '12px', color: '#ffc107', lineHeight: 1.5 }}>
          <strong>Setup required:</strong> Enter a topic name above, then subscribe to it in the <a href="https://ntfy.sh" target="_blank" rel="noreferrer" style={{ color: '#ffd54f' }}>ntfy app</a> on your phone.
        </div>
      )}
    </div>
  );
};

// ── Styles ───────────────────────────────────────────────────────────────────

const inputStyle = {
  background: 'var(--surface, #1e1e1e)',
  border: '1px solid var(--border, #444)',
  borderRadius: '6px',
  color: 'var(--text-primary, #e0e0e0)',
  fontSize: '13px',
  padding: '8px 10px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const btnStyle = {
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 500,
  padding: '8px 16px',
  transition: 'opacity 0.15s',
};

const iconBtnStyle = {
  background: 'var(--surface, #1e1e1e)',
  border: '1px solid var(--border, #444)',
  borderRadius: '6px',
  color: 'var(--text-muted, #888)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  padding: '0 10px',
};

const toggleStyle = {
  border: 'none',
  borderRadius: '12px',
  cursor: 'pointer',
  flexShrink: 0,
  height: '22px',
  padding: 0,
  position: 'relative',
  transition: 'background 0.2s',
  width: '40px',
};

const toggleKnobStyle = {
  background: '#fff',
  borderRadius: '50%',
  height: '18px',
  left: 0,
  position: 'absolute',
  top: '2px',
  transition: 'transform 0.2s',
  width: '18px',
};

const codeStyle = {
  background: 'var(--surface, #2a2a2a)',
  borderRadius: '3px',
  fontFamily: 'monospace',
  fontSize: '11px',
  padding: '1px 4px',
};

export default NotificationsPanel;