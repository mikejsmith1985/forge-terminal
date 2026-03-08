import React, { useState, useEffect } from 'react';
import { Bell, BellOff, Send, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';

const DEFAULT_CONFIG = {
  webhookURL: '',
  webhookSecret: '',
  idleDetectionEnabled: true,
  idleTimeoutSeconds: 30,
};

const NotificationsPanel = ({ onToast }) => {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // 'ok' | 'error' | null

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

  if (loading) {
    return <div style={{ padding: '24px', color: 'var(--text-muted, #888)' }}>Loading…</div>;
  }

  const isConfigured = config.webhookURL && config.webhookSecret;

  return (
    <div style={{ padding: '24px', maxWidth: '520px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Header */}
      <div>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text-primary, #e0e0e0)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bell size={16} /> Agent Notifications
        </h3>
        <p style={{ margin: '6px 0 0', fontSize: '13px', color: 'var(--text-muted, #888)', lineHeight: 1.5 }}>
          Get a push notification on your phone when the agent finishes or needs your input.
          Uses your <a href="https://mbl2pc.onrender.com" target="_blank" rel="noreferrer" style={{ color: 'var(--accent, #7c9ef7)' }}>mbl2pc</a> instance for delivery.
        </p>
      </div>

      {/* Webhook URL */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary, #ccc)' }}>
          mbl2pc URL
        </label>
        <input
          type="url"
          value={config.webhookURL}
          onChange={e => update('webhookURL', e.target.value)}
          placeholder="https://mbl2pc.onrender.com"
          style={inputStyle}
        />
        <span style={{ fontSize: '11px', color: 'var(--text-muted, #888)' }}>
          Root URL only — do <strong>not</strong> include <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: '3px' }}>/webhook</code> (e.g. <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: '3px' }}>https://mbl2pc.onrender.com</code>)
        </span>
      </div>

      {/* Webhook Secret */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary, #ccc)' }}>
          Webhook Secret
        </label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type={showSecret ? 'text' : 'password'}
            value={config.webhookSecret}
            onChange={e => update('webhookSecret', e.target.value)}
            placeholder="your WEBHOOK_SECRET from Render"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            onClick={() => setShowSecret(s => !s)}
            style={iconBtnStyle}
            title={showSecret ? 'Hide secret' : 'Show secret'}
          >
            {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <span style={{ fontSize: '11px', color: 'var(--text-muted, #888)' }}>
          Must match <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: '3px' }}>WEBHOOK_SECRET</code> env var on Render.
        </span>
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--border, #333)' }} />

      {/* Idle detection toggle */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <button
          onClick={() => update('idleDetectionEnabled', !config.idleDetectionEnabled)}
          style={{
            ...toggleStyle,
            background: config.idleDetectionEnabled ? 'var(--accent, #7c9ef7)' : 'var(--surface, #333)',
          }}
          aria-label="Toggle idle detection"
        >
          <span style={{
            ...toggleKnobStyle,
            transform: config.idleDetectionEnabled ? 'translateX(18px)' : 'translateX(2px)',
          }} />
        </button>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary, #ccc)' }}>
            Auto-notify when terminal goes idle
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted, #888)', marginTop: '2px' }}>
            Sends a notification after the terminal has had no output for the timeout below.
          </div>
        </div>
      </div>

      {/* Idle timeout slider */}
      {config.idleDetectionEnabled && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary, #ccc)' }}>
            Idle timeout: <strong>{config.idleTimeoutSeconds}s</strong>
          </label>
          <input
            type="range"
            min={10}
            max={300}
            step={5}
            value={config.idleTimeoutSeconds}
            onChange={e => update('idleTimeoutSeconds', Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--accent, #7c9ef7)' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted, #888)' }}>
            <span>10s</span><span>5 min</span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ ...btnStyle, background: 'var(--accent, #7c9ef7)', color: '#000' }}
        >
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
        <button
          onClick={handleTest}
          disabled={testing || !config.webhookURL}
          style={{ ...btnStyle, background: 'var(--surface-2, #444)', color: 'var(--text-primary, #e0e0e0)', display: 'flex', alignItems: 'center', gap: '6px' }}
          title={!config.webhookURL ? 'Enter a webhook URL first' : 'Send a test notification to your phone'}
        >
          {testing ? 'Sending…' : <><Send size={13} /> Test Notification</>}
        </button>
        {testResult === 'ok' && <CheckCircle size={20} style={{ color: '#4caf50', alignSelf: 'center' }} />}
        {testResult === 'error' && <AlertCircle size={20} style={{ color: '#f44336', alignSelf: 'center' }} />}
      </div>

      {/* Setup reminder */}
      {!isConfigured && (
        <div style={{ background: 'rgba(255,200,0,0.08)', border: '1px solid rgba(255,200,0,0.2)', borderRadius: '6px', padding: '10px 14px', fontSize: '12px', color: '#ffc107', lineHeight: 1.5 }}>
          <strong>Setup required:</strong> Add <code>WEBHOOK_SECRET</code> and <code>WEBHOOK_USER_ID</code> to your Render environment variables on mbl2pc, then enter the same secret here.
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

export default NotificationsPanel;
