// The six Forge Terminal portfolio screens, rebuilt from the shipped UI.
//
// Each builder returns a standalone HTML document that the portfolio capture
// runner screenshots into a PNG. The layouts mirror real product surfaces —
// the command rail, the context-engineering file browser, the MCP bridge, the
// release manager, the web app debugger, and the secret vault — while every
// value on screen comes from the fictional workspace in the demo-data module.

import {
  DEMO_COMMAND_CARDS,
  DEMO_CONTEXT_CART,
  DEMO_DEBUGGER_CAPABILITIES,
  DEMO_FILE_GROUPS,
  DEMO_MCP_PANEL,
  DEMO_PROJECT_NAMES,
  DEMO_PROJECTS_ROOT,
  DEMO_RELEASE_MANAGER,
  DEMO_TERMINAL_LINES,
  DEMO_TERMINAL_PROMPT,
  DEMO_ACTIVE_REPOSITORY,
  DEMO_VAULT_SECRETS,
  DEMO_VAULT_SECRET_COUNT,
} from './forge-terminal-demo-data.mjs';
import {
  createForgeDocument,
  createForgeShell,
  createRailControls,
  createRailTabs,
  createUpdateBanner,
  escapeHtml,
} from './forge-terminal-shell.mjs';

// The three assistants a command card can be launched with in the shipped rail.
const RUN_WITH_TARGETS = ['Agent', 'Copilot', 'Gemini'];
const ACTIVE_RUN_WITH_TARGET = 'Agent';

// How many projects fit the rail's two-column grid before it scrolls.
const VISIBLE_PROJECT_COUNT = 22;

// ── Shared terminal surface ─────────────────────────────────────────────────

/** Renders the scrollback, updater banner, and prompt shown left of the rail. */
function createTerminalSurface() {
  const scrollbackMarkup = DEMO_TERMINAL_LINES
    .map((terminalLine) => `<div class="line ${terminalLine.tone}">${escapeHtml(terminalLine.text) || '&nbsp;'}</div>`)
    .join('');

  return `
    <div class="replayed-line">&gt; plan the cache layer for the quote engine</div>
    <div class="scrollback">${scrollbackMarkup}</div>
    ${createUpdateBanner()}
    <div class="prompt-area">${escapeHtml(DEMO_TERMINAL_PROMPT)}<span style="color:#22d3ee">▌</span></div>
    <div class="mode-line">▸▸ auto mode on <span>(shift+tab to cycle) · ← for agents</span></div>`;
}

/** Wraps a rail panel in the tab bar and control row every rail destination shows. */
function createRailPanel(activeRailTabId, headingMarkup, panelMarkup) {
  return `
    ${createRailTabs(activeRailTabId)}
    <div class="rail-scroll">
      ${headingMarkup}
      ${createRailControls()}
      ${panelMarkup}
    </div>`;
}

function createRailHeading(titleMarkup, headNote = '') {
  const noteMarkup = headNote ? `<span class="head-note">${escapeHtml(headNote)}</span>` : '';
  return `<div class="rail-head"><h2>${titleMarkup}</h2>${noteMarkup}</div>`;
}

// ── Screen 1 — multi-tab terminal with the command rail ─────────────────────

function createProjectGrid() {
  const chipsMarkup = DEMO_PROJECT_NAMES.slice(0, VISIBLE_PROJECT_COUNT)
    .map((projectName) => `<span class="project-chip">📁 ${escapeHtml(projectName)}</span>`)
    .join('');

  return `
    <div class="section-label" style="display:flex;justify-content:space-between;">
      <span>📁 Projects</span><span>${escapeHtml(DEMO_PROJECTS_ROOT)}</span>
    </div>
    <div class="project-grid">${chipsMarkup}</div>`;
}

function createRunWithSelector() {
  const optionsMarkup = RUN_WITH_TARGETS.map((runTarget) => {
    const activeClassName = runTarget === ACTIVE_RUN_WITH_TARGET ? ' active' : '';
    return `<span class="run-option${activeClassName}">${escapeHtml(runTarget)}</span>`;
  }).join('');

  return `<div class="run-with"><span class="section-label" style="margin:0">RUN WITH</span>${optionsMarkup}</div>`;
}

function createCommandCards() {
  return DEMO_COMMAND_CARDS.map((commandCard) => `
    <div class="command-card">
      <span class="card-avatar">${commandCard.icon}</span>
      <div class="card-meta">
        <div class="card-name">${escapeHtml(commandCard.title)}</div>
        <div class="card-tag">${escapeHtml(commandCard.tag)} · ${escapeHtml(commandCard.note)}</div>
        <div class="card-actions">
          <span class="ghost-button">⧉ Paste</span><span class="run-button">▷ Run</span>
        </div>
      </div>
    </div>`).join('');
}

function createCommandsRailStyles() {
  return `<style>
    .project-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-bottom: 4px; }
    .project-chip { background: #16161d; border: 1px solid #24242e; border-radius: 6px;
      padding: 4px 7px; font-size: 9.5px; color: #b9b9c8; overflow: hidden;
      white-space: nowrap; text-overflow: ellipsis; }
    .run-with { display: flex; align-items: center; gap: 6px; margin: 12px 0 8px; }
    .run-option { border: 1px solid #2a2a35; border-radius: 999px; padding: 2px 9px;
      font-size: 9.5px; color: #9a9aa8; }
    .run-option.active { border-color: #22d3ee; color: #22d3ee; }
    .command-card { display: flex; gap: 8px; background: #14141a; border: 1px solid #24242e;
      border-radius: 9px; padding: 8px; margin-bottom: 7px; }
    .card-avatar { width: 28px; height: 28px; border-radius: 7px; background: #1e1e27;
      display: flex; align-items: center; justify-content: center; font-size: 13px; }
    .card-meta { flex: 1; min-width: 0; }
    .card-name { font-size: 10.5px; color: #eaeaf2; font-weight: 600; }
    .card-tag { font-size: 8.5px; color: #5f5f6d; margin-top: 1px; }
    .card-actions { display: flex; gap: 6px; margin-top: 6px; }
    .ghost-button { flex: 1; text-align: center; border: 1px solid #2a2a35; border-radius: 5px;
      padding: 3px 0; font-size: 9px; color: #b6b6c6; }
    .run-button { flex: 1; text-align: center; border-radius: 5px; padding: 3px 0;
      font-size: 9px; color: #04222a; font-weight: 700;
      background: linear-gradient(90deg, #22d3ee, #6366f1); }
  </style>`;
}

function createMultiTabTerminalScreen() {
  const railMarkup = createRailPanel(
    'commands',
    createRailHeading('⚡ Commands', '＋ Add'),
    `${createCommandsRailStyles()}${createProjectGrid()}${createRunWithSelector()}${createCommandCards()}`,
  );

  return createForgeDocument(
    'Forge Terminal — multi-tab workspace',
    createForgeShell(createTerminalSurface(), railMarkup),
  );
}

// ── Screen 2 — context engineering with a token budget ──────────────────────

function createFileGroups() {
  return DEMO_FILE_GROUPS.map((fileGroup) => {
    const filesMarkup = fileGroup.files.map((repositoryFile) => {
      const isSelected = DEMO_CONTEXT_CART.selectedFileNames.includes(repositoryFile.name);
      return `<div class="file-row${isSelected ? ' selected' : ''}">
        <span class="file-name">📄 ${escapeHtml(repositoryFile.name)}</span>
        <span class="file-meta">${escapeHtml(repositoryFile.tokens)} · ${escapeHtml(repositoryFile.modified)}</span>
        <span class="file-check">${isSelected ? '☑' : '☐'}</span>
      </div>`;
    }).join('');

    return `<div class="group-name">▾ ${escapeHtml(fileGroup.directory)}</div>${filesMarkup}`;
  }).join('');
}

function createContextCart() {
  const cartItemsMarkup = DEMO_CONTEXT_CART.selectedFileNames
    .map((fileName) => `<div class="cart-item">📄 ${escapeHtml(fileName)}</div>`)
    .join('');

  return `
    <div class="cart">
      <div class="card-title"><span>🛒 Context Cart</span></div>
      <div class="cart-budget">${escapeHtml(DEMO_CONTEXT_CART.usedTokenLabel)} /
        ${escapeHtml(DEMO_CONTEXT_CART.budgetTokenLabel)} tokens</div>
      <div class="cart-track"><span style="width:${DEMO_CONTEXT_CART.usedPercent}%"></span></div>
      ${cartItemsMarkup}
      <div class="cart-note">Send only these files as context</div>
    </div>`;
}

function createFilesRailStyles() {
  return `<style>
    .view-tabs { display: flex; gap: 5px; margin-bottom: 9px; }
    .view-tabs span { flex: 1; text-align: center; border: 1px solid #2a2a35; border-radius: 6px;
      padding: 3px 0; font-size: 9.5px; color: #9a9aa8; }
    .view-tabs span.active { background: #2c2a68; border-color: #6366f1; color: #c7c8ff; }
    .file-columns { display: grid; grid-template-columns: 1.05fr .95fr; gap: 8px; }
    .group-name { color: #6366f1; font-size: 8.5px; font-weight: 700; letter-spacing: .07em;
      margin: 8px 0 4px; }
    .file-row { background: #14141a; border: 1px solid #24242e; border-radius: 7px;
      padding: 5px 6px; margin-bottom: 4px; position: relative; }
    .file-row.selected { border-color: #22d3ee; }
    .file-name { display: block; font-size: 9.5px; color: #dcdce8; white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis; padding-right: 14px; }
    .file-meta { display: block; font-size: 8px; color: #5f5f6d; margin-top: 2px; }
    .file-check { position: absolute; top: 5px; right: 6px; font-size: 9px; color: #22d3ee; }
    .cart { background: #14141a; border: 1px solid #24242e; border-radius: 9px; padding: 9px; }
    .cart-budget { font-size: 9px; color: #8b8b99; margin: 7px 0 5px; }
    .cart-track { height: 4px; border-radius: 999px; background: #23232c; overflow: hidden;
      margin-bottom: 9px; }
    .cart-track span { display: block; height: 100%; background: #22d3ee; }
    .cart-item { background: #1a1a22; border-radius: 5px; padding: 4px 6px; margin-bottom: 4px;
      font-size: 9px; color: #cfd6e2; white-space: nowrap; overflow: hidden;
      text-overflow: ellipsis; }
    .cart-note { font-size: 8px; color: #5f5f6d; margin-top: 6px; }
  </style>`;
}

function createContextEngineeringScreen() {
  const panelMarkup = `
    ${createFilesRailStyles()}
    <div class="view-tabs">
      <span>Heatmap</span><span class="active">Graph</span><span>Search</span>
    </div>
    <div class="file-columns">
      <div>
        <div class="section-label" style="margin-top:0">FILES GROUPED BY DIRECTORY</div>
        ${createFileGroups()}
      </div>
      <div>${createContextCart()}</div>
    </div>`;

  const railMarkup = createRailPanel(
    'files',
    createRailHeading('🗂 Files', DEMO_ACTIVE_REPOSITORY),
    panelMarkup,
  );

  return createForgeDocument(
    'Forge Terminal — context engineering',
    createForgeShell(createTerminalSurface(), railMarkup),
  );
}

// ── Screen 3 — MCP bridge and adaptive build environments ───────────────────

function createActiveToolList() {
  return DEMO_MCP_PANEL.activeTools.map((activeTool) => `
    <div class="tool-row">
      <span class="tool-name">${escapeHtml(activeTool.name)}</span>
      <span class="tool-note">${escapeHtml(activeTool.note)}</span>
    </div>`).join('');
}

function createConnectTargets() {
  return DEMO_MCP_PANEL.connectTargets.map((connectTarget) => {
    const isActive = connectTarget === DEMO_MCP_PANEL.activeConnectTarget;
    return `<span class="connect-tab${isActive ? ' active' : ''}">${escapeHtml(connectTarget)}</span>`;
  }).join('');
}

function createMcpRailStyles() {
  return `<style>
    .token-field { display: flex; align-items: center; justify-content: space-between;
      background: #101017; border: 1px solid #24242e; border-radius: 6px; padding: 5px 7px;
      font-family: var(--mono); font-size: 9px; color: #b6b6c6; }
    .token-field span:last-child { color: #22d3ee; }
    .connect-tabs { display: flex; gap: 6px; margin-bottom: 6px; }
    .connect-tab { flex: 1; text-align: center; font-size: 9.5px; color: #8b8b99;
      padding-bottom: 4px; }
    .connect-tab.active { color: #e8e8ef; box-shadow: inset 0 -2px 0 #22d3ee; }
    .connected-note { color: #22c55e; font-size: 9px; margin-bottom: 8px; }
    .tool-row { margin-bottom: 6px; }
    .tool-name { display: block; font-family: var(--mono); font-size: 9px; color: #c084fc; }
    .tool-note { display: block; font-size: 8.5px; color: #6f6f7e; line-height: 1.45; }
  </style>`;
}

function createMcpIntegrationScreen() {
  const panelMarkup = `
    ${createMcpRailStyles()}
    <div class="card">
      <div class="card-title"><span>🧩 MCP Discovery</span><span>⌄</span></div>
      <div class="card-sub">Browse ${DEMO_MCP_PANEL.discoveredServerCount} servers · Copy configs</div>
    </div>
    <div class="card">
      <div class="card-title"><span>⚙ Adaptive Build Environments</span>
        <span class="badge green">Active</span></div>
      <div class="card-sub">${DEMO_MCP_PANEL.environmentToolCount} tools · Auto Environment</div>
      <div class="card-body">Builds run natively, in WSL2, or in Docker — the environment is
        detected per repository instead of configured by hand.</div>
    </div>
    <div class="section-label">MCP TOKEN</div>
    <div class="token-field"><span>${escapeHtml(DEMO_MCP_PANEL.tokenPathLabel)}</span><span>⧉ Copy</span></div>
    <div class="section-label">CONNECT YOUR AI TOOL</div>
    <div class="connect-tabs">${createConnectTargets()}</div>
    <div class="connected-note">↳ Already connected.</div>
    <div class="callout"><b>🔒 Vault and issue-tracker metadata</b>
      The repository config uses a relative path, so the vault proxy stays available in every clone.</div>
    <div class="callout amber"><b>💡 Hitting Windows build issues?</b>
      Ask the agent to run the build with the auto strategy and the right sandbox is chosen for you.</div>
    <div class="section-label">ACTIVE TOOLS</div>
    ${createActiveToolList()}`;

  const railMarkup = createRailPanel('mcp', createRailHeading('🔌 MCP'), panelMarkup);

  return createForgeDocument(
    'Forge Terminal — MCP bridge',
    createForgeShell(createTerminalSurface(), railMarkup),
  );
}

// ── Screen 4 — release manager ──────────────────────────────────────────────

function createReleaseRailStyles() {
  return `<style>
    .version-jump { display: flex; align-items: center; justify-content: space-around;
      background: #101017; border: 1px solid #24242e; border-radius: 8px; padding: 8px;
      margin: 8px 0; }
    .version-jump .label { display: block; font-size: 7.5px; color: #5f5f6d;
      letter-spacing: .1em; margin-bottom: 3px; }
    .version-jump .value { font-size: 11px; color: #dcdce8; font-weight: 650; }
    .version-jump .next { background: #f97316; color: #2a1003; border-radius: 5px;
      padding: 2px 8px; }
    .bump-row { display: flex; gap: 6px; margin: 8px 0; }
    .bump-row span { flex: 1; text-align: center; border: 1px solid #2a2a35; border-radius: 7px;
      padding: 5px 0; font-size: 9.5px; color: #b6b6c6; }
    .bump-row span b { display: block; font-size: 7.5px; color: #5f5f6d; font-weight: 500; }
    .bump-row span.active { background: #f97316; border-color: #f97316; color: #2a1003; }
    .bump-row span.active b { color: #5c2a08; }
    .input-field { background: #101017; border: 1px solid #24242e; border-radius: 6px;
      padding: 6px 7px; font-size: 9.5px; color: #8b8b99; font-family: var(--mono); }
    .primary-button { display: block; text-align: center; background: #f97316; color: #2a1003;
      border-radius: 7px; padding: 7px 0; font-size: 10.5px; font-weight: 700; margin-top: 9px; }
    .ghost-row { text-align: center; border: 1px solid #2a2a35; border-radius: 7px;
      padding: 5px 0; font-size: 9.5px; color: #b6b6c6; margin-top: 8px; }
  </style>`;
}

function createReleaseManagerScreen() {
  const releaseManager = DEMO_RELEASE_MANAGER;
  const panelMarkup = `
    ${createReleaseRailStyles()}
    <div class="card">
      <div class="card-title"><span>🏷 Release Manager</span><span>⚙</span></div>
      <div class="card-sub">${escapeHtml(releaseManager.productLabel)}</div>
      <div class="card-body">Commit, merge to main, and create a tagged release.</div>
      <div class="version-jump">
        <div><span class="label">CURRENT</span><span class="value">${escapeHtml(releaseManager.currentVersion)}</span></div>
        <div style="color:#5f5f6d">→</div>
        <div><span class="label">NEXT</span><span class="value next">${escapeHtml(releaseManager.nextVersion)}</span></div>
      </div>
      <span class="badge green">🔧 ${escapeHtml(releaseManager.changeKind)}</span>
      <div class="bump-row">
        <span>MAJOR<b>${escapeHtml(releaseManager.majorVersion)}</b></span>
        <span>MINOR<b>${escapeHtml(releaseManager.minorVersion)}</b></span>
        <span class="active">FIX<b>${escapeHtml(releaseManager.patchVersion)}</b></span>
      </div>
      <div class="section-label" style="margin-top:8px">COMMIT MESSAGE (OPTIONAL)</div>
      <div class="input-field">${escapeHtml(releaseManager.commitMessage)}</div>
      <div class="ghost-row">▷ Start background release job<br />
        <span style="font-size:8px;color:#5f5f6d">Builds and publishes with a toast notification</span></div>
      <div class="ghost-row">⌄ Show Command</div>
      <div class="primary-button">▷ Prepare Release ${escapeHtml(releaseManager.nextVersion)}</div>
    </div>
    <div class="card">
      <div class="card-title"><span>⬡ Forge Workflow</span><span>⌄</span></div>
      <div class="card-sub">10 modules · BEST</div>
    </div>`;

  const railMarkup = createRailPanel('tools', createRailHeading('🔧 Tools'), panelMarkup);

  return createForgeDocument(
    'Forge Terminal — release manager',
    createForgeShell(createTerminalSurface(), railMarkup),
  );
}

// ── Screen 5 — web app debugger ─────────────────────────────────────────────

function createCapabilityList() {
  const supportedMarkup = DEMO_DEBUGGER_CAPABILITIES.supported
    .map((capability) => `<div class="cap yes">✅ ${escapeHtml(capability)}</div>`)
    .join('');
  const unsupportedMarkup = DEMO_DEBUGGER_CAPABILITIES.unsupported
    .map((capability) => `<div class="cap no">❌ ${escapeHtml(capability)}</div>`)
    .join('');

  return `${supportedMarkup}${unsupportedMarkup}`;
}

function createDebuggerRailStyles() {
  return `<style>
    .cap { font-size: 9.5px; padding: 3px 0; }
    .cap.yes { color: #86efac; } .cap.no { color: #fca5a5; }
    .record-button { display: block; text-align: center; background: #2563eb; color: #eaf0ff;
      border-radius: 7px; padding: 7px 0; font-size: 10.5px; font-weight: 700; margin-top: 10px; }
    .field-label { font-size: 9px; color: #5f5f6d; border: 1px solid #24242e; border-radius: 6px;
      padding: 6px 7px; margin-top: 8px; }
  </style>`;
}

function createWebAppDebuggerScreen() {
  const panelMarkup = `
    ${createDebuggerRailStyles()}
    <div class="card">
      <div class="card-title"><span>🌐 Web App Debugger</span></div>
      <div class="card-sub">Record and analyse browser-based application issues</div>
      <div class="callout"><b>What it captures</b>
        Keyboard and mouse events, console logs, network requests, and a screen recording of the
        web application running in your browser.</div>
      <div class="callout amber"><b>ⓘ Note</b>
        This tool debugs client-side web apps only. It will not capture terminal commands,
        backend errors, or native desktop applications.</div>
      ${createCapabilityList()}
      <div class="field-label">Target App Path (optional)</div>
      <div class="field-label">ⓘ Connect External Logs (Setup)</div>
      <div class="record-button">📹 Follow Me</div>
    </div>`;

  const railMarkup = createRailPanel('tools', createRailHeading('🔧 Tools'), panelMarkup);

  return createForgeDocument(
    'Forge Terminal — web app debugger',
    createForgeShell(createTerminalSurface(), railMarkup),
  );
}

// ── Screen 6 — zero-knowledge secret vault ──────────────────────────────────

function createVaultSecretCards() {
  return DEMO_VAULT_SECRETS.map((vaultSecret) => {
    const warningMarkup = vaultSecret.warning
      ? `<div class="secret-warning">⚠ ${escapeHtml(vaultSecret.warning)}</div>`
      : '';

    return `
      <div class="secret-card">
        <div class="secret-head">
          <span class="secret-name">🔑 ${escapeHtml(vaultSecret.name)}</span>
          <span class="secret-controls"><span class="badge grey">Auto · Active</span> ✎ 🗑</span>
        </div>
        <div class="secret-var">${escapeHtml(vaultSecret.environmentVariable)}</div>
        ${warningMarkup}
        <div class="secret-toggle"><span class="switch"></span> Auto-inject on</div>
        <div class="secret-actions"><span>👁 Reveal</span><span>⧉ Copy</span></div>
      </div>`;
  }).join('');
}

function createVaultStyles() {
  return `<style>
    .vault-backdrop { position: fixed; inset: 0; background: rgba(4,4,7,.82);
      display: flex; align-items: center; justify-content: center; padding: 22px 0; }
    .vault-modal { width: 900px; max-height: 100%; background: #0f0f15; border: 1px solid #24242e;
      border-radius: 14px; overflow: hidden; display: flex; flex-direction: column; }
    .vault-head { display: flex; align-items: center; gap: 11px; padding: 15px 18px;
      border-bottom: 1px solid #1e1e26; }
    .vault-head .lock { font-size: 20px; }
    .vault-head h1 { margin: 0; font-size: 15px; }
    .vault-head p { margin: 2px 0 0; font-size: 10px; color: #6f6f7e; }
    .vault-head .spacer { flex: 1; }
    .vault-toolbar { display: flex; align-items: center; gap: 9px; padding: 11px 18px;
      border-bottom: 1px solid #1e1e26; font-size: 10px; color: #8b8b99; }
    .vault-toolbar .search, .vault-toolbar .filter { border: 1px solid #24242e; border-radius: 6px;
      padding: 5px 9px; background: #14141a; }
    .vault-toolbar .search { flex: 1; }
    .vault-toolbar .add { background: #22d3ee; color: #04222a; border-radius: 6px;
      padding: 5px 11px; font-weight: 700; }
    .vault-list { padding: 12px 18px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .secret-card { background: #14141a; border: 1px solid #24242e; border-radius: 9px; padding: 11px; }
    .secret-head { display: flex; align-items: flex-start; justify-content: space-between; }
    .secret-name { font-size: 11.5px; color: #eaeaf2; font-weight: 600; }
    .secret-controls { font-size: 9px; color: #5f5f6d; white-space: nowrap; }
    .secret-var { font-family: var(--mono); font-size: 10px; color: #22c55e; margin-top: 7px; }
    .secret-warning { font-size: 8.5px; color: #f59e0b; margin-top: 6px; }
    .secret-toggle { display: flex; align-items: center; gap: 7px; font-size: 9.5px;
      color: #8b8b99; margin-top: 9px; }
    .switch { width: 24px; height: 13px; border-radius: 999px; background: #22c55e;
      position: relative; }
    .switch::after { content: ''; position: absolute; top: 2px; right: 2px; width: 9px;
      height: 9px; border-radius: 50%; background: #061a0d; }
    .secret-actions { display: flex; gap: 7px; margin-top: 8px; }
    .secret-actions span { border: 1px solid #2a2a35; border-radius: 5px; padding: 3px 9px;
      font-size: 9px; color: #b6b6c6; }
  </style>`;
}

function createSecretVaultScreen() {
  const bodyMarkup = `
    ${createVaultStyles()}
    <div class="vault-backdrop">
      <div class="vault-modal">
        <div class="vault-head">
          <span class="lock">🔒</span>
          <div><h1>Forge Vault</h1><p>End-to-end encrypted · OS credential store</p></div>
          <span class="spacer"></span>
          <span class="badge green">● Secured</span><span style="color:#5f5f6d">✕</span>
        </div>
        <div class="vault-toolbar">
          <strong style="color:#b6b6c6">${DEMO_VAULT_SECRET_COUNT} SECRETS STORED</strong>
          <span class="search">🔍 Search by name, env var, or URL</span>
          <span class="filter">Commonly used ⌄</span>
          <span class="add">＋ Add Secret</span>
        </div>
        <div class="vault-list">${createVaultSecretCards()}</div>
      </div>
    </div>`;

  return createForgeDocument('Forge Terminal — secret vault', bodyMarkup);
}

// ── Registry consumed by the portfolio capture runner ───────────────────────

/** Maps each Forge Terminal showcase feature id to the screen it renders. */
export const FORGE_TERMINAL_SCREEN_BUILDERS = {
  'multi-tab-terminal': createMultiTabTerminalScreen,
  'context-engineering': createContextEngineeringScreen,
  'mcp-integration': createMcpIntegrationScreen,
  'release-manager': createReleaseManagerScreen,
  'web-app-debugger': createWebAppDebuggerScreen,
  'secret-vault': createSecretVaultScreen,
};
