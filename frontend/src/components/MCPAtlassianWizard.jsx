import React, { useState } from 'react';

// ─── CodeBlock ────────────────────────────────────────────────────────────────
const CodeBlock = ({ code }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div style={{ position: 'relative', margin: '12px 0' }}>
      <pre style={{
        background: '#111',
        border: '1px solid #333',
        borderRadius: '8px',
        padding: '14px 44px 14px 14px',
        fontSize: '13px',
        fontFamily: 'monospace',
        color: '#e2e8f0',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        lineHeight: '1.6',
        margin: 0,
      }}>
        {code}
      </pre>
      <button
        onClick={copy}
        title="Copy"
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          background: copied ? '#166534' : '#2a2a2a',
          border: '1px solid #444',
          borderRadius: '5px',
          color: copied ? '#86efac' : '#aaa',
          cursor: 'pointer',
          fontSize: '11px',
          padding: '3px 8px',
          transition: 'all 0.2s',
        }}
      >
        {copied ? '✓ Copied' : 'Copy'}
      </button>
    </div>
  );
};

// ─── Callout box ──────────────────────────────────────────────────────────────
const Note = ({ emoji, color, children }) => (
  <div style={{
    background: color === 'yellow' ? 'rgba(234,179,8,0.1)' : color === 'green' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
    border: `1px solid ${color === 'yellow' ? 'rgba(234,179,8,0.3)' : color === 'green' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
    borderRadius: '8px',
    padding: '10px 14px',
    marginTop: '12px',
    fontSize: '13px',
    color: '#ccc',
    lineHeight: '1.6',
  }}>
    {emoji} {children}
  </div>
);

// ─── Step definitions ─────────────────────────────────────────────────────────
const STEPS = [
  {
    emoji: '🎟',
    title: 'What will this do?',
    content: () => (
      <div>
        <p style={{ fontSize: '15px', lineHeight: '1.7', color: '#ddd', marginBottom: '16px' }}>
          This wizard connects <strong style={{ color: '#fff' }}>Copilot AI</strong> (the AI assistant you're talking to right now) to your <strong style={{ color: '#fff' }}>Jira account</strong>.
        </p>
        <p style={{ fontSize: '15px', lineHeight: '1.7', color: '#ddd', marginBottom: '16px' }}>
          Once it's set up, you can ask Copilot things like:
        </p>
        <ul style={{ paddingLeft: '20px', lineHeight: '2', color: '#bbb', fontSize: '14px' }}>
          <li>🗣 <em>"Create a Jira ticket for this bug"</em></li>
          <li>🗣 <em>"What tickets are in my backlog?"</em></li>
          <li>🗣 <em>"Move KAN-42 to In Progress"</em></li>
          <li>🗣 <em>"Add a comment to KAN-17"</em></li>
        </ul>
        <p style={{ fontSize: '14px', lineHeight: '1.7', color: '#888', marginTop: '16px' }}>
          It works by running a small background program called <strong style={{ color: '#aaa' }}>mcp-atlassian</strong> that handles the Jira connection. You'll set it up in about 10 minutes.
        </p>
        <Note emoji="⏱" color="yellow">
          You'll need: a Jira account, about 10 minutes, and access to PowerShell.
        </Note>
      </div>
    ),
  },
  {
    emoji: '🐍',
    title: 'Step 1 — Check if Python is installed',
    content: () => (
      <div>
        <p style={{ fontSize: '14px', lineHeight: '1.7', color: '#ddd', marginBottom: '12px' }}>
          The Jira connector needs <strong style={{ color: '#fff' }}>Python</strong> to run. Python is a free, safe program used by millions of developers. Let's check if you already have it.
        </p>
        <p style={{ fontSize: '13px', color: '#aaa', marginBottom: '6px' }}>
          1️⃣ Press the <strong style={{ color: '#fff' }}>Windows key</strong>, type <strong style={{ color: '#fff' }}>PowerShell</strong>, and press <strong style={{ color: '#fff' }}>Enter</strong>.
        </p>
        <p style={{ fontSize: '13px', color: '#aaa', marginBottom: '6px' }}>
          2️⃣ Type this and press <strong style={{ color: '#fff' }}>Enter</strong>:
        </p>
        <CodeBlock code="python --version" />
        <Note emoji="✅" color="green">
          If you see something like <strong>Python 3.12.0</strong> — great! You already have it. Skip to Step 2.
        </Note>
        <Note emoji="❌" color="red">
          If you see an error, type this and press Enter to install Python:
        </Note>
        <CodeBlock code="winget install Python.Python.3" />
        <p style={{ fontSize: '13px', color: '#888', marginTop: '8px' }}>
          Wait for it to finish, then close PowerShell and open it again before continuing.
        </p>
      </div>
    ),
  },
  {
    emoji: '⚡',
    title: 'Step 2 — Install uv',
    content: () => (
      <div>
        <p style={{ fontSize: '14px', lineHeight: '1.7', color: '#ddd', marginBottom: '12px' }}>
          <strong style={{ color: '#fff' }}>uv</strong> is a tiny helper tool that makes running the Jira connector super easy. Think of it like an "app installer" for Python tools.
        </p>
        <p style={{ fontSize: '13px', color: '#aaa', marginBottom: '6px' }}>
          1️⃣ In PowerShell, type this and press <strong style={{ color: '#fff' }}>Enter</strong>:
        </p>
        <CodeBlock code="pip install uv" />
        <p style={{ fontSize: '13px', color: '#aaa', marginBottom: '6px', marginTop: '12px' }}>
          2️⃣ Wait for it to finish, then check it worked:
        </p>
        <CodeBlock code="uvx --version" />
        <Note emoji="✅" color="green">
          If you see a version number like <strong>uv 0.x.x</strong> — perfect, you're ready for the next step!
        </Note>
        <Note emoji="❌" color="red">
          If it says "command not found", close PowerShell and open it again, then try <strong>uvx --version</strong> once more.
        </Note>
      </div>
    ),
  },
  {
    emoji: '🔑',
    title: 'Step 3 — Get your Jira API Token',
    content: () => (
      <div>
        <p style={{ fontSize: '14px', lineHeight: '1.7', color: '#ddd', marginBottom: '12px' }}>
          An <strong style={{ color: '#fff' }}>API Token</strong> is like a special password just for apps — it lets the connector talk to Jira without using your real password.
        </p>
        <p style={{ fontSize: '13px', color: '#aaa', marginBottom: '6px' }}>
          1️⃣ Open this link in your browser:
        </p>
        <CodeBlock code="https://id.atlassian.com/manage-profile/security/api-tokens" />
        <p style={{ fontSize: '13px', color: '#aaa', marginBottom: '6px', marginTop: '10px' }}>
          2️⃣ Click the blue <strong style={{ color: '#fff' }}>"Create API token"</strong> button.
        </p>
        <p style={{ fontSize: '13px', color: '#aaa', marginBottom: '6px' }}>
          3️⃣ In the <strong style={{ color: '#fff' }}>"Label"</strong> box, type: <code style={{ background: '#222', padding: '1px 5px', borderRadius: '3px' }}>Forge Terminal</code>
        </p>
        <p style={{ fontSize: '13px', color: '#aaa', marginBottom: '6px' }}>
          4️⃣ Click <strong style={{ color: '#fff' }}>"Create"</strong>.
        </p>
        <p style={{ fontSize: '13px', color: '#aaa', marginBottom: '6px' }}>
          5️⃣ Click <strong style={{ color: '#fff' }}>"Copy"</strong> to copy the token.
        </p>
        <Note emoji="⚠️" color="yellow">
          <strong>Important!</strong> Paste your token somewhere safe right now (like Notepad). You can only see it <strong>once</strong> — if you close this page, it's gone forever.
        </Note>
      </div>
    ),
  },
  {
    emoji: '🔍',
    title: 'Step 4 — Find your Jira details',
    content: () => (
      <div>
        <p style={{ fontSize: '14px', lineHeight: '1.7', color: '#ddd', marginBottom: '16px' }}>
          You need two more pieces of information before we can finish.
        </p>

        <p style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff', marginBottom: '6px' }}>
          📌 Your Jira URL
        </p>
        <p style={{ fontSize: '13px', color: '#aaa', marginBottom: '6px' }}>
          This is the website address you use when you go to Jira. It looks like this:
        </p>
        <CodeBlock code="https://YOUR-COMPANY-NAME.atlassian.net" />
        <p style={{ fontSize: '12px', color: '#666', marginBottom: '16px' }}>
          For example: https://acmecorp.atlassian.net — or if it's just you: https://mikejsmith1985.atlassian.net
        </p>

        <p style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff', marginBottom: '6px' }}>
          📧 Your Email Address
        </p>
        <p style={{ fontSize: '13px', color: '#aaa' }}>
          This is the email you use to log in to Atlassian / Jira. It's usually the same email in the top-right corner when you're logged in.
        </p>

        <Note emoji="📝" color="yellow">
          Write down or copy these two things — you'll need them in the next step: your <strong>Jira URL</strong> and your <strong>email address</strong>.
        </Note>
      </div>
    ),
  },
  {
    emoji: '📄',
    title: 'Step 5 — Create the config file',
    content: () => {
      const configJson = `{
  "mcpServers": {
    "atlassian": {
      "type": "local",
      "command": "uvx",
      "args": ["mcp-atlassian"],
      "env": {
        "JIRA_URL": "https://YOUR-SITE.atlassian.net",
        "JIRA_USERNAME": "your@email.com",
        "JIRA_API_TOKEN": "your-token-here"
      },
      "tools": ["*"]
    }
  }
}`;
      return (
        <div>
          <p style={{ fontSize: '14px', lineHeight: '1.7', color: '#ddd', marginBottom: '12px' }}>
            Now we create a small settings file so Copilot knows about your Jira account.
          </p>
          <p style={{ fontSize: '13px', color: '#aaa', marginBottom: '6px' }}>
            1️⃣ In PowerShell, run this to open the config file in Notepad:
          </p>
          <CodeBlock code={`New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\\.copilot"\nnotepad "$env:USERPROFILE\\.copilot\\mcp-config.json"`} />
          <p style={{ fontSize: '13px', color: '#aaa', marginBottom: '6px', marginTop: '10px' }}>
            2️⃣ Notepad will open. <strong style={{ color: '#fff' }}>Clear everything</strong> in it and paste in the text below.
          </p>
          <p style={{ fontSize: '13px', color: '#aaa', marginBottom: '6px' }}>
            3️⃣ <strong style={{ color: '#fff' }}>Replace</strong> the three placeholder values with your real details:
          </p>
          <ul style={{ paddingLeft: '20px', fontSize: '13px', color: '#bbb', lineHeight: '2' }}>
            <li><code style={{ background: '#222', padding: '1px 5px', borderRadius: '3px' }}>YOUR-SITE.atlassian.net</code> → your Jira URL</li>
            <li><code style={{ background: '#222', padding: '1px 5px', borderRadius: '3px' }}>your@email.com</code> → your Atlassian email</li>
            <li><code style={{ background: '#222', padding: '1px 5px', borderRadius: '3px' }}>your-token-here</code> → the token from Step 3</li>
          </ul>
          <CodeBlock code={configJson} />
          <p style={{ fontSize: '13px', color: '#aaa', marginTop: '8px' }}>
            4️⃣ Save the file with <strong style={{ color: '#fff' }}>Ctrl+S</strong> and close Notepad.
          </p>
          <Note emoji="✅" color="green">
            The file will be saved at: <strong>C:\Users\YourName\.copilot\mcp-config.json</strong>
          </Note>
        </div>
      );
    },
  },
  {
    emoji: '🚀',
    title: 'Step 6 — Test it!',
    content: () => (
      <div>
        <p style={{ fontSize: '14px', lineHeight: '1.7', color: '#ddd', marginBottom: '12px' }}>
          Let's make sure everything works!
        </p>
        <p style={{ fontSize: '13px', color: '#aaa', marginBottom: '6px' }}>
          1️⃣ If Copilot CLI is currently open, close it completely.
        </p>
        <p style={{ fontSize: '13px', color: '#aaa', marginBottom: '6px' }}>
          2️⃣ Open a new terminal and start Copilot CLI:
        </p>
        <CodeBlock code="copilot" />
        <p style={{ fontSize: '13px', color: '#aaa', marginBottom: '6px', marginTop: '10px' }}>
          3️⃣ Once it's running, type this and press Enter:
        </p>
        <CodeBlock code="List my Jira projects" />
        <Note emoji="✅" color="green">
          If you see a list of your Jira projects — <strong>you're all done!</strong> 🎉 The integration is working perfectly.
        </Note>
        <Note emoji="❌" color="red">
          If you see an error, the most common cause is a typo in the config file. Go back to Step 5 and double-check your Jira URL, email, and API token.
        </Note>
        <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '8px' }}>
          <p style={{ fontSize: '13px', color: '#c4b5fd', margin: 0, lineHeight: '1.7' }}>
            💡 <strong>Quick tip:</strong> You can also check or update your MCP servers anytime by typing <code style={{ background: '#2a1f3f', padding: '1px 5px', borderRadius: '3px' }}>/mcp</code> inside a Copilot CLI session.
          </p>
        </div>
      </div>
    ),
  },
];

// ─── Main wizard component ────────────────────────────────────────────────────
const MCPAtlassianWizard = () => {
  const [step, setStep] = useState(0);
  const total = STEPS.length;
  const current = STEPS[step];
  const progress = ((step + 1) / total) * 100;

  return (
    <div style={{ padding: '24px', maxWidth: '680px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <span style={{ fontSize: '28px' }}>{current.emoji}</span>
          <h2 style={{ margin: 0, fontSize: '18px', color: '#fff', fontWeight: '600' }}>
            {current.title}
          </h2>
        </div>

        {/* Progress bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            flex: 1,
            height: '4px',
            background: '#2a2a2a',
            borderRadius: '2px',
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${progress}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #8b5cf6, #7c3aed)',
              borderRadius: '2px',
              transition: 'width 0.3s ease',
            }} />
          </div>
          <span style={{ fontSize: '12px', color: '#666', whiteSpace: 'nowrap' }}>
            {step + 1} / {total}
          </span>
        </div>
      </div>

      {/* Step dots */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
        {STEPS.map((s, i) => (
          <button
            key={i}
            onClick={() => setStep(i)}
            title={s.title}
            style={{
              width: i === step ? '24px' : '8px',
              height: '8px',
              borderRadius: '4px',
              background: i === step ? '#8b5cf6' : i < step ? '#6d28d9' : '#333',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              transition: 'all 0.2s',
            }}
          />
        ))}
      </div>

      {/* Content */}
      <div style={{ minHeight: '320px' }}>
        <current.content />
      </div>

      {/* Navigation */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: '28px',
        paddingTop: '20px',
        borderTop: '1px solid #2a2a2a',
      }}>
        <button
          onClick={() => setStep(s => Math.max(0, s - 1))}
          disabled={step === 0}
          style={{
            padding: '9px 20px',
            background: 'transparent',
            border: '1px solid #444',
            borderRadius: '7px',
            color: step === 0 ? '#444' : '#aaa',
            cursor: step === 0 ? 'default' : 'pointer',
            fontSize: '14px',
          }}
        >
          ← Previous
        </button>

        <div style={{ display: 'flex', gap: '8px' }}>
          {step === total - 1 ? (
            <button
              onClick={() => setStep(0)}
              style={{
                padding: '9px 20px',
                background: 'rgba(139,92,246,0.15)',
                border: '1px solid rgba(139,92,246,0.4)',
                borderRadius: '7px',
                color: '#c4b5fd',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              ↺ Start Over
            </button>
          ) : (
            <button
              onClick={() => setStep(s => Math.min(total - 1, s + 1))}
              style={{
                padding: '9px 20px',
                background: '#7c3aed',
                border: 'none',
                borderRadius: '7px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
              }}
            >
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MCPAtlassianWizard;
