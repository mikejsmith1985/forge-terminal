// Builds PNG-only portfolio visuals and standalone data for the employer-facing showcase.

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import {
  PORTFOLIO_APP_DEFINITIONS,
  PORTFOLIO_CAPTURE_CONFIGS,
} from './apps/index.mjs';

const require = createRequire(import.meta.url);

const PROJECT_ROOT = process.cwd();
const PORTFOLIO_ASSET_DIRECTORY = path.join(PROJECT_ROOT, 'web', 'portfolio', 'assets');
const GENERATED_SVG_DIRECTORY = path.join(PORTFOLIO_ASSET_DIRECTORY, 'generated');
const PORTFOLIO_DATA_DIRECTORY = path.join(PROJECT_ROOT, 'web', 'portfolio', 'data');
const PORTFOLIO_DATA_FILE_PATH = path.join(PORTFOLIO_DATA_DIRECTORY, 'apps.mjs');
const NODE_TOOLBOX_PLAYWRIGHT_PATH = 'C:\\ProjectsWin\\NodeToolbox\\node_modules\\playwright';
const MBL2PC_CAPTURE_DIRECTORY = 'C:\\ProjectsWin\\mbl2pc\\portfolio_screenshots';
const DESKTOP_SCREEN_WIDTH = 1600;
const DESKTOP_SCREEN_HEIGHT = 1000;
const QUIKEYS_SCREEN_WIDTH = 1280;
const QUIKEYS_SCREEN_HEIGHT = 820;
const MBL2PC_ASSET_SOURCES = new Map([
  ['chat-dashboard', '01_chat_messages_light.png'],
  ['dark-mode-theme', '02_chat_dark_mode.png'],
  ['search-and-theme', '03_ocean_theme_search.png'],
]);

const SOURCE_DERIVED_SCREEN_BUILDERS = {
  'forge-terminal:multi-tab-terminal': createForgeTerminalWorkspaceScreen,
  'forge-terminal:instruction-workflow': createForgeInstructionWorkflowScreen,
  'forge-terminal:tunnel-mobile': createForgeTunnelScreen,
  'nodetoolbox:home-launcher': createNodeToolboxHomeScreen,
  'nodetoolbox:sprint-dashboard': createNodeToolboxSprintScreen,
  'nodetoolbox:snow-hub-art': createNodeToolboxOperationsScreen,
  'eztest:onboarding': createEztestOnboardingScreen,
  'eztest:dashboard-actions': createEztestDashboardScreen,
  'eztest:run-modal': createEztestRunModalScreen,
  'quikeys:unlock-flow': createQuiKeysUnlockScreen,
  'quikeys:macro-manager': createQuiKeysManagerScreen,
  'quikeys:macro-dialog': createQuiKeysDialogScreen,
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function createPngImagePath(portfolioApp, portfolioFeature) {
  return `./assets/${portfolioApp.slug}/${portfolioApp.slug}-${portfolioFeature.id}.png`;
}

function createBrowser() {
  if (!fsSync.existsSync(path.join(NODE_TOOLBOX_PLAYWRIGHT_PATH, 'package.json'))) {
    throw new Error(
      `Playwright is required at ${NODE_TOOLBOX_PLAYWRIGHT_PATH}. Run npm install in C:\\ProjectsWin\\NodeToolbox first.`,
    );
  }

  const { chromium } = require(NODE_TOOLBOX_PLAYWRIGHT_PATH);
  return chromium.launch({ headless: true });
}

function getCaptureConfig(portfolioAppSlug) {
  const captureConfig = PORTFOLIO_CAPTURE_CONFIGS.find(
    (candidateConfig) => candidateConfig.slug === portfolioAppSlug,
  );

  if (!captureConfig) {
    throw new Error(`No capture config exists for ${portfolioAppSlug}.`);
  }

  return captureConfig;
}

function getCaptureTarget(portfolioApp, portfolioFeature) {
  const captureConfig = getCaptureConfig(portfolioApp.slug);
  const captureTarget = captureConfig.captureTargets.find(
    (candidateTarget) => candidateTarget.featureId === portfolioFeature.id,
  );

  if (!captureTarget) {
    throw new Error(`${portfolioApp.slug}.${portfolioFeature.id} has no capture target.`);
  }

  return captureTarget;
}

function createWindowChrome(title, bodyMarkup, options = {}) {
  const {
    appSlug = '',
    activeNav = '',
    navigationItems = [],
    sidebarTitle = 'Portfolio demo',
    footerMarkup = '',
  } = options;
  const navMarkup = navigationItems.map((navigationItem) => {
    const activeClassName = navigationItem === activeNav ? ' active' : '';
    return `<div class="nav-item${activeClassName}">${escapeHtml(navigationItem)}</div>`;
  }).join('');

  return `
    <div class="desktop-frame ${escapeHtml(appSlug)}">
      <div class="window-shell">
        <div class="titlebar">
          <span class="dot red"></span><span class="dot yellow"></span><span class="dot green"></span>
          <strong>${escapeHtml(title)}</strong>
        </div>
        <div class="app-shell">
          <aside class="sidebar">
            <div class="sidebar-title">${escapeHtml(sidebarTitle)}</div>
            ${navMarkup}
          </aside>
          <main class="content-area">${bodyMarkup}</main>
        </div>
        ${footerMarkup}
      </div>
    </div>
  `;
}

function createMetricCards(metrics) {
  return `<div class="metric-grid">${metrics.map(([label, value, detail]) => `
    <div class="metric-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </div>
  `).join('')}</div>`;
}

function createDataTable(columns, rows, extraClassName = '') {
  return `
    <div class="data-table ${escapeHtml(extraClassName)}">
      <div class="table-row table-head">${columns.map((column) => `<span>${escapeHtml(column)}</span>`).join('')}</div>
      ${rows.map((row) => `<div class="table-row">${row.map((cell) => `<span>${escapeHtml(cell)}</span>`).join('')}</div>`).join('')}
    </div>
  `;
}

function createTerminalBlock(lines) {
  return `<div class="terminal-block">${lines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>`;
}

function createBoardColumns(columns) {
  return `<div class="board-columns">${columns.map(([title, cards]) => `
    <section class="board-column">
      <h3>${escapeHtml(title)}</h3>
      ${cards.map((card) => `<article>${escapeHtml(card)}</article>`).join('')}
    </section>
  `).join('')}</div>`;
}

function createSourceScreenDocument(title, accentColor, bodyMarkup) {
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(title)}</title>
      <style>
        :root { --accent: ${accentColor}; --bg: #07101d; --panel: rgba(255,255,255,.075); --line: rgba(255,255,255,.11); --text: #f4f8ff; --muted: #9fb1d1; }
        * { box-sizing: border-box; }
        body { margin: 0; width: 100vw; min-height: 100vh; overflow: hidden; background: radial-gradient(circle at top left, color-mix(in srgb, var(--accent) 28%, transparent), transparent 34%), #060b14; color: var(--text); font-family: Inter, "Segoe UI", Arial, sans-serif; }
        .desktop-frame { width: 100vw; height: 100vh; padding: 30px; background: linear-gradient(135deg, rgba(15,27,47,.96), rgba(5,8,16,.98)); }
        .window-shell { height: 100%; overflow: hidden; border: 1px solid var(--line); border-radius: 26px; background: #0a1324; box-shadow: 0 30px 90px rgba(0,0,0,.46); }
        .titlebar { height: 54px; display: flex; align-items: center; gap: 12px; padding: 0 20px; border-bottom: 1px solid var(--line); background: rgba(255,255,255,.045); color: #dce8ff; }
        .dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; } .red { background: #ff5f57; } .yellow { background: #ffbd2e; } .green { background: #28c840; }
        .titlebar strong { margin-left: 8px; font-weight: 650; }
        .app-shell { height: calc(100% - 54px); display: grid; grid-template-columns: 235px minmax(0, 1fr); }
        .sidebar { padding: 24px 16px; border-right: 1px solid var(--line); background: rgba(255,255,255,.035); }
        .sidebar-title { margin-bottom: 18px; color: var(--accent); font-weight: 800; letter-spacing: .05em; text-transform: uppercase; font-size: 13px; }
        .nav-item { margin-bottom: 9px; padding: 12px 14px; border-radius: 14px; color: #b9c8e8; font-weight: 650; }
        .nav-item.active { background: linear-gradient(135deg, var(--accent), rgba(255,255,255,.18)); color: #07101d; }
        .content-area { padding: 26px; overflow: hidden; }
        .screen-heading { display: flex; justify-content: space-between; gap: 22px; align-items: flex-start; margin-bottom: 20px; }
        .screen-heading h1 { margin: 0 0 7px; font-size: 34px; line-height: 1.08; letter-spacing: -.02em; }
        .screen-heading p { margin: 0; max-width: 850px; color: #b9c8e8; font-size: 18px; line-height: 1.42; }
        .pill-row, .toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
        .pill, .toolbar span, .badge { padding: 8px 12px; border-radius: 999px; background: rgba(255,255,255,.075); border: 1px solid var(--line); color: #dbe7ff; font-weight: 700; font-size: 13px; }
        .metric-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 18px; }
        .metric-card, .panel, .feature-tile, .dialog-card { border: 1px solid var(--line); border-radius: 19px; background: var(--panel); box-shadow: inset 0 1px 0 rgba(255,255,255,.045); }
        .metric-card { padding: 16px; } .metric-card span { color: var(--muted); font-size: 13px; display: block; } .metric-card strong { display: block; margin: 5px 0; font-size: 30px; } .metric-card small { color: #c2d2ef; }
        .two-column { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(350px, .75fr); gap: 18px; }
        .three-column { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
        .panel { padding: 18px; } .panel h2, .panel h3 { margin: 0 0 14px; }
        .data-table { display: grid; gap: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 15px; }
        .table-row { display: grid; grid-template-columns: .85fr 1.7fr 1fr .9fr; gap: 12px; padding: 12px 14px; border-bottom: 1px solid var(--line); color: #eef4ff; align-items: center; }
        .table-row:last-child { border-bottom: 0; } .table-head { color: var(--muted); text-transform: uppercase; letter-spacing: .08em; font-size: 12px; font-weight: 800; background: rgba(255,255,255,.045); }
        .terminal-block { padding: 18px; border-radius: 18px; background: #030712; border: 1px solid rgba(130,180,255,.22); color: #d8e5ff; font: 17px/1.58 Consolas, "Cascadia Mono", monospace; box-shadow: inset 0 0 40px rgba(53,116,255,.08); }
        .terminal-block div { border-bottom: 1px solid rgba(255,255,255,.06); padding: 3px 0; } .terminal-block div:last-child { border-bottom: 0; }
        .feature-tile { padding: 16px; min-height: 125px; } .feature-tile strong { display: block; font-size: 18px; margin-bottom: 8px; } .feature-tile p { margin: 0; color: #b9c8e8; line-height: 1.38; }
        .board-columns { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
        .board-column { padding: 14px; border-radius: 17px; background: rgba(255,255,255,.055); border: 1px solid var(--line); } .board-column h3 { margin: 0 0 12px; color: var(--accent); }
        .board-column article { padding: 11px; margin-bottom: 10px; border-radius: 13px; background: rgba(0,0,0,.22); border: 1px solid rgba(255,255,255,.08); color: #e9f1ff; }
        .progress-track { height: 10px; border-radius: 999px; background: rgba(255,255,255,.09); overflow: hidden; } .progress-track span { display: block; height: 100%; background: var(--accent); border-radius: inherit; }
        .phone-frame { width: 310px; margin: 0 auto; padding: 18px; border-radius: 38px; background: #050914; border: 1px solid rgba(255,255,255,.18); box-shadow: 0 18px 40px rgba(0,0,0,.35); }
        .phone-screen { min-height: 540px; border-radius: 28px; padding: 18px; background: linear-gradient(180deg,#101d31,#07101d); }
        .qr-box { width: 168px; height: 168px; margin: 20px auto; background: repeating-linear-gradient(45deg,#f5f8ff 0 8px,#07101d 8px 16px); border: 12px solid #f5f8ff; border-radius: 14px; }
        .wizard-steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; } .wizard-step { padding: 14px; border-radius: 15px; background: rgba(255,255,255,.065); border: 1px solid var(--line); color: #dbe8ff; } .wizard-step.active { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
        .form-row { display: grid; grid-template-columns: 180px 1fr; gap: 14px; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--line); color: #dce8ff; } .form-row span { color: var(--muted); }
        .native-window { margin: 0 auto; border: 1px solid #b8c0cc; border-radius: 10px; background: #f1f3f7; color: #1d2430; box-shadow: 0 24px 70px rgba(0,0,0,.42); overflow: hidden; font-family: "Segoe UI", Arial, sans-serif; }
        .native-title { height: 42px; padding: 10px 14px; background: #ffffff; border-bottom: 1px solid #d5dbe5; font-weight: 700; }
        .native-body { padding: 20px; } .native-body label { display: block; color: #4d5868; margin-bottom: 6px; font-size: 13px; }
        .native-input, .native-select, .native-textarea { width: 100%; padding: 10px 12px; border: 1px solid #c6ceda; border-radius: 7px; background: white; color: #1f2937; font: inherit; }
        .native-textarea { min-height: 122px; }
        .native-buttons { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; } .native-button { padding: 9px 16px; border-radius: 7px; border: 1px solid #b5bfcc; background: #fff; font-weight: 700; } .native-button.primary { background: #2563eb; color: white; border-color: #2563eb; }
        .native-table .table-row { color: #1f2937; grid-template-columns: 1.3fr .9fr 1fr 1fr 1.7fr .8fr; border-color: #d7dde7; } .native-table .table-head { background: #e8edf5; color: #4b5563; }
      </style>
    </head>
    <body>${bodyMarkup}</body>
  </html>`;
}

function createForgeTerminalWorkspaceScreen() {
  const bodyMarkup = createWindowChrome(
    'Forge Terminal - C:\\ProjectsWin\\benefits-enrollment-demo',
    `
      <header class="screen-heading">
        <div>
          <h1>Developer cockpit with real terminal state</h1>
          <p>Multiple PTY tabs, saved command cards, and workflow gates share one workspace so engineering rituals are visible while work happens.</p>
        </div>
        <div class="pill-row"><span class="pill">feature/portfolio-showcase</span><span class="pill">4 PTYs</span><span class="pill">Workflow green</span></div>
      </header>
      ${createMetricCards([
        ['Open tabs', '4', 'PowerShell, API, UI, Tests'],
        ['Command cards', '12', 'Saved repeatable workflows'],
        ['Workflow gates', '3/3', 'Branch, tests, proof recorded'],
        ['Repo health', 'Green', 'No failing checks in demo state'],
      ])}
      <div class="two-column">
        <section class="panel">
          <div class="toolbar"><span>PowerShell - API</span><span>Node UI</span><span>Test Runner</span><span>Release Notes</span></div>
          ${createTerminalBlock([
            'PS C:\\ProjectsWin\\benefits-enrollment-demo> forge workflow status',
            '[PASS] branch-created    feature/portfolio-showcase',
            '[PASS] tests-written     portfolio-data.test.mjs',
            '[PASS] tests-passed      go test ./... && npx vitest run',
            '[INFO] evidence bundle   validation.html with highlighted screenshots',
            'PS C:\\ProjectsWin\\benefits-enrollment-demo> npm run portfolio:publish',
            'Published static preview to GitHub Pages.',
          ])}
        </section>
        <section class="panel">
          <h2>Pinned command cards</h2>
          <div class="three-column" style="grid-template-columns: 1fr;">
            <div class="feature-tile"><strong>Run regression pack</strong><p>go test ./... + frontend vitest with compact status output.</p></div>
            <div class="feature-tile"><strong>Open PR checklist</strong><p>Branch, tests, changelog, proof dashboard, and release notes in one card.</p></div>
            <div class="feature-tile"><strong>Publish static preview</strong><p>Build portfolio assets and push GitHub Pages without leaving the terminal.</p></div>
          </div>
        </section>
      </div>
    `,
    {
      appSlug: 'forge-terminal',
      sidebarTitle: 'Forge Terminal',
      activeNav: 'Terminal',
      navigationItems: ['Terminal', 'Command Cards', 'Agents', 'Git', 'Workflow'],
    },
  );
  return createSourceScreenDocument('Forge Terminal multi-tab workspace', '#5d8cff', bodyMarkup);
}

function createForgeInstructionWorkflowScreen() {
  const bodyMarkup = createWindowChrome(
    'Forge Terminal - AI workflow controls',
    `
      <header class="screen-heading">
        <div>
          <h1>AI workflow with enforceable guardrails</h1>
          <p>The assistant thread, task plan, terminal output, and verification gates stay connected instead of becoming an unstructured chat transcript.</p>
        </div>
        <div class="pill-row"><span class="pill">Tutor mode</span><span class="pill">TDD enforced</span><span class="pill">PR-ready proof</span></div>
      </header>
      <div class="two-column">
        <section class="panel">
          <h2>Assistant conversation</h2>
          <div class="feature-tile"><strong>User</strong><p>Build employer-facing portfolio cards using real UI screenshots or source-derived replicas with safe mock data.</p></div>
          <div class="feature-tile"><strong>Copilot</strong><p>Replacing generic SVG mockups with PNG captures, asset validation, and direct portfolio wiring.</p></div>
          <div class="feature-tile"><strong>Code Tutor</strong><p>The changes teach through readable structures: per-app capture metadata, explicit image paths, and no hidden fallback.</p></div>
        </section>
        <section class="panel">
          <h2>Workflow ledger</h2>
          ${createDataTable(
            ['Gate', 'Evidence', 'Owner', 'State'],
            [
              ['Branch', 'feature/build-portfolio-showcase', 'GitHub Flow', 'Recorded'],
              ['Tests', 'portfolio-data + renderer', 'Node test', 'Queued'],
              ['Visual proof', 'PNG screenshots only', 'Portfolio runner', 'In progress'],
              ['Publish', 'GitHub Pages preview', 'gh-pages', 'Pending'],
            ],
          )}
        </section>
      </div>
      <section class="panel" style="margin-top:18px;">
        ${createTerminalBlock([
          '> workflow_preflight_check',
          'branch-created: pass',
          'tests-written: pass',
          'tests-passed: waiting on recovered portfolio validation',
          'next: capture highlighted visual proof and publish employer preview',
        ])}
      </section>
    `,
    {
      appSlug: 'forge-terminal',
      sidebarTitle: 'Forge Terminal',
      activeNav: 'Assistant',
      navigationItems: ['Terminal', 'Assistant', 'Plan', 'Review', 'Tutor'],
    },
  );
  return createSourceScreenDocument('Forge Terminal workflow assistant', '#5d8cff', bodyMarkup);
}

function createForgeTunnelScreen() {
  const bodyMarkup = createWindowChrome(
    'Forge Terminal - remote access setup',
    `
      <header class="screen-heading">
        <div>
          <h1>Remote and mobile handoff without leaking local context</h1>
          <p>Named tunnel setup, one-time access, mobile companion state, and safety controls are presented as one operator-ready flow.</p>
        </div>
        <div class="pill-row"><span class="pill">Named tunnel</span><span class="pill">10 min token</span><span class="pill">Vault disabled</span></div>
      </header>
      <div class="two-column">
        <section class="panel">
          <h2>Tunnel setup</h2>
          ${createDataTable(
            ['Setting', 'Configured value', 'Safety note', 'Status'],
            [
              ['Hostname', 'portfolio-demo.trycloudflare.com', 'Fictional demo host', 'Ready'],
              ['Access code', 'FT-2048', 'Rotates after preview', 'Active'],
              ['PTY mode', 'Read/write', 'Explicit user approval', 'Enabled'],
              ['Vault injection', 'Disabled', 'No secrets in browser session', 'Locked'],
            ],
          )}
          <div class="toolbar" style="margin-top:16px;"><span>Generate QR</span><span>Copy invite</span><span>Revoke session</span></div>
        </section>
        <section class="panel">
          <h2>Mobile companion preview</h2>
          <div class="phone-frame"><div class="phone-screen">
            <div class="badge">Forge Companion</div>
            <div class="qr-box"></div>
            <div class="feature-tile"><strong>Portfolio Demo</strong><p>Terminal session ready. Clipboard handoff is enabled for this one-time code only.</p></div>
          </div></div>
        </section>
      </div>
    `,
    {
      appSlug: 'forge-terminal',
      sidebarTitle: 'Forge Terminal',
      activeNav: 'Remote Access',
      navigationItems: ['Terminal', 'Remote Access', 'Vault', 'Mobile', 'Settings'],
    },
  );
  return createSourceScreenDocument('Forge Terminal tunnel workflow', '#5d8cff', bodyMarkup);
}

function createNodeToolboxHomeScreen() {
  const bodyMarkup = createWindowChrome(
    'NodeToolbox - Your personal utility belt',
    `
      <header class="screen-heading">
        <div>
          <h1>Your personal utility belt</h1>
          <p>A single local-first launcher organizes Agile delivery, ServiceNow, reporting, development utilities, and documentation surfaces into one internal operating system.</p>
        </div>
        <div class="pill-row"><span class="pill">Jira ready</span><span class="pill">ServiceNow ready</span><span class="pill">Confluence ready</span></div>
      </header>
      <section class="panel">
        <div class="three-column">
          ${[
            ['🏃 Team Dashboard', 'Live sprint/Kanban view with burndown, blockers, DSU, metrics, planning, and pointing.'],
            ['🚂 ART View', 'Release Train Engineer view with team health, predictability, goals, and release radar.'],
            ['📊 My Issues', 'Jira issues, custom JQL, saved filters, boards, health badges, and export.'],
            ['❄️ SNow Hub', 'Create change requests from Jira versions and pair Problem Records with Jira work.'],
            ['📈 Reports Hub', 'Director and RTE snapshots for delivery health, flow, quality, and status summaries.'],
            ['📖 Code Walkthrough', 'Architecture, security model, data flow, and API transparency report.'],
          ].map(([title, text]) => `<div class="feature-tile"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p></div>`).join('')}
        </div>
      </section>
      <div style="margin-top:18px;">${createMetricCards([
        ['Programs', '3', 'HSCS enrollment workstreams'],
        ['Modules', '11', 'One workspace, many jobs'],
        ['Release trains', '2', 'ART and team-level views'],
        ['Open risks', '5', 'Surfaced before status meetings'],
      ])}</div>
    `,
    {
      appSlug: 'nodetoolbox',
      sidebarTitle: 'NodeToolbox',
      activeNav: 'Home',
      navigationItems: ['Home', 'Team Dashboard', 'My Issues', 'SNow Hub', 'Reports'],
    },
  );
  return createSourceScreenDocument('NodeToolbox home launcher', '#1cc88a', bodyMarkup);
}

function createNodeToolboxSprintScreen() {
  const bodyMarkup = createWindowChrome(
    'NodeToolbox - Team Dashboard',
    `
      <header class="screen-heading">
        <div>
          <h1>Team Dashboard</h1>
          <p>Monitor sprint health, board progress, blocker age, defects, standup flow, and story-point readiness from one Jira-backed workspace.</p>
        </div>
        <div class="toolbar"><span>Overview</span><span>By Assignee</span><span>Blockers</span><span>Pipeline</span><span>Releases</span></div>
      </header>
      ${createMetricCards([
        ['Goal confidence', '86%', 'Sprint 24.6 is trending green'],
        ['Blocked stories', '4', 'Two are older than 48 hours'],
        ['Open defects', '7', 'One production severity item'],
        ['Carryover risk', 'Medium', 'Capacity model says watch QA'],
      ])}
      <div class="two-column">
        <section class="panel">
          <h2>Priority Jira work</h2>
          ${createDataTable(
            ['Key', 'Summary', 'Owner', 'Status'],
            [
              ['BEN-1421', 'Eligibility rule sync', 'A. Rivera', 'In Review'],
              ['BEN-1440', 'Enrollment retry audit', 'M. Chen', 'Blocked'],
              ['BEN-1452', 'API latency dashboard', 'J. Patel', 'Ready QA'],
              ['BEN-1468', 'Evidence export polish', 'S. Moore', 'In Dev'],
            ],
          )}
        </section>
        <section class="panel">
          <h2>Team load</h2>
          ${[
            ['Backend', 72],
            ['Frontend', 64],
            ['QA', 58],
            ['DevOps', 41],
          ].map(([label, value]) => `<p><strong>${escapeHtml(label)}</strong><span style="float:right">${value}%</span></p><div class="progress-track"><span style="width:${value}%"></span></div>`).join('')}
        </section>
      </div>
    `,
    {
      appSlug: 'nodetoolbox',
      sidebarTitle: 'NodeToolbox',
      activeNav: 'Team Dashboard',
      navigationItems: ['Home', 'Team Dashboard', 'My Issues', 'SNow Hub', 'Reports'],
    },
  );
  return createSourceScreenDocument('NodeToolbox sprint dashboard', '#1cc88a', bodyMarkup);
}

function createNodeToolboxOperationsScreen() {
  const bodyMarkup = createWindowChrome(
    'NodeToolbox - SNow Hub and ART View',
    `
      <header class="screen-heading">
        <div>
          <h1>SNow Hub + ART operating view</h1>
          <p>ServiceNow change work and release-train signals are pulled into a workflow surface that makes cross-program hygiene visible.</p>
        </div>
        <div class="pill-row"><span class="pill">PI confidence 4.6/5</span><span class="pill">7 change windows</span><span class="pill">2 Sev-2 incidents</span></div>
      </header>
      <div class="two-column">
        <section class="panel">
          <h2>Operational queue</h2>
          ${createBoardColumns([
            ['Triage', ['INC-4021 Enrollment timeout', 'INC-4035 Batch warning', 'PRB-118 Missing validation note']],
            ['In progress', ['CHG-1182 Policy sync', 'TASK-552 Data cleanup', 'STORY-772 CAB evidence']],
            ['Ready for CAB', ['CHG-1201 Release approval', 'CHG-1205 Weekend deployment']],
          ])}
        </section>
        <section class="panel">
          <h2>Release train radar</h2>
          ${createMetricCards([
            ['Teams green', '8/10', 'Two teams need dependency help'],
            ['Objectives met', '91%', 'Based on committed PI goals'],
            ['Aging risks', '5', 'Escalation list is visible'],
            ['Release risk', 'Low', 'CAB evidence is complete'],
          ])}
        </section>
      </div>
    `,
    {
      appSlug: 'nodetoolbox',
      sidebarTitle: 'NodeToolbox',
      activeNav: 'SNow Hub',
      navigationItems: ['Home', 'Team Dashboard', 'My Issues', 'SNow Hub', 'Reports'],
    },
  );
  return createSourceScreenDocument('NodeToolbox ServiceNow ART workflow', '#1cc88a', bodyMarkup);
}

function createEztestOnboardingScreen() {
  const bodyMarkup = createWindowChrome(
    'EZTest - Guided onboarding',
    `
      <header class="screen-heading">
        <div>
          <h1>Connect a project and generate useful tests</h1>
          <p>The first-run wizard explains each decision in plain language: project folder, detected framework, provider, and local app URL.</p>
        </div>
        <div class="pill-row"><span class="pill">React + Vite</span><span class="pill">Playwright detected</span><span class="pill">Local provider</span></div>
      </header>
      <section class="panel">
        <div class="wizard-steps">
          <div class="wizard-step active"><strong>1. Project folder</strong><br />C:\\Repos\\sample-checkout</div>
          <div class="wizard-step active"><strong>2. Framework</strong><br />React + Vite detected</div>
          <div class="wizard-step"><strong>3. Provider</strong><br />Local demo model</div>
          <div class="wizard-step"><strong>4. Ready</strong><br />Generate a test plan</div>
        </div>
      </section>
      <div class="two-column" style="margin-top:18px;">
        <section class="panel">
          <h2>Detected project details</h2>
          ${['Project folder|C:\\Repos\\sample-checkout', 'Framework|React + Vite', 'Test runner|Playwright', 'Target URL|http://localhost:5173'].map((row) => {
            const [label, value] = row.split('|');
            return `<div class="form-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
          }).join('')}
        </section>
        <section class="panel">
          <h2>Plain-language guidance</h2>
          <div class="feature-tile"><strong>What EZTest will do</strong><p>Scan visible behavior, map interaction paths, and generate focused specs for the selected app.</p></div>
          <div class="feature-tile"><strong>What stays local</strong><p>Project paths and provider settings are demo values; no customer repository or API key appears.</p></div>
        </section>
      </div>
    `,
    {
      appSlug: 'eztest',
      sidebarTitle: 'EZTest',
      activeNav: 'Setup',
      navigationItems: ['Setup', 'Dashboard', 'Generate', 'Record', 'Reports'],
    },
  );
  return createSourceScreenDocument('EZTest onboarding', '#a66bff', bodyMarkup);
}

function createEztestDashboardScreen() {
  const bodyMarkup = createWindowChrome(
    'EZTest - Project dashboard',
    `
      <header class="screen-heading">
        <div>
          <h1>Sample React Checkout</h1>
          <p>Testing work is framed as product outcomes: generate, record, fix, run, configure MCP, and manage provider settings from one action grid.</p>
        </div>
        <div class="pill-row"><span class="pill">12 behaviors mapped</span><span class="pill">8 existing specs</span><span class="pill">Last run 2 min ago</span></div>
      </header>
      ${createMetricCards([
        ['Behaviors', '12', 'Mapped from app routes'],
        ['Specs', '8', 'Existing Playwright coverage'],
        ['Flaky tests', '1', 'One selector repair suggested'],
        ['Coverage', '74%', 'Behavior-level confidence'],
      ])}
      <section class="panel">
        <div class="three-column">
          ${[
            ['Generate Tests', 'Create specs from discovered behavior and selected target flows.'],
            ['Record Flow', 'Capture a browser journey and convert it into maintainable test code.'],
            ['Fix Failures', 'Turn failing traces into repair tasks with exact file context.'],
            ['Run Suite', 'Execute tests and open the report without leaving the wizard.'],
            ['MCP Setup', 'Connect automation tools and browser control safely.'],
            ['API Settings', 'Manage local provider configuration and model choices.'],
          ].map(([title, text]) => `<div class="feature-tile"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p></div>`).join('')}
        </div>
      </section>
    `,
    {
      appSlug: 'eztest',
      sidebarTitle: 'EZTest',
      activeNav: 'Dashboard',
      navigationItems: ['Setup', 'Dashboard', 'Generate', 'Record', 'Reports'],
    },
  );
  return createSourceScreenDocument('EZTest dashboard actions', '#a66bff', bodyMarkup);
}

function createEztestRunModalScreen() {
  const bodyMarkup = createWindowChrome(
    'EZTest - Run feedback',
    `
      <header class="screen-heading">
        <div>
          <h1>Live generation run with next actions</h1>
          <p>The modal gives non-experts understandable progress, generated files, completion state, and the next button to open evidence.</p>
        </div>
        <div class="pill-row"><span class="pill">3 specs generated</span><span class="pill">0 secrets</span><span class="pill">Report ready</span></div>
      </header>
      <div class="panel" style="max-width:1080px;margin:0 auto;">
        <div class="dialog-card" style="padding:22px;background:#050912;">
          <h2>Generate Playwright tests</h2>
          ${createTerminalBlock([
            '[10:42:01] Analyzing interaction graph for Sample React Checkout...',
            '[10:42:06] Mapped 8 components with event coverage.',
            '[10:42:11] Created tests/sign-in.spec.ts',
            '[10:42:15] Created tests/cart-checkout.spec.ts',
            '[10:42:20] Created tests/profile-update.spec.ts',
            '[10:42:24] Generation complete - 3 tests ready for review.',
          ])}
          <div class="toolbar" style="margin-top:18px;"><span>Open HTML report</span><span>Review generated specs</span><span>Run changed tests only</span><span>Create fix task</span></div>
        </div>
      </div>
    `,
    {
      appSlug: 'eztest',
      sidebarTitle: 'EZTest',
      activeNav: 'Reports',
      navigationItems: ['Setup', 'Dashboard', 'Generate', 'Record', 'Reports'],
    },
  );
  return createSourceScreenDocument('EZTest run modal', '#a66bff', bodyMarkup);
}

function createQuiKeysUnlockScreen() {
  const bodyMarkup = `
    <div class="desktop-frame quikeys">
      <div class="native-window" style="width:620px;margin-top:120px;">
        <div class="native-title">QuiKeys - Unlock encrypted vault</div>
        <div class="native-body">
          <h1 style="margin:0 0 8px;">Unlock QuiKeys</h1>
          <p style="margin:0 0 18px;color:#4b5563;">Local encrypted macro vault. No cloud account is required.</p>
          <label>Master password</label>
          <input class="native-input" value="••••••••••••" />
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px;">
            <div><label>Vault location</label><div class="native-input">%TEMP%\\portfolio-demo.vault</div></div>
            <div><label>Encryption</label><div class="native-input">AES-256 local vault</div></div>
          </div>
          <div class="native-buttons"><button class="native-button">Cancel</button><button class="native-button primary">Unlock</button></div>
        </div>
      </div>
    </div>
  `;
  return createSourceScreenDocument('QuiKeys unlock', '#ff5fa2', bodyMarkup);
}

function createQuiKeysManagerScreen() {
  const bodyMarkup = `
    <div class="desktop-frame quikeys">
      <div class="native-window" style="width:1160px;margin-top:46px;">
        <div class="native-title">QuiKeys - Macro Manager</div>
        <div class="native-body">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <div><h1 style="margin:0;">Macro Manager</h1><p style="margin:4px 0 0;color:#4b5563;">Operational shortcuts, guarded secrets, hotkeys, and text triggers.</p></div>
            <div class="native-buttons" style="margin:0;"><button class="native-button primary">Add Macro</button><button class="native-button">Edit</button><button class="native-button">Lock Vault</button></div>
          </div>
          ${createDataTable(
            ['Name', 'Hotkey', 'Trigger', 'Category', 'Value', 'Enabled'],
            [
              ['Git Push Origin', 'Ctrl+Shift+G', ':push:', 'Development', 'git push origin main --follow-tags', 'Yes'],
              ['Deploy to Staging', 'Ctrl+Shift+D', ':deploy:', 'DevOps', 'npm run deploy:staging', 'Yes'],
              ['API Token (demo)', 'Ctrl+Shift+T', ':token:', 'Credentials', '••••••••••••••••••••••', 'Yes'],
              ['Daily Standup', 'Ctrl+Shift+S', ':standup:', 'Communication', 'Yesterday / Today / Blockers template', 'Yes'],
              ['SSH Demo Server', 'Ctrl+Shift+H', ':ssh:', 'Infrastructure', 'ssh demo@192.0.2.42', 'No'],
              ['Docker Compose Up', 'Ctrl+Shift+U', ':docker:', 'DevOps', 'docker compose up --build -d', 'Yes'],
            ],
            'native-table',
          )}
        </div>
      </div>
    </div>
  `;
  return createSourceScreenDocument('QuiKeys manager', '#ff5fa2', bodyMarkup);
}

function createQuiKeysDialogScreen() {
  const bodyMarkup = `
    <div class="desktop-frame quikeys">
      <div class="native-window" style="width:720px;margin-top:70px;">
        <div class="native-title">QuiKeys - Add Macro</div>
        <div class="native-body">
          <h1 style="margin:0 0 14px;">Add automation rule</h1>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
            <div><label>Name</label><input class="native-input" value="Build and Test" /></div>
            <div><label>Category</label><select class="native-select"><option>Development</option></select></div>
            <div><label>Hotkey</label><input class="native-input" value="Ctrl+Shift+B" /></div>
            <div><label>Text trigger</label><input class="native-input" value=":build:" /></div>
          </div>
          <div style="margin-top:14px;"><label>Text or command typed by the macro</label><textarea class="native-textarea">npm run build && npm test</textarea></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px;">
            <div><label>Mask value in manager table</label><div class="native-input">No - command is safe to display</div></div>
            <div><label>Enabled</label><div class="native-input">Yes - available after save</div></div>
          </div>
          <div class="native-buttons"><button class="native-button">Cancel</button><button class="native-button primary">Save Macro</button></div>
        </div>
      </div>
    </div>
  `;
  return createSourceScreenDocument('QuiKeys add macro', '#ff5fa2', bodyMarkup);
}

async function copyMbl2pcCapture(portfolioApp, portfolioFeature, outputPath) {
  const sourceFileName = MBL2PC_ASSET_SOURCES.get(portfolioFeature.id);

  if (!sourceFileName) {
    throw new Error(`No MBL2PC source screenshot mapping exists for ${portfolioFeature.id}.`);
  }

  const sourcePath = path.join(MBL2PC_CAPTURE_DIRECTORY, sourceFileName);
  await fs.access(sourcePath);
  await fs.copyFile(sourcePath, outputPath);
}

async function renderSourceDerivedReplica(browser, portfolioApp, portfolioFeature, outputPath) {
  const screenKey = `${portfolioApp.slug}:${portfolioFeature.id}`;
  const screenBuilder = SOURCE_DERIVED_SCREEN_BUILDERS[screenKey];

  if (!screenBuilder) {
    throw new Error(`No source-derived screen builder exists for ${screenKey}.`);
  }

  const captureTarget = getCaptureTarget(portfolioApp, portfolioFeature);
  const page = await browser.newPage({
    viewport: {
      width: captureTarget.viewportWidth ?? DESKTOP_SCREEN_WIDTH,
      height: captureTarget.viewportHeight ?? DESKTOP_SCREEN_HEIGHT,
    },
    deviceScaleFactor: 1,
  });

  await page.setContent(screenBuilder(), { waitUntil: 'networkidle' });
  await page.screenshot({ path: outputPath, type: 'png' });
  await page.close();
}

async function buildPngAssets() {
  const browser = await createBrowser();

  try {
    await fs.rm(GENERATED_SVG_DIRECTORY, { recursive: true, force: true });

    for (const portfolioApp of PORTFOLIO_APP_DEFINITIONS) {
      const appAssetDirectory = path.join(PORTFOLIO_ASSET_DIRECTORY, portfolioApp.slug);
      await fs.mkdir(appAssetDirectory, { recursive: true });

      for (const portfolioFeature of portfolioApp.features) {
        const outputPath = path.join(
          appAssetDirectory,
          `${portfolioApp.slug}-${portfolioFeature.id}.png`,
        );

        if (portfolioFeature.imageKind === 'real-ui') {
          await copyMbl2pcCapture(portfolioApp, portfolioFeature, outputPath);
        } else {
          await renderSourceDerivedReplica(browser, portfolioApp, portfolioFeature, outputPath);
        }
      }
    }
  } finally {
    await browser.close();
  }
}

async function writePortfolioData() {
  const standaloneData = `// Auto-generated by scripts/portfolio/build-portfolio-assets.mjs.\n\nexport const PORTFOLIO_APPS = ${JSON.stringify(PORTFOLIO_APP_DEFINITIONS, null, 2)};\n`;

  await fs.mkdir(PORTFOLIO_DATA_DIRECTORY, { recursive: true });
  await fs.writeFile(PORTFOLIO_DATA_FILE_PATH, standaloneData, 'utf8');
}

async function main() {
  await buildPngAssets();
  await writePortfolioData();
}

await main();
