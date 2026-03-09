import { useState, useEffect } from 'react';

const TOTAL_STEPS = 6;

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
 * JiraSetupWizard — a guided multi-step wizard for first-time Jira configuration.
 * Props:
 *   onComplete(config)  — called when the wizard finishes successfully
 *   onDismiss()         — called when the user closes/cancels
 *   initialForm         — existing config values to pre-populate (optional)
 */
export default function JiraSetupWizard({ onComplete, onDismiss, initialForm }) {
  const [step, setStep]               = useState(1);
  const [form, setForm]               = useState({ ...DEFAULT_FORM, ...initialForm });
  const [authType, setAuthType]       = useState('cloud');
  const [verifying, setVerifying]     = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [saving, setSaving]           = useState(false);

  // Auto-detect auth type from URL
  useEffect(() => {
    if (!form.baseUrl) return;
    const isCloud = form.baseUrl.toLowerCase().includes('atlassian.net');
    setAuthType(isCloud ? 'cloud' : 'server');
  }, [form.baseUrl]);

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));
  const setUI = (key, value) => setForm(f => ({ ...f, uiMode: { ...f.uiMode, [key]: value } }));

  const handleVerify = async () => {
    // Save first so backend uses latest values
    setSaving(true);
    try {
      await fetch('/api/jira/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
    } catch (_) {}
    setSaving(false);

    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await fetch('/api/jira/config/verify', { method: 'POST' });
      const data = await res.json();
      setVerifyResult(data);
    } catch {
      setVerifyResult({ success: false, error: 'Network error — is Forge running?' });
    } finally {
      setVerifying(false);
    }
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      await fetch('/api/jira/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      onComplete?.(form);
    } catch {
      onComplete?.(form);
    } finally {
      setSaving(false);
    }
  };

  const canProceedStep3 = form.baseUrl.trim() !== '' && form.apiToken.trim() !== '' &&
    (authType === 'server' || form.email.trim() !== '');
  const canProceedStep4 = verifyResult?.success === true;

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>

        {/* Header */}
        <div style={styles.header}>
          <span style={{ fontSize: 20 }}>🎟</span>
          <span style={{ fontWeight: 700, fontSize: 16, color: '#e2e8f0' }}>Jira Setup Wizard</span>
          <button style={styles.closeBtn} onClick={onDismiss} title="Close wizard">✕</button>
        </div>

        {/* Progress bar */}
        <ProgressBar step={step} total={TOTAL_STEPS} />

        {/* Step content */}
        <div style={styles.body}>
          {step === 1 && <StepWelcome />}
          {step === 2 && <StepJiraType authType={authType} />}
          {step === 3 && (
            <StepCredentials
              form={form} set={set} authType={authType}
            />
          )}
          {step === 4 && (
            <StepTestConnection
              form={form} authType={authType}
              verifying={verifying} saving={saving}
              verifyResult={verifyResult}
              onVerify={handleVerify}
            />
          )}
          {step === 5 && <StepDefaults form={form} set={set} />}
          {step === 6 && <StepUISurfaces form={form} setUI={setUI} />}
        </div>

        {/* Footer navigation */}
        <div style={styles.footer}>
          {step > 1
            ? <button style={styles.backBtn} onClick={() => { setStep(s => s - 1); setVerifyResult(null); }}>← Back</button>
            : <span />
          }

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: '#555', fontSize: 12 }}>Step {step} of {TOTAL_STEPS}</span>

            {step < TOTAL_STEPS ? (
              <button
                style={{
                  ...styles.nextBtn,
                  opacity: (step === 3 && !canProceedStep3) || (step === 4 && !canProceedStep4) ? 0.4 : 1,
                  cursor: (step === 3 && !canProceedStep3) || (step === 4 && !canProceedStep4) ? 'not-allowed' : 'pointer',
                }}
                onClick={() => setStep(s => s + 1)}
                disabled={(step === 3 && !canProceedStep3) || (step === 4 && !canProceedStep4)}
              >
                {step === 4 ? 'Continue →' : 'Next →'}
              </button>
            ) : (
              <button style={styles.finishBtn} onClick={handleFinish} disabled={saving}>
                {saving ? 'Saving…' : '✓ Finish Setup'}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Step 1: Welcome ─────────────────────────────────────────────────────────

function StepWelcome() {
  return (
    <div>
      <StepTitle icon="👋" title="Welcome to Jira Integration" />
      <p style={styles.lead}>
        This wizard will connect <strong style={{ color: '#8b5cf6' }}>Forge Terminal</strong> to your Jira
        instance in just a few minutes.
      </p>
      <p style={styles.body2}>Here's what we'll do:</p>
      <ol style={styles.orderedList}>
        <li>Identify your Jira type (Cloud or Server)</li>
        <li>Enter your credentials and Jira URL</li>
        <li>Test the connection to make sure everything works</li>
        <li>Set up branch &amp; PR title templates</li>
        <li>Choose which Jira UI elements to show</li>
      </ol>
      <InfoBox>
        Your credentials are stored locally on your machine only — they are never sent anywhere
        other than directly to your Jira instance.
      </InfoBox>
    </div>
  );
}

// ─── Step 2: Jira Type ───────────────────────────────────────────────────────

function StepJiraType({ authType }) {
  return (
    <div>
      <StepTitle icon="🔍" title="Which Jira are you using?" />
      <p style={styles.lead}>
        Forge automatically detects your Jira type from the URL you provide in the next step —
        you don't need to choose manually.
      </p>
      <p style={styles.body2}>Here's how to find out which you have:</p>

      <TypeCard
        icon="☁️"
        title="Jira Cloud"
        active={authType === 'cloud'}
        description="Your Jira URL looks like https://yourcompany.atlassian.net"
        auth="Uses your account email + an API token"
        howTo="Create the token at id.atlassian.com → Profile → Security → API tokens"
      />

      <TypeCard
        icon="🖥"
        title="Jira Server / Data Center"
        active={authType === 'server'}
        description="Your Jira URL is a custom domain, e.g. https://jira.mycompany.com"
        auth="Uses a Personal Access Token (PAT) — no email needed"
        howTo="Create the token in Jira → Profile avatar → Personal Access Tokens"
      />

      <InfoBox>
        On the next step, enter your URL and we'll detect the type automatically.
      </InfoBox>
    </div>
  );
}

function TypeCard({ icon, title, description, auth, howTo, active }) {
  return (
    <div style={{
      ...styles.typeCard,
      borderColor: active ? '#8b5cf6' : '#2a2a2a',
      background: active ? 'rgba(139,92,246,0.08)' : '#1a1a1a',
    }}>
      <div style={{ fontSize: 22, marginRight: 14, flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: 4 }}>{title}</div>
        <div style={{ color: '#aaa', fontSize: 13, marginBottom: 3 }}>{description}</div>
        <div style={{ color: '#888', fontSize: 12, marginBottom: 3 }}>🔑 {auth}</div>
        <div style={{ color: '#666', fontSize: 12 }}>📋 {howTo}</div>
      </div>
    </div>
  );
}

// ─── Step 3: Credentials ─────────────────────────────────────────────────────

function StepCredentials({ form, set, authType }) {
  return (
    <div>
      <StepTitle icon="🔑" title="Enter your credentials" />

      <WizardField label="Jira URL" required>
        <input
          className="settings-input"
          value={form.baseUrl}
          onChange={e => set('baseUrl', e.target.value)}
          placeholder="https://yourcompany.atlassian.net"
          autoFocus
          style={styles.input}
        />
        {form.baseUrl && (
          <small style={styles.hint}>
            Detected: <strong style={{ color: '#8b5cf6' }}>
              {authType === 'cloud' ? 'Jira Cloud — you\'ll need email + API token' : 'Jira Server / Data Center — you\'ll need a PAT'}
            </strong>
          </small>
        )}
        <small style={styles.hint}>No trailing slash. No path after the domain.</small>
      </WizardField>

      {authType === 'cloud' && (
        <WizardField label="Account email" required>
          <input
            className="settings-input"
            value={form.email}
            onChange={e => set('email', e.target.value)}
            placeholder="you@company.com"
            type="email"
            style={styles.input}
          />
          <small style={styles.hint}>Must match the Jira account that owns the API token.</small>
        </WizardField>
      )}

      <WizardField
        label={authType === 'cloud' ? 'API Token' : 'Personal Access Token (PAT)'}
        required
      >
        <input
          className="settings-input"
          value={form.apiToken}
          onChange={e => set('apiToken', e.target.value)}
          placeholder={authType === 'cloud' ? 'Paste your API token here' : 'Paste your PAT here'}
          type="password"
          style={styles.input}
        />
        {authType === 'cloud' ? (
          <small style={styles.hint}>
            Create one at{' '}
            <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noreferrer" style={{ color: '#8b5cf6' }}>
              id.atlassian.com → Security → API tokens
            </a>
            . Click <em>Create API token</em>, name it "Forge Terminal", and paste it here.
          </small>
        ) : (
          <small style={styles.hint}>
            In Jira, click your profile avatar → <em>Profile</em> → <em>Personal Access Tokens</em> → <em>Create token</em>.
            Give it a name, set expiry if required, then paste it here.
          </small>
        )}
      </WizardField>
    </div>
  );
}

// ─── Step 4: Test Connection ──────────────────────────────────────────────────

function StepTestConnection({ form, authType, verifying, saving, verifyResult, onVerify }) {
  return (
    <div>
      <StepTitle icon="🔌" title="Test the connection" />
      <p style={styles.lead}>
        Let's make sure everything is set up correctly before continuing.
      </p>

      <div style={styles.summaryBox}>
        <SummaryRow label="Jira URL" value={form.baseUrl || '—'} />
        {authType === 'cloud' && <SummaryRow label="Email" value={form.email || '—'} />}
        <SummaryRow label={authType === 'cloud' ? 'API Token' : 'PAT'} value={form.apiToken ? '••••••••' : '—'} />
      </div>

      <div style={{ marginTop: 20, marginBottom: 16 }}>
        <button
          style={{ ...styles.testBtn, opacity: verifying || saving ? 0.6 : 1 }}
          onClick={onVerify}
          disabled={verifying || saving}
        >
          {verifying ? '⏳ Testing…' : saving ? '💾 Saving…' : '🔌 Test Connection'}
        </button>
      </div>

      {verifyResult && (
        <div style={{
          ...styles.resultBox,
          borderColor: verifyResult.success ? '#22c55e' : '#ef4444',
          background: verifyResult.success ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
        }}>
          {verifyResult.success ? (
            <>
              <div style={{ color: '#22c55e', fontWeight: 600, marginBottom: 6 }}>
                ✓ Connected successfully!
              </div>
              <div style={{ color: '#aaa', fontSize: 13 }}>
                {verifyResult.projectCount} project(s) accessible. Click <strong>Continue</strong> to proceed.
              </div>
            </>
          ) : (
            <>
              <div style={{ color: '#ef4444', fontWeight: 600, marginBottom: 6 }}>
                ✗ Connection failed
              </div>
              <div style={{ color: '#aaa', fontSize: 13, marginBottom: 10 }}>{verifyResult.error}</div>
              <TroubleshootingTips authType={authType} />
            </>
          )}
        </div>
      )}

      {!verifyResult && (
        <InfoBox>
          The test saves your credentials temporarily and calls your Jira instance. No data is modified.
        </InfoBox>
      )}
    </div>
  );
}

function TroubleshootingTips({ authType }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ color: '#777', fontSize: 12, marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Quick checks:</div>
      <ul style={{ color: '#888', fontSize: 12, margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
        <li>URL has no trailing slash (e.g. <code style={{ color: '#aaa' }}>https://company.atlassian.net</code>)</li>
        {authType === 'cloud' && <li>Email matches the Jira account that owns the token</li>}
        <li>Token has not expired or been revoked</li>
        {authType === 'server' && <li>PAT has the <em>Browse Projects</em> permission</li>}
        <li>You can reach the Jira URL from this machine</li>
      </ul>
      <div style={{ marginTop: 8, color: '#777', fontSize: 12 }}>
        If checks pass, click <strong style={{ color: '#ccc' }}>Back</strong> to correct any details and try again.
      </div>
    </div>
  );
}

// ─── Step 5: Defaults ────────────────────────────────────────────────────────

function StepDefaults({ form, set }) {
  return (
    <div>
      <StepTitle icon="⚙️" title="Set your defaults" />
      <p style={styles.lead}>These defaults make everyday workflows faster. You can change them anytime in Settings.</p>

      <WizardField label="Default Project Key (optional)">
        <input
          className="settings-input"
          value={form.defaultProjectKey}
          onChange={e => set('defaultProjectKey', e.target.value.toUpperCase())}
          placeholder="PROJ"
          style={{ ...styles.input, width: 140 }}
        />
        <small style={styles.hint}>
          The short code shown before ticket numbers (e.g. <strong>PROJ</strong>-123).
          Pre-fills the project field when creating tickets.
        </small>
      </WizardField>

      <WizardField label="Branch name template">
        <input
          className="settings-input"
          value={form.branchTemplate}
          onChange={e => set('branchTemplate', e.target.value)}
          placeholder="{{type}}/{{key}}-{{slug}}"
          style={styles.input}
        />
        <small style={styles.hint}>
          Example output: <code style={{ color: '#8b5cf6' }}>fix/proj-123-button-not-responding</code>
        </small>
      </WizardField>

      <WizardField label="PR title template">
        <input
          className="settings-input"
          value={form.prTemplate}
          onChange={e => set('prTemplate', e.target.value)}
          placeholder="{{key}}: {{summary}}"
          style={styles.input}
        />
        <small style={styles.hint}>
          Example output: <code style={{ color: '#8b5cf6' }}>PROJ-123: Button not responding on mobile</code>
        </small>
      </WizardField>

      <div style={{ ...styles.varTable, marginTop: 16 }}>
        <div style={{ color: '#888', fontSize: 12, marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Available variables</div>
        {[
          ['{{key}}', 'Ticket key, e.g. PROJ-123'],
          ['{{type}}', 'fix · task · epic · feature (derived from issue type)'],
          ['{{slug}}', 'Summary as lowercase hyphenated slug, max 40 chars'],
          ['{{summary}}', 'Full ticket summary text'],
        ].map(([v, d]) => (
          <div key={v} style={{ display: 'flex', gap: 12, marginBottom: 5, fontSize: 12 }}>
            <code style={{ color: '#8b5cf6', width: 120, flexShrink: 0 }}>{v}</code>
            <span style={{ color: '#888' }}>{d}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Step 6: UI Surfaces ─────────────────────────────────────────────────────

function StepUISurfaces({ form, setUI }) {
  return (
    <div>
      <StepTitle icon="🖥" title="Choose your UI surfaces" />
      <p style={styles.lead}>
        Forge has three Jira UI elements. Enable the ones you'd like to use — all three are on by default.
      </p>

      <SurfaceCard
        icon="📌"
        title="Sidebar Panel"
        description="A persistent panel accessible from the toolbar. Has three tabs: view the linked ticket, search for tickets, and create new ones."
        checked={form.uiMode.sidebar}
        onChange={v => setUI('sidebar', v)}
      />
      <SurfaceCard
        icon="⚡"
        title="Quick Modal"
        description="A floating modal that opens from a toolbar button or command card. Ideal for quickly linking or creating a ticket without leaving the terminal."
        checked={form.uiMode.modal}
        onChange={v => setUI('modal', v)}
      />
      <SurfaceCard
        icon="🔍"
        title="Smart HUD"
        description='Automatically detects Jira ticket keys (e.g. PROJ-123) in terminal output and shows a small overlay with a "Link to Tab" button.'
        checked={form.uiMode.hud}
        onChange={v => setUI('hud', v)}
      />

      <InfoBox>
        You can change these at any time in <strong>Settings → 🎟 Jira → UI Surfaces</strong>.
      </InfoBox>
    </div>
  );
}

function SurfaceCard({ icon, title, description, checked, onChange }) {
  return (
    <label style={{
      ...styles.surfaceCard,
      borderColor: checked ? '#8b5cf6' : '#2a2a2a',
      background: checked ? 'rgba(139,92,246,0.07)' : '#1a1a1a',
      cursor: 'pointer',
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ width: 16, height: 16, accentColor: '#8b5cf6', flexShrink: 0, marginTop: 2 }}
      />
      <div style={{ marginLeft: 12 }}>
        <div style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 14, marginBottom: 3 }}>
          {icon} {title}
        </div>
        <div style={{ color: '#888', fontSize: 13, lineHeight: 1.5 }}>{description}</div>
      </div>
    </label>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function ProgressBar({ step, total }) {
  const pct = Math.round((step / total) * 100);
  return (
    <div style={{ padding: '12px 24px 0' }}>
      <div style={{ height: 4, background: '#2a2a2a', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: '#8b5cf6', borderRadius: 2, transition: 'width 0.3s ease' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        {Array.from({ length: total }, (_, i) => (
          <div key={i} style={{
            width: 8, height: 8, borderRadius: '50%',
            background: i < step ? '#8b5cf6' : '#2a2a2a',
            border: i + 1 === step ? '2px solid #a78bfa' : '2px solid transparent',
            transition: 'background 0.2s ease',
          }} />
        ))}
      </div>
    </div>
  );
}

function StepTitle({ icon, title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <span style={{ fontSize: 22 }}>{icon}</span>
      <h3 style={{ margin: 0, fontSize: 17, color: '#e2e8f0', fontWeight: 700 }}>{title}</h3>
    </div>
  );
}

function WizardField({ label, required, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: 'block', marginBottom: 7, color: '#ccc', fontSize: 13, fontWeight: 500 }}>
        {label}{required && <span style={{ color: '#8b5cf6', marginLeft: 3 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

function InfoBox({ children }) {
  return (
    <div style={styles.infoBox}>
      <span style={{ color: '#6366f1', fontSize: 15, marginRight: 10, flexShrink: 0 }}>ℹ</span>
      <span style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.5 }}>{children}</span>
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #2a2a2a', fontSize: 13 }}>
      <span style={{ color: '#777' }}>{label}</span>
      <span style={{ color: '#ccc', fontFamily: 'monospace' }}>{value}</span>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 9999,
    backdropFilter: 'blur(3px)',
  },
  panel: {
    background: '#141414',
    border: '1px solid #2a2a2a',
    borderRadius: 12,
    width: 560,
    maxWidth: '96vw',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '16px 24px',
    borderBottom: '1px solid #2a2a2a',
    flexShrink: 0,
  },
  closeBtn: {
    marginLeft: 'auto', background: 'none', border: 'none',
    color: '#555', cursor: 'pointer', fontSize: 16, padding: '2px 6px',
    borderRadius: 4,
  },
  body: {
    flex: 1, overflowY: 'auto', padding: '20px 24px',
  },
  footer: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 24px',
    borderTop: '1px solid #2a2a2a',
    flexShrink: 0,
  },
  backBtn: {
    background: 'none', border: '1px solid #333', color: '#aaa',
    padding: '7px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
  },
  nextBtn: {
    background: '#8b5cf6', border: 'none', color: '#fff',
    padding: '7px 20px', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
  },
  finishBtn: {
    background: '#22c55e', border: 'none', color: '#fff',
    padding: '7px 20px', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
  },
  testBtn: {
    background: '#8b5cf6', border: 'none', color: '#fff',
    padding: '9px 22px', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600,
  },
  lead: {
    color: '#aaa', fontSize: 14, lineHeight: 1.6, marginBottom: 16, marginTop: 0,
  },
  body2: {
    color: '#888', fontSize: 13, marginBottom: 8,
  },
  orderedList: {
    color: '#aaa', fontSize: 13, lineHeight: 2, paddingLeft: 20, marginBottom: 16,
  },
  infoBox: {
    display: 'flex', alignItems: 'flex-start',
    background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)',
    borderRadius: 8, padding: '10px 14px', marginTop: 16,
  },
  typeCard: {
    display: 'flex', alignItems: 'flex-start',
    border: '1px solid', borderRadius: 8,
    padding: '14px 16px', marginBottom: 12,
    transition: 'border-color 0.2s, background 0.2s',
  },
  surfaceCard: {
    display: 'flex', alignItems: 'flex-start',
    border: '1px solid', borderRadius: 8,
    padding: '14px 16px', marginBottom: 10,
    transition: 'border-color 0.2s, background 0.2s',
  },
  summaryBox: {
    background: '#1a1a1a', border: '1px solid #2a2a2a',
    borderRadius: 8, padding: '12px 16px',
  },
  resultBox: {
    border: '1px solid', borderRadius: 8, padding: '14px 16px',
    marginTop: 4,
  },
  varTable: {
    background: '#1a1a1a', border: '1px solid #2a2a2a',
    borderRadius: 8, padding: '12px 16px',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
  },
  hint: {
    color: '#666', marginTop: 5, display: 'block', fontSize: 12, lineHeight: 1.5,
  },
};
