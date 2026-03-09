package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"

	"github.com/mikejsmith1985/forge-terminal/internal/tunnel"
)

// ── /setup — HTML wizard ─────────────────────────────────────────────────────

func handleSetupWizard(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprint(w, setupWizardHTML)
}

// ── /api/setup/check — probe current state ───────────────────────────────────

type setupCheckResponse struct {
	CloudflaredInstalled bool   `json:"cloudflaredInstalled"`
	CloudflaredPath      string `json:"cloudflaredPath"`
	WebhookSecret        string `json:"webhookSecret"`
	WebhookURL           string `json:"webhookURL"`
	RenderAPIKey         string `json:"renderAPIKey"` // masked
	RenderServiceID      string `json:"renderServiceID"`
	BaseURL              string `json:"baseURL"`
	TunnelAutoStart      bool   `json:"tunnelAutoStart"`
	TunnelRunning        bool   `json:"tunnelRunning"`
	TunnelURL            string `json:"tunnelURL"`
}

func handleSetupCheck(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	cfg, _ := loadNotifyConfig()
	binPath := tunnel.ResolvePath()

	running, tURL, _ := tunnelMgr.Status()

	resp := setupCheckResponse{
		CloudflaredInstalled: binPath != "",
		CloudflaredPath:      binPath,
		WebhookSecret:        cfg.WebhookSecret,
		WebhookURL:           cfg.WebhookURL,
		RenderAPIKey:         maskSecret(cfg.RenderAPIKey),
		RenderServiceID:      cfg.RenderServiceID,
		BaseURL:              cfg.BaseURL,
		TunnelAutoStart:      cfg.TunnelAutoStart,
		TunnelRunning:        running,
		TunnelURL:            tURL,
	}
	writeJSON(w, http.StatusOK, resp)
}

// ── /api/setup/install-cloudflared — download cloudflared binary ──────────────

func handleSetupInstallCloudflared(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Already installed?
	if p := tunnel.ResolvePath(); p != "" {
		writeJSON(w, http.StatusOK, map[string]string{"path": p, "status": "already_installed"})
		return
	}

	binDir := tunnel.BinDir()
	if err := os.MkdirAll(binDir, 0o755); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "cannot create bin dir: " + err.Error()})
		return
	}

	url := cloudflaredDownloadURL()
	destName := "cloudflared"
	if runtime.GOOS == "windows" {
		destName = "cloudflared.exe"
	}
	dest := filepath.Join(binDir, destName)

	resp, err := http.Get(url) //nolint:gosec // URL is a hardcoded Cloudflare release URL
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "download failed: " + err.Error()})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": fmt.Sprintf("download returned HTTP %d", resp.StatusCode)})
		return
	}

	f, err := os.OpenFile(dest, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "cannot write binary: " + err.Error()})
		return
	}
	if _, err := io.Copy(f, resp.Body); err != nil {
		f.Close()
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "write failed: " + err.Error()})
		return
	}
	f.Close()

	writeJSON(w, http.StatusOK, map[string]string{"path": dest, "status": "installed"})
}

func cloudflaredDownloadURL() string {
	base := "https://github.com/cloudflare/cloudflared/releases/latest/download/"
	switch runtime.GOOS {
	case "windows":
		return base + "cloudflared-windows-amd64.exe"
	case "darwin":
		if runtime.GOARCH == "arm64" {
			return base + "cloudflared-darwin-arm64.tgz"
		}
		return base + "cloudflared-darwin-amd64.tgz"
	default:
		return base + "cloudflared-linux-amd64"
	}
}

// ── /api/setup/activate — save config + start tunnel in one shot ─────────────

type activateRequest struct {
	WebhookURL      string `json:"webhookURL"`
	WebhookSecret   string `json:"webhookSecret"`
	RenderAPIKey    string `json:"renderAPIKey"`
	RenderServiceID string `json:"renderServiceID"`
	TunnelAutoStart bool   `json:"tunnelAutoStart"`
}

func handleSetupActivate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req activateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
		return
	}

	// Load existing config so we don't wipe fields we don't touch.
	cfg, _ := loadNotifyConfig()

	if req.WebhookURL != "" {
		cfg.WebhookURL = req.WebhookURL
	}
	if req.WebhookSecret != "" && req.WebhookSecret != maskSecret(cfg.WebhookSecret) {
		cfg.WebhookSecret = req.WebhookSecret
	}
	// Render API key — preserve existing if masked value sent
	if req.RenderAPIKey != "" && req.RenderAPIKey != maskSecret(cfg.RenderAPIKey) {
		cfg.RenderAPIKey = req.RenderAPIKey
	}
	if req.RenderServiceID != "" {
		cfg.RenderServiceID = req.RenderServiceID
	}
	cfg.TunnelAutoStart = req.TunnelAutoStart

	if err := saveNotifyConfig(cfg); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "save failed: " + err.Error()})
		return
	}

	// Start (or restart) tunnel
	if tunnelMgr.IsRunning() {
		tunnelMgr.Stop()
	}
	if err := tunnelMgr.Start(activePort, onTunnelURL); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tunnel start failed: " + err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "started"})
}

// ── Wizard HTML ───────────────────────────────────────────────────────────────

const setupWizardHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Forge · MBL2PC Setup Wizard</title>
<style>
  :root {
    --bg: #0d0d0f;
    --surface: #16181c;
    --surface2: #1e2024;
    --border: #2e3038;
    --accent: #6e9ef7;
    --accent2: #a78bfa;
    --success: #22c55e;
    --warning: #f59e0b;
    --error: #ef4444;
    --text: #e4e4e7;
    --muted: #71717a;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 40px 16px 80px;
  }
  .wizard {
    width: 100%;
    max-width: 680px;
  }
  .logo {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 32px;
  }
  .logo-icon {
    width: 40px; height: 40px;
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    font-size: 20px;
  }
  .logo-text { font-size: 22px; font-weight: 700; letter-spacing: -.5px; }
  .logo-sub { font-size: 13px; color: var(--muted); margin-top: 2px; }

  /* Step indicator */
  .steps {
    display: flex;
    gap: 0;
    margin-bottom: 32px;
    position: relative;
  }
  .steps::before {
    content: '';
    position: absolute;
    top: 16px; left: 16px; right: 16px;
    height: 2px;
    background: var(--border);
    z-index: 0;
  }
  .step-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    position: relative;
    z-index: 1;
    cursor: default;
  }
  .step-circle {
    width: 32px; height: 32px;
    border-radius: 50%;
    background: var(--surface2);
    border: 2px solid var(--border);
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 600;
    transition: all .3s;
  }
  .step-item.active .step-circle {
    background: var(--accent);
    border-color: var(--accent);
    color: #000;
  }
  .step-item.done .step-circle {
    background: var(--success);
    border-color: var(--success);
    color: #000;
  }
  .step-label {
    font-size: 11px;
    color: var(--muted);
    text-align: center;
    line-height: 1.3;
  }
  .step-item.active .step-label { color: var(--text); }
  .step-item.done .step-label { color: var(--success); }

  /* Cards */
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 28px;
    margin-bottom: 16px;
    display: none;
  }
  .card.visible { display: block; }
  .card h2 {
    font-size: 18px; font-weight: 700;
    margin-bottom: 6px;
    display: flex; align-items: center; gap: 10px;
  }
  .card .card-desc {
    color: var(--muted);
    font-size: 13px;
    line-height: 1.6;
    margin-bottom: 24px;
  }

  /* Form */
  .field { margin-bottom: 20px; }
  .field label {
    display: block;
    font-size: 13px; font-weight: 500;
    margin-bottom: 6px;
    color: var(--text);
  }
  .field .hint {
    font-size: 12px; color: var(--muted);
    margin-top: 5px; line-height: 1.5;
  }
  .field .hint a { color: var(--accent); text-decoration: none; }
  .field .hint a:hover { text-decoration: underline; }
  .input-row { display: flex; gap: 8px; }
  input[type=text], input[type=password], input[type=url] {
    width: 100%;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    font-size: 13px;
    padding: 10px 12px;
    outline: none;
    transition: border-color .2s;
  }
  input:focus { border-color: var(--accent); }

  /* Buttons */
  .btn {
    border: none; border-radius: 8px; cursor: pointer;
    font-size: 13px; font-weight: 600;
    padding: 10px 20px;
    transition: opacity .15s, transform .1s;
  }
  .btn:hover { opacity: .85; }
  .btn:active { transform: scale(.98); }
  .btn-primary { background: var(--accent); color: #000; }
  .btn-secondary {
    background: var(--surface2);
    border: 1px solid var(--border);
    color: var(--text);
  }
  .btn-success { background: var(--success); color: #000; }
  .btn-danger { background: var(--error); color: #fff; }
  .btn-sm { padding: 7px 14px; font-size: 12px; }
  .btn:disabled { opacity: .4; cursor: not-allowed; }
  .btn-row {
    display: flex; gap: 10px; margin-top: 28px;
    align-items: center;
  }

  /* Status badges */
  .badge {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 12px; font-weight: 500;
  }
  .badge-ok { background: rgba(34,197,94,.15); color: #4ade80; }
  .badge-warn { background: rgba(245,158,11,.15); color: #fbbf24; }
  .badge-err { background: rgba(239,68,68,.15); color: #f87171; }
  .badge-info { background: rgba(110,158,247,.15); color: var(--accent); }

  /* Detect row */
  .detect-row {
    display: flex; align-items: center;
    gap: 12px; flex-wrap: wrap;
    padding: 14px 16px;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 8px;
    margin-bottom: 20px;
  }
  .detect-row .label { flex: 1; min-width: 0; }
  .detect-row .label strong { display: block; font-size: 13px; }
  .detect-row .label span { font-size: 12px; color: var(--muted); font-family: monospace; word-break: break-all; }

  /* Progress */
  .progress-list { list-style: none; margin: 0; padding: 0; }
  .progress-list li {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
  }
  .progress-list li:last-child { border-bottom: none; }
  .progress-list .icon { width: 20px; text-align: center; flex-shrink: 0; }

  /* Spin */
  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { display: inline-block; animation: spin .7s linear infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
  .pulse { animation: pulse 1.5s ease-in-out infinite; }

  /* Code block */
  .code-block {
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px 16px;
    font-family: monospace;
    font-size: 12px;
    word-break: break-all;
    line-height: 1.7;
    color: #a5f3fc;
    position: relative;
  }
  .code-block .copy-btn {
    position: absolute; top: 8px; right: 8px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 5px; color: var(--muted); cursor: pointer;
    font-size: 11px; padding: 3px 8px;
  }
  .code-block .copy-btn:hover { color: var(--text); }

  /* Toast */
  #toast {
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 8px; padding: 10px 18px;
    font-size: 13px; box-shadow: 0 8px 32px rgba(0,0,0,.5);
    opacity: 0; transition: opacity .3s; pointer-events: none;
    z-index: 999;
  }
  #toast.show { opacity: 1; }

  /* Eye toggle */
  .eye-btn {
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--muted);
    cursor: pointer;
    padding: 0 12px;
    display: flex; align-items: center;
    font-size: 14px;
    flex-shrink: 0;
  }
  .eye-btn:hover { color: var(--text); }

  /* Final summary */
  .summary-grid {
    display: grid;
    grid-template-columns: 140px 1fr;
    gap: 10px 16px;
    font-size: 13px;
    margin-top: 16px;
  }
  .summary-grid .key { color: var(--muted); font-weight: 500; }
  .summary-grid .val { font-family: monospace; color: #a5f3fc; word-break: break-all; }

  hr { border: none; border-top: 1px solid var(--border); margin: 24px 0; }
</style>
</head>
<body>
<div class="wizard">

  <!-- Logo -->
  <div class="logo">
    <div class="logo-icon">⚡</div>
    <div>
      <div class="logo-text">Forge Terminal</div>
      <div class="logo-sub">MBL2PC Remote Setup Wizard</div>
    </div>
  </div>

  <!-- Step indicators -->
  <div class="steps" id="steps">
    <div class="step-item active" id="si-0"><div class="step-circle">1</div><div class="step-label">Cloudflared</div></div>
    <div class="step-item" id="si-1"><div class="step-circle">2</div><div class="step-label">Render<br>Credentials</div></div>
    <div class="step-item" id="si-2"><div class="step-circle">3</div><div class="step-label">MBL2PC<br>Webhook</div></div>
    <div class="step-item" id="si-3"><div class="step-circle">4</div><div class="step-label">Activate</div></div>
    <div class="step-item" id="si-4"><div class="step-circle">✓</div><div class="step-label">Done</div></div>
  </div>

  <!-- STEP 0: cloudflared -->
  <div class="card visible" id="step-0">
    <h2>⚡ Install cloudflared</h2>
    <p class="card-desc">Forge uses Cloudflare's free quick tunnel to give itself a public HTTPS URL so MBL2PC (running on Render) can reach it from anywhere — even when you're on a different network.<br><br>This step installs the <strong>cloudflared</strong> binary automatically.</p>

    <div class="detect-row" id="cf-detect-row">
      <div class="label">
        <strong>cloudflared</strong>
        <span id="cf-path">Checking…</span>
      </div>
      <span id="cf-badge" class="badge badge-info pulse">Checking…</span>
      <button class="btn btn-primary btn-sm" id="cf-install-btn" style="display:none" onclick="installCloudflared()">Install Automatically</button>
    </div>

    <div id="cf-install-log" style="display:none;margin-bottom:16px">
      <div class="code-block" id="cf-log-text">Downloading…</div>
    </div>

    <div class="btn-row">
      <button class="btn btn-primary" id="cf-next-btn" disabled onclick="goStep(1)">Next →</button>
      <span id="cf-status-note" style="font-size:12px;color:var(--muted)"></span>
    </div>
  </div>

  <!-- STEP 1: Render credentials -->
  <div class="card" id="step-1">
    <h2>🔑 Render Credentials</h2>
    <p class="card-desc">Forge needs your Render API key and MBL2PC service ID to automatically update the <code style="font-family:monospace;font-size:12px;background:var(--surface2);padding:1px 5px;border-radius:3px">FORGE_INBOUND_URL</code> env var whenever the tunnel URL changes.</p>

    <div class="field">
      <label>Render API Key</label>
      <div class="input-row">
        <input type="password" id="f-renderKey" placeholder="rnd_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" autocomplete="off">
        <button class="eye-btn" onclick="toggleEye('f-renderKey',this)">👁</button>
      </div>
      <div class="hint">
        Get from <a href="https://dashboard.render.com/u/settings#api-keys" target="_blank">Render Dashboard → Account Settings → API Keys</a>.<br>
        Click <strong>+ New API Key</strong>, name it "Forge", and paste it here.
      </div>
    </div>

    <div class="field">
      <label>MBL2PC Service ID</label>
      <input type="text" id="f-serviceID" placeholder="srv-xxxxxxxxxxxxxxxxxxxx">
      <div class="hint">
        Open your MBL2PC service on Render. The service ID is in the URL:<br>
        <code style="font-size:11px">https://dashboard.render.com/web/<strong>srv-xxxxxxxxxxxxxxxxxxxx</strong></code>
      </div>
    </div>

    <div class="btn-row">
      <button class="btn btn-secondary" onclick="goStep(0)">← Back</button>
      <button class="btn btn-primary" onclick="goStep(2)">Next →</button>
    </div>
  </div>

  <!-- STEP 2: MBL2PC webhook -->
  <div class="card" id="step-2">
    <h2>🔗 MBL2PC Webhook</h2>
    <p class="card-desc">Forge uses a shared webhook secret to authenticate messages from MBL2PC (so only your MBL2PC instance can send commands to Forge). This secret must match the <code style="font-family:monospace;font-size:12px;background:var(--surface2);padding:1px 5px;border-radius:3px">FORGE_WEBHOOK_SECRET</code> environment variable set on your Render MBL2PC service.</p>

    <div class="field">
      <label>MBL2PC Webhook URL</label>
      <input type="url" id="f-webhookURL" placeholder="https://your-mbl2pc.onrender.com">
      <div class="hint">The base URL of your MBL2PC deployment on Render (no trailing slash).</div>
    </div>

    <div class="field">
      <label>Webhook Secret</label>
      <div class="input-row">
        <input type="password" id="f-webhookSecret" placeholder="auto-generated if blank" autocomplete="off">
        <button class="eye-btn" onclick="toggleEye('f-webhookSecret',this)">👁</button>
        <button class="btn btn-secondary btn-sm" onclick="genSecret()" style="white-space:nowrap">Generate</button>
      </div>
      <div class="hint">
        Any strong random string. After setup, copy this exact value to<br>
        <strong>Render → MBL2PC → Environment → FORGE_WEBHOOK_SECRET</strong>.
      </div>
    </div>

    <div id="render-env-block" style="display:none;margin-top:4px">
      <p style="font-size:12px;color:var(--muted);margin-bottom:8px">Copy these two env vars to your Render MBL2PC service:</p>
      <div class="code-block" id="render-env-text"></div>
    </div>

    <div class="btn-row">
      <button class="btn btn-secondary" onclick="goStep(1)">← Back</button>
      <button class="btn btn-primary" onclick="showRenderEnvAndContinue()">Next →</button>
    </div>
  </div>

  <!-- STEP 3: Activate -->
  <div class="card" id="step-3">
    <h2>🚀 Activate</h2>
    <p class="card-desc">Everything is ready. Click <strong>Save &amp; Launch</strong> to save your settings and start the Cloudflare tunnel. Forge will automatically update <code style="font-family:monospace;font-size:12px;background:var(--surface2);padding:1px 5px;border-radius:3px">FORGE_INBOUND_URL</code> on Render once the tunnel URL is assigned.</p>

    <div class="field">
      <label style="display:flex;align-items:center;gap:10px">
        <input type="checkbox" id="f-autoStart" style="width:16px;height:16px;accent-color:var(--accent)">
        Auto-start tunnel every time Forge opens
      </label>
    </div>

    <ul class="progress-list" id="activate-progress">
      <li><span class="icon" id="ap-save-icon">⏳</span> Saving configuration</li>
      <li><span class="icon" id="ap-start-icon">⏳</span> Starting cloudflared tunnel</li>
      <li><span class="icon" id="ap-url-icon">⏳</span> Waiting for public URL</li>
      <li><span class="icon" id="ap-render-icon">⏳</span> Updating Render FORGE_INBOUND_URL</li>
    </ul>

    <div id="activate-error" style="display:none;margin-top:12px" class="badge badge-err"></div>

    <div class="btn-row">
      <button class="btn btn-secondary" id="activate-back-btn" onclick="goStep(2)">← Back</button>
      <button class="btn btn-primary" id="activate-btn" onclick="activate()">Save &amp; Launch ⚡</button>
    </div>
  </div>

  <!-- STEP 4: Done -->
  <div class="card" id="step-4">
    <h2>✅ Setup Complete!</h2>
    <p class="card-desc">Forge is live and connected. Here's a summary of your configuration:</p>

    <div class="summary-grid" id="done-summary"></div>

    <hr>

    <p style="font-size:13px;color:var(--muted);margin-bottom:12px">
      <strong style="color:var(--text)">One last step:</strong> Make sure these env vars are set on your Render MBL2PC service. Forge has already updated <code style="font-family:monospace;font-size:12px;background:var(--surface2);padding:1px 5px;border-radius:3px">FORGE_INBOUND_URL</code> automatically.
    </p>

    <div class="code-block" id="done-env-block">
      <button class="copy-btn" onclick="copyEl('done-env-block')">Copy</button>
    </div>

    <div class="btn-row" style="margin-top:24px">
      <button class="btn btn-primary" onclick="window.close()">Close Wizard</button>
      <a href="/" class="btn btn-secondary" style="text-decoration:none;display:inline-block">Back to Forge</a>
    </div>
  </div>

</div>

<div id="toast"></div>

<script>
let state = {
  cfInstalled: false, cfPath: '',
  renderKey: '', serviceID: '',
  webhookURL: '', webhookSecret: '',
  autoStart: false,
  tunnelURL: ''
};

// ── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  try {
    const d = await fetch('/api/setup/check').then(r => r.json());
    state.cfInstalled   = d.cloudflaredInstalled;
    state.cfPath        = d.cloudflaredPath;
    state.renderKey     = d.renderAPIKey   || '';
    state.serviceID     = d.renderServiceID || '';
    state.webhookURL    = d.webhookURL     || '';
    state.webhookSecret = d.webhookSecret  || '';
    state.autoStart     = d.tunnelAutoStart || false;
    state.tunnelURL     = d.tunnelURL      || '';

    // Pre-fill form fields
    if (state.renderKey)     document.getElementById('f-renderKey').value   = state.renderKey;
    if (state.serviceID)     document.getElementById('f-serviceID').value   = state.serviceID;
    if (state.webhookURL)    document.getElementById('f-webhookURL').value  = state.webhookURL;
    if (state.webhookSecret) document.getElementById('f-webhookSecret').value = state.webhookSecret;
    document.getElementById('f-autoStart').checked = state.autoStart;

    setCFStatus(d.cloudflaredInstalled, d.cloudflaredPath);

    // If tunnel already running, we can skip straight to done
    if (d.tunnelRunning && d.tunnelURL) {
      showFinalDone(d.tunnelURL);
    }
  } catch(e) {
    setCFStatus(false, '');
    toast('⚠️ Could not reach Forge API — is Forge running?', 5000);
  }
}

function setCFStatus(installed, path) {
  const badge = document.getElementById('cf-badge');
  const pathEl = document.getElementById('cf-path');
  const installBtn = document.getElementById('cf-install-btn');
  const nextBtn = document.getElementById('cf-next-btn');
  const note = document.getElementById('cf-status-note');

  badge.className = 'badge ' + (installed ? 'badge-ok' : 'badge-err');
  badge.style.animation = '';
  badge.textContent = installed ? '✓ Installed' : '✗ Not found';
  pathEl.textContent = path || 'Not found in PATH or ~/.forge/bin';
  installBtn.style.display = installed ? 'none' : 'inline-flex';
  nextBtn.disabled = !installed;
  note.textContent = installed ? 'cloudflared is ready.' : 'Click "Install Automatically" to download it.';
}

// ── Steps ────────────────────────────────────────────────────────────────────

let currentStep = 0;

function goStep(n) {
  document.getElementById('step-' + currentStep).classList.remove('visible');
  document.getElementById('si-' + currentStep).className = 'step-item done';
  currentStep = n;
  document.getElementById('step-' + n).classList.add('visible');
  document.getElementById('si-' + n).className = 'step-item active';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── cloudflared install ───────────────────────────────────────────────────────

async function installCloudflared() {
  const btn = document.getElementById('cf-install-btn');
  const logEl = document.getElementById('cf-install-log');
  const logText = document.getElementById('cf-log-text');
  btn.disabled = true;
  btn.textContent = '⏳ Downloading…';
  logEl.style.display = 'block';
  logText.textContent = 'Downloading cloudflared from GitHub releases…\nThis may take 10-30 seconds.';

  try {
    const r = await fetch('/api/setup/install-cloudflared', { method: 'POST' });
    const d = await r.json();
    if (r.ok && (d.status === 'installed' || d.status === 'already_installed')) {
      state.cfInstalled = true;
      state.cfPath = d.path;
      logText.textContent = '✓ Installed to: ' + d.path;
      setCFStatus(true, d.path);
      toast('✅ cloudflared installed!');
    } else {
      logText.textContent = '✗ Error: ' + (d.error || JSON.stringify(d));
      btn.disabled = false;
      btn.textContent = 'Retry Install';
      toast('❌ Install failed: ' + (d.error || 'unknown error'), 5000);
    }
  } catch(e) {
    logText.textContent = '✗ Network error: ' + e.message;
    btn.disabled = false;
    btn.textContent = 'Retry Install';
  }
}

// ── Webhook step ─────────────────────────────────────────────────────────────

function showRenderEnvAndContinue() {
  const secret = document.getElementById('f-webhookSecret').value.trim();
  const webhookURL = document.getElementById('f-webhookURL').value.trim();
  if (!webhookURL) {
    toast('⚠️ Please enter your MBL2PC webhook URL first.');
    return;
  }
  // Show env vars to copy to Render
  const block = document.getElementById('render-env-block');
  const envText = document.getElementById('render-env-text');
  const display = secret || '(paste the secret you entered above)';
  envText.innerHTML =
    'FORGE_WEBHOOK_SECRET=' + escHtml(display) + '\n' +
    '(FORGE_INBOUND_URL will be set automatically by Forge)';
  block.style.display = 'block';
  goStep(3);
}

function genSecret() {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  const hex = Array.from(arr).map(b => b.toString(16).padStart(2,'0')).join('');
  document.getElementById('f-webhookSecret').value = hex;
  document.getElementById('f-webhookSecret').type = 'text';
}

// ── Activate ─────────────────────────────────────────────────────────────────

async function activate() {
  const btn = document.getElementById('activate-btn');
  const backBtn = document.getElementById('activate-back-btn');
  btn.disabled = true;
  backBtn.disabled = true;
  document.getElementById('activate-error').style.display = 'none';

  const setIcon = (id, icon) => { document.getElementById(id).textContent = icon; };
  const spin = (id) => { document.getElementById(id).innerHTML = '<span class="spin">⏳</span>'; };

  // ─ 1. Save config ─
  spin('ap-save-icon');
  try {
    const r = await fetch('/api/setup/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhookURL:      document.getElementById('f-webhookURL').value.trim(),
        webhookSecret:   document.getElementById('f-webhookSecret').value.trim(),
        renderAPIKey:    document.getElementById('f-renderKey').value.trim(),
        renderServiceID: document.getElementById('f-serviceID').value.trim(),
        tunnelAutoStart: document.getElementById('f-autoStart').checked,
      })
    });
    const d = await r.json();
    if (!r.ok) {
      showActivateError(d.error || 'Activation failed');
      setIcon('ap-save-icon', '✗'); btn.disabled = false; backBtn.disabled = false;
      return;
    }
  } catch(e) {
    showActivateError(e.message); setIcon('ap-save-icon', '✗');
    btn.disabled = false; backBtn.disabled = false; return;
  }
  setIcon('ap-save-icon', '✓');

  // ─ 2. Tunnel started (activate already called Start) ─
  setIcon('ap-start-icon', '✓');

  // ─ 3. Poll for tunnel URL ─
  spin('ap-url-icon');
  let tunnelURL = '';
  for (let i = 0; i < 40; i++) {
    await sleep(2000);
    try {
      const s = await fetch('/api/tunnel/status').then(r => r.json());
      if (s.url) { tunnelURL = s.url; break; }
      if (!s.running && i > 3) {
        showActivateError('Tunnel stopped unexpectedly — check that cloudflared is installed and working.');
        setIcon('ap-url-icon', '✗'); btn.disabled = false; backBtn.disabled = false; return;
      }
    } catch {}
  }
  if (!tunnelURL) {
    showActivateError('Timed out waiting for tunnel URL. Try starting manually in Notifications settings.');
    setIcon('ap-url-icon', '✗'); btn.disabled = false; backBtn.disabled = false; return;
  }
  setIcon('ap-url-icon', '✓');

  // ─ 4. Render update is automatic via onTunnelURL callback — just confirm ─
  spin('ap-render-icon');
  await sleep(2000); // give Render API call time to complete
  const s = await fetch('/api/tunnel/status').then(r => r.json());
  if (s.error) {
    setIcon('ap-render-icon', '⚠');
    toast('⚠️ Render update issue: ' + s.error, 6000);
  } else {
    setIcon('ap-render-icon', '✓');
  }

  state.tunnelURL = tunnelURL;
  showFinalDone(tunnelURL);
}

function showActivateError(msg) {
  const el = document.getElementById('activate-error');
  el.textContent = '✗ ' + msg;
  el.style.display = 'inline-flex';
}

function showFinalDone(tunnelURL) {
  const renderKey = document.getElementById('f-renderKey').value.trim();
  const serviceID = document.getElementById('f-serviceID').value.trim();
  const webhookURL = document.getElementById('f-webhookURL').value.trim();
  const secret    = document.getElementById('f-webhookSecret').value.trim();

  // Summary grid
  const grid = document.getElementById('done-summary');
  const rows = [
    ['Tunnel URL', tunnelURL],
    ['Render Service', serviceID || '—'],
    ['MBL2PC URL', webhookURL || '—'],
  ];
  grid.innerHTML = rows.map(([k,v]) =>
    '<div class="key">' + escHtml(k) + '</div><div class="val">' + escHtml(v) + '</div>'
  ).join('');

  // Env block
  const envBlock = document.getElementById('done-env-block');
  const lines = [
    'FORGE_INBOUND_URL=' + tunnelURL + '  ← auto-managed, already set',
    'FORGE_WEBHOOK_SECRET=' + (secret || '(your webhook secret)') + '  ← set this on Render',
  ];
  const existing = envBlock.querySelector('.copy-btn');
  envBlock.textContent = lines.join('\n');
  envBlock.prepend(existing || Object.assign(document.createElement('button'), {
    className: 'copy-btn', textContent: 'Copy',
    onclick: () => copyEl('done-env-block')
  }));

  goStep(4);
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function toggleEye(id, btn) {
  const el = document.getElementById(id);
  el.type = el.type === 'password' ? 'text' : 'password';
  btn.textContent = el.type === 'password' ? '👁' : '🙈';
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function copyEl(id) {
  const el = document.getElementById(id);
  const text = el.innerText.replace(/Copy\n?/,'').trim();
  navigator.clipboard.writeText(text).then(() => toast('📋 Copied!'));
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let toastTimer;
function toast(msg, ms = 2500) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

init();
</script>
</body>
</html>`
