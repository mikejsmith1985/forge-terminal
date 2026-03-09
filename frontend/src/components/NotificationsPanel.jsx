import React, { useState, useEffect } from 'react';
import { Bell, BellOff, Send, Eye, EyeOff, CheckCircle, AlertCircle, Radio } from 'lucide-react';

const DEFAULT_CONFIG = {
  webhookURL: '',
  webhookSecret: '',
  idleDetectionEnabled: true,
  idleTimeoutSeconds: 30,
  baseURL: '',
  tunnelAutoStart: false,
  renderAPIKey: '',
  renderServiceID: '',
};

const NotificationsPanel = ({ onToast }) => {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [showSecret, setShowSecret] = useState(false);
  const [showRenderKey, setShowRenderKey] = useState(false);
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

      {/* Remote Response Base URL */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary, #ccc)' }}>
          Forge Base URL <span style={{ fontWeight: 400, color: 'var(--text-muted, #888)' }}>(optional — for remote responses)</span>
        </label>
        <input
          type="url"
          value={config.baseURL}
          onChange={e => update('baseURL', e.target.value)}
          placeholder="http://192.168.1.100:8080"
          style={inputStyle}
        />
        <span style={{ fontSize: '11px', color: 'var(--text-muted, #888)', lineHeight: 1.5 }}>
          When set, Forge embeds clickable response links in notifications so you can answer prompts
          directly from your phone — without returning to the PC. Use your local IP or hostname.
        </span>
      </div>

      {/* FORGE_INBOUND_URL hint — shown when baseURL is configured */}
      {config.baseURL && (
        <div style={{
          background: 'rgba(96,165,250,0.06)',
          border: '1px solid rgba(96,165,250,0.2)',
          borderRadius: '6px',
          padding: '10px 14px',
          fontSize: '12px',
          color: '#93c5fd',
          lineHeight: 1.6,
        }}>
          <strong style={{ color: '#bfdbfe' }}>Two-way replies enabled</strong><br />
          Set this environment variable on your MBL2PC Render instance so messages you type
          in the MBL2PC chat are forwarded back to Forge and injected into the agent:
          <div style={{
            marginTop: '6px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            <div style={{
              flex: 1,
              background: 'rgba(0,0,0,0.3)',
              borderRadius: '4px',
              padding: '6px 10px',
              fontFamily: 'monospace',
              fontSize: '12px',
              color: '#e0f2fe',
              wordBreak: 'break-all',
            }}>
              FORGE_INBOUND_URL={config.baseURL}
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(`FORGE_INBOUND_URL=${config.baseURL}`)
                  .then(() => onToast?.('Copied to clipboard', 'success'))
                  .catch(() => onToast?.('Copy failed', 'error'));
              }}
              title="Copy to clipboard"
              style={{
                flexShrink: 0,
                background: 'rgba(96,165,250,0.15)',
                border: '1px solid rgba(96,165,250,0.3)',
                borderRadius: '4px',
                color: '#93c5fd',
                cursor: 'pointer',
                padding: '6px 10px',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                whiteSpace: 'nowrap',
              }}
            >
              📋 Copy
            </button>
          </div>
          <div style={{ marginTop: '8px', color: '#7dd3fc', fontSize: '11px', lineHeight: 1.6 }}>
            ⚠️ <strong>Different network?</strong> A LAN IP won't work if MBL2PC (on Render) can't reach your PC.
            Use a tunnel to get a public URL:{' '}
            <a href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/" target="_blank" rel="noreferrer" style={{ color: '#38bdf8' }}>Cloudflare Tunnel</a>
            {' '}(free, stable) or{' '}
            <a href="https://ngrok.com" target="_blank" rel="noreferrer" style={{ color: '#38bdf8' }}>ngrok</a>.
            Then paste the public HTTPS URL above instead of your LAN IP.
          </div>
        </div>
      )}

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--border, #333)' }} />

      {/* ── Cloudflare Tunnel Auto-Management ─────────────────────────── */}
      <div>
        <h4 style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary, #e0e0e0)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Radio size={14} /> Cloudflare Tunnel
        </h4>
        <p style={{ margin: '0 0 14px', fontSize: '12px', color: 'var(--text-muted, #888)', lineHeight: 1.5 }}>
          Forge can manage a <code style={codeStyle}>cloudflared</code> quick tunnel automatically.
          When the URL changes, it updates <code style={codeStyle}>FORGE_INBOUND_URL</code> on your
          Render MBL2PC service without any manual steps.
          Requires <a href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent, #7c9ef7)' }}>cloudflared</a> installed on this machine.
        </p>

        {/* Tunnel status indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', padding: '10px 12px', background: 'var(--surface, #1e1e1e)', borderRadius: '6px', border: '1px solid var(--border, #333)' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: tunnelStatus.running ? '#22c55e' : '#555', boxShadow: tunnelStatus.running ? '0 0 6px #22c55e' : 'none', display: 'inline-block' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {tunnelStatus.running && tunnelStatus.url
              ? <span style={{ fontSize: '12px', color: '#4ade80', fontFamily: 'monospace', wordBreak: 'break-all' }}>{tunnelStatus.url}</span>
              : tunnelStatus.running
                ? <span style={{ fontSize: '12px', color: '#888' }}>Starting… waiting for URL</span>
                : <span style={{ fontSize: '12px', color: '#555' }}>Tunnel not running</span>
            }
            {tunnelStatus.error && <div style={{ fontSize: '11px', color: '#f87171', marginTop: '2px' }}>{tunnelStatus.error}</div>}
          </div>
          <button
            disabled={tunnelLoading}
            onClick={async () => {
              setTunnelLoading(true);
              try {
                await fetch(tunnelStatus.running ? '/api/tunnel/stop' : '/api/tunnel/start', { method: 'POST' });
                const s = await fetch('/api/tunnel/status').then(r => r.json());
                setTunnelStatus(s);
              } catch { /* ignore */ } finally { setTunnelLoading(false); }
            }}
            style={{ ...btnStyle, background: tunnelStatus.running ? '#7f1d1d' : 'var(--accent, #7c9ef7)', color: tunnelStatus.running ? '#fca5a5' : '#000', padding: '6px 12px', fontSize: '12px' }}
          >
            {tunnelLoading ? '…' : tunnelStatus.running ? 'Stop' : 'Start'}
          </button>
        </div>

        {/* Auto-start toggle */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '14px' }}>
          <button
            onClick={() => updateAndSave('tunnelAutoStart', !config.tunnelAutoStart)}
            style={{ ...toggleStyle, background: config.tunnelAutoStart ? 'var(--accent, #7c9ef7)' : 'var(--surface, #333)' }}
            aria-label="Toggle tunnel auto-start"
          >
            <span style={{ ...toggleKnobStyle, transform: config.tunnelAutoStart ? 'translateX(18px)' : 'translateX(2px)' }} />
          </button>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary, #ccc)' }}>Auto-start tunnel when Forge opens</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted, #888)', marginTop: '2px' }}>Cloudflared starts automatically and keeps Render in sync.</div>
          </div>
        </div>

        {/* Render API Key */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
          <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary, #ccc)' }}>Render API Key</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type={showRenderKey ? 'text' : 'password'}
              value={config.renderAPIKey}
              onChange={e => update('renderAPIKey', e.target.value)}
              placeholder="rnd_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              style={{ ...inputStyle, flex: 1 }}
            />
            <button onClick={() => setShowRenderKey(s => !s)} style={iconBtnStyle} title={showRenderKey ? 'Hide' : 'Show'}>
              {showRenderKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted, #888)' }}>
            Get from <a href="https://dashboard.render.com/u/settings#api-keys" target="_blank" rel="noreferrer" style={{ color: 'var(--accent, #7c9ef7)' }}>Render Dashboard → Account Settings → API Keys</a>
          </span>
        </div>

        {/* Render Service ID */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary, #ccc)' }}>MBL2PC Service ID</label>
          <input
            type="text"
            value={config.renderServiceID}
            onChange={e => update('renderServiceID', e.target.value)}
            placeholder="srv-xxxxxxxxxxxxxxxxxxxx"
            style={inputStyle}
          />
          <span style={{ fontSize: '11px', color: 'var(--text-muted, #888)' }}>
            Found in your MBL2PC service URL on Render: <code style={codeStyle}>dashboard.render.com/web/srv-…</code>
          </span>
        </div>
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--border, #333)' }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <button
          onClick={() => updateAndSave('idleDetectionEnabled', !config.idleDetectionEnabled)}
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
            Notify when terminal goes idle or agent finishes
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted, #888)', marginTop: '2px' }}>
            Sends a notification when the terminal has had no output for the timeout below, or when the AI agent completes a response.
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

const codeStyle = {
  background: 'var(--surface, #2a2a2a)',
  borderRadius: '3px',
  fontFamily: 'monospace',
  fontSize: '11px',
  padding: '1px 4px',
};

export default NotificationsPanel;
