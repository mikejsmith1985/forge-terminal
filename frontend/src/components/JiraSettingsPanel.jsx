import { useState, useEffect } from 'react';
import JiraSetupWizard from './JiraSetupWizard';

const DEFAULT_FORM = {
  baseUrl: '',
  email: '',
  apiToken: '',
  defaultProjectKey: '',
  branchTemplate: '{{type}}/{{key}}-{{slug}}',
  prTemplate: '{{key}}: {{summary}}',
  uiMode: { sidebar: true, modal: true, hud: true },
};

/**
 * JiraSettingsPanel — the Jira tab inside SettingsModal.
 * Provides URL, credentials, templates, and UI mode toggles.
 */
export default function JiraSettingsPanel({ onToast }) {
  const [form, setForm]         = useState(DEFAULT_FORM);
  const [saving, setSaving]     = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null); // { success, projectCount?, error? }
  const [authType, setAuthType] = useState('cloud'); // derived from URL
  const [showWizard, setShowWizard] = useState(false);

  // Load existing config on mount
  useEffect(() => {
    fetch('/api/jira/config')
      .then(r => r.ok ? r.json() : null)
      .then(cfg => {
        if (cfg) {
          setForm(f => ({
            ...f,
            baseUrl:          cfg.baseUrl           || '',
            email:            cfg.email             || '',
            apiToken:         cfg.apiToken          || '',
            defaultProjectKey: cfg.defaultProjectKey || '',
            branchTemplate:   cfg.branchTemplate    || f.branchTemplate,
            prTemplate:       cfg.prTemplate        || f.prTemplate,
            uiMode:           cfg.uiMode            || f.uiMode,
          }));
          if (cfg.authType) setAuthType(cfg.authType);
        }
      })
      .catch(() => {});
  }, []);

  // Auto-detect auth type from URL
  useEffect(() => {
    if (!form.baseUrl) return;
    const isCloud = form.baseUrl.toLowerCase().includes('atlassian.net');
    setAuthType(isCloud ? 'cloud' : 'server');
  }, [form.baseUrl]);

  const handleSave = async () => {
    setSaving(true);
    setVerifyResult(null);
    try {
      const res = await fetch('/api/jira/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Save failed');
      onToast?.('Jira settings saved ✓');
    } catch (e) {
      onToast?.('Failed to save Jira settings');
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async () => {
    // Save first so verification uses latest config
    await handleSave();
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await fetch('/api/jira/config/verify', { method: 'POST' });
      const data = await res.json();
      setVerifyResult(data);
    } catch (e) {
      setVerifyResult({ success: false, error: 'Network error' });
    } finally {
      setVerifying(false);
    }
  };

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));
  const setUI = (key, value) => setForm(f => ({ ...f, uiMode: { ...f.uiMode, [key]: value } }));

  const handleWizardComplete = (config) => {
    setForm(f => ({
      ...f,
      baseUrl:          config.baseUrl           || '',
      email:            config.email             || '',
      apiToken:         config.apiToken          || '',
      defaultProjectKey: config.defaultProjectKey || '',
      branchTemplate:   config.branchTemplate    || f.branchTemplate,
      prTemplate:       config.prTemplate        || f.prTemplate,
      uiMode:           config.uiMode            || f.uiMode,
    }));
    setShowWizard(false);
    onToast?.('Jira configured successfully ✓');
  };

  return (
    <div style={{ maxWidth: 600 }}>
      {showWizard && (
        <JiraSetupWizard
          initialForm={form}
          onComplete={handleWizardComplete}
          onDismiss={() => setShowWizard(false)}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4, gap: 12 }}>
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          🎟 Jira Integration
        </h3>
        <button
          className="settings-btn settings-btn--primary"
          onClick={() => setShowWizard(true)}
          style={{ flexShrink: 0, fontSize: 13, padding: '6px 14px' }}
        >
          ✨ Setup Wizard
        </button>
      </div>
      <p style={{ color: '#888', marginBottom: 24, fontSize: 13 }}>
        Connect Forge Terminal to your Jira instance. Credentials are stored locally and never leave your machine.
      </p>

      {/* Connection */}
      <Section title="Connection">
        <Field label="Jira URL">
          <input
            className="settings-input"
            value={form.baseUrl}
            onChange={e => set('baseUrl', e.target.value)}
            placeholder="https://yourcompany.atlassian.net"
          />
          {form.baseUrl && (
            <small style={{ color: '#888', marginTop: 4, display: 'block' }}>
              Detected auth type: <strong style={{ color: '#8b5cf6' }}>{authType === 'cloud' ? 'Cloud (email + API token)' : 'Server / Data Center (PAT)'}</strong>
            </small>
          )}
        </Field>

        {authType === 'cloud' && (
          <Field label="Email">
            <input
              className="settings-input"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              placeholder="you@company.com"
              type="email"
            />
          </Field>
        )}

        <Field label={authType === 'cloud' ? 'API Token' : 'Personal Access Token (PAT)'}>
          <input
            className="settings-input"
            value={form.apiToken}
            onChange={e => set('apiToken', e.target.value)}
            placeholder={authType === 'cloud' ? 'Create at id.atlassian.com/manage-profile/security/api-tokens' : 'Your PAT from Jira profile'}
            type="password"
          />
        </Field>

        <Field label="Default Project Key (optional)">
          <input
            className="settings-input"
            value={form.defaultProjectKey}
            onChange={e => set('defaultProjectKey', e.target.value.toUpperCase())}
            placeholder="PROJ"
            style={{ width: 120 }}
          />
        </Field>

        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="settings-btn settings-btn--primary" onClick={handleVerify} disabled={verifying || !form.baseUrl || !form.apiToken}>
            {verifying ? 'Testing…' : '🔌 Test Connection'}
          </button>
          {verifyResult && (
            <span style={{ fontSize: 13, color: verifyResult.success ? '#22c55e' : '#ef4444' }}>
              {verifyResult.success
                ? `✓ Connected — ${verifyResult.projectCount} project(s) accessible`
                : `✗ ${verifyResult.error}`}
            </span>
          )}
        </div>
      </Section>

      {/* Git Templates */}
      <Section title="Branch &amp; PR Templates">
        <p style={{ color: '#888', fontSize: 13, marginBottom: 12 }}>
          Available variables: <code>{'{{key}}'}</code>, <code>{'{{KEY}}'}</code>, <code>{'{{type}}'}</code> (feature/fix/task), <code>{'{{slug}}'}</code> (summary as slug), <code>{'{{summary}}'}</code>
        </p>
        <Field label="Branch Name Template">
          <input
            className="settings-input"
            value={form.branchTemplate}
            onChange={e => set('branchTemplate', e.target.value)}
            placeholder="{{type}}/{{key}}-{{slug}}"
          />
        </Field>
        <Field label="PR Title Template">
          <input
            className="settings-input"
            value={form.prTemplate}
            onChange={e => set('prTemplate', e.target.value)}
            placeholder="{{key}}: {{summary}}"
          />
        </Field>
      </Section>

      {/* UI Mode */}
      <Section title="UI Surfaces">
        <p style={{ color: '#888', fontSize: 13, marginBottom: 12 }}>Choose which Jira surfaces are visible.</p>
        <Toggle label="Sidebar Panel (persistent ticket viewer)" checked={form.uiMode.sidebar} onChange={v => setUI('sidebar', v)} />
        <Toggle label="Quick Modal (command card / shortcut trigger)" checked={form.uiMode.modal} onChange={v => setUI('modal', v)} />
        <Toggle label="Smart HUD (auto-detects Jira keys in terminal output)" checked={form.uiMode.hud} onChange={v => setUI('hud', v)} />
      </Section>

      {/* Save */}
      <div style={{ marginTop: 24 }}>
        <button className="settings-btn settings-btn--primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Jira Settings'}
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28, paddingBottom: 24, borderBottom: '1px solid #2a2a2a' }}>
      <h4 style={{ marginBottom: 16, color: '#ccc', fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</h4>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', marginBottom: 6, color: '#aaa', fontSize: 13 }}>{label}</label>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, cursor: 'pointer', fontSize: 13, color: '#ccc' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#8b5cf6' }} />
      {label}
    </label>
  );
}
