// Reusable chrome for the Forge Terminal portfolio screens.
//
// Every Forge Terminal screen shares the same frame: a tab strip across the
// top, the terminal surface on the left, the four-tab side rail on the right,
// and the Spec-Driven Development phase bar pinned along the bottom. This file
// owns that frame and its styling so the individual screens only describe the
// panel that makes them different.

import {
  DEMO_ACTIVE_REPOSITORY,
  DEMO_BACKGROUND_REPOSITORY,
  DEMO_UPDATE_BANNER,
  DEMO_WORKFLOW_PHASES,
} from './forge-terminal-demo-data.mjs';

// The four rail destinations in the shipped product, in on-screen order.
const RAIL_TAB_ICONS = [
  { id: 'commands', glyph: '⌘' },
  { id: 'files', glyph: '🗂' },
  { id: 'mcp', glyph: '🔌' },
  { id: 'tools', glyph: '🔧' },
];

// The row of quick-action buttons that sits under every rail heading.
const RAIL_QUICK_ACTION_GLYPHS = ['🏷', '🧭', '🕘', '▥', '💬', '⬇', '⏻'];

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const FORGE_SCREEN_STYLESHEET = `
  :root {
    --bg: #0b0b0f; --panel: #101016; --raised: #16161d; --line: #24242e;
    --cyan: #22d3ee; --indigo: #6366f1; --orange: #f97316; --green: #22c55e;
    --amber: #f59e0b; --text: #e8e8ef; --dim: #8b8b99; --faint: #5f5f6d;
    --mono: "Cascadia Mono", Consolas, "Courier New", monospace;
    --ui: "Segoe UI", Inter, Arial, sans-serif;
  }
  * { box-sizing: border-box; }
  body { margin: 0; width: 100vw; height: 100vh; overflow: hidden; background: var(--bg);
    color: var(--text); font-family: var(--ui); -webkit-font-smoothing: antialiased; }

  .app { display: flex; flex-direction: column; height: 100vh; }
  .tabstrip { display: flex; align-items: center; gap: 6px; height: 34px; padding: 0 10px;
    background: #131318; border-bottom: 1px solid var(--line); flex: 0 0 auto; }
  .tab { display: flex; align-items: center; gap: 7px; height: 24px; padding: 0 12px;
    border-radius: 5px; background: #1a1a21; color: var(--dim); font-size: 11.5px; }
  .tab.active { background: #10262b; color: var(--cyan); box-shadow: inset 0 1px 0 var(--cyan); }
  .tabstrip .spacer { flex: 1; }
  .tabstrip .strip-icon { color: var(--faint); font-size: 12px; padding: 0 4px; }

  .body { display: flex; flex: 1; min-height: 0; }
  .terminal { flex: 1; min-width: 0; display: flex; flex-direction: column;
    background: #08080b; padding: 0 0 0 10px; }
  .replayed-line { background: #1b1b22; color: #55555f; font-family: var(--mono);
    font-size: 13.5px; padding: 3px 10px; white-space: nowrap; overflow: hidden; }
  .scrollback { flex: 1; min-height: 0; overflow: hidden; padding: 6px 12px 0 2px;
    font-family: var(--mono); font-size: 14px; line-height: 1.52;
    display: flex; flex-direction: column; justify-content: flex-end; }
  .scrollback .line { white-space: pre; }
  .line.heading { color: #f4f4f8; font-weight: 600; }
  .line.dim { color: #9aa3b2; }
  .line.box { color: #cdd6e4; }
  .line.pass { color: var(--green); }
  .line.wait { color: var(--amber); }
  .line.echo { color: #cfd6e2; }

  .update-banner { text-align: center; color: var(--faint); font-family: var(--mono);
    font-size: 12.5px; padding: 4px 0; }
  .update-banner b { color: var(--cyan); font-weight: 500; }
  .prompt-area { border-top: 1px solid #1e1e26; padding: 8px 12px 6px 2px;
    font-family: var(--mono); font-size: 14px; color: #e6e6ee; }
  .mode-line { color: var(--orange); font-family: var(--mono); font-size: 13px;
    padding: 4px 0 8px 2px; }
  .mode-line span { color: var(--faint); }

  .rail { flex: 0 0 330px; background: var(--panel); border-left: 1px solid var(--line);
    display: flex; flex-direction: column; min-height: 0; }
  .rail-tabs { display: flex; border-bottom: 1px solid var(--line); }
  .rail-tabs div { flex: 1; text-align: center; padding: 8px 0; font-size: 13px;
    color: var(--faint); }
  .rail-tabs div.active { color: var(--cyan); box-shadow: inset 0 -2px 0 var(--cyan); }
  .rail-scroll { flex: 1; min-height: 0; overflow: hidden; padding: 10px 12px 14px; }
  .rail-head { display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 10px; }
  .rail-head h2 { margin: 0; font-size: 14px; font-weight: 650; color: #f2f2f7;
    display: flex; align-items: center; gap: 6px; }
  .rail-head .head-note { color: var(--faint); font-size: 10.5px; }
  .quick-actions { display: flex; gap: 5px; margin-bottom: 9px; }
  .quick-actions span { flex: 1; height: 23px; border-radius: 6px; background: var(--cyan);
    display: flex; align-items: center; justify-content: center; font-size: 11px;
    color: #04222a; }
  .font-row { display: flex; align-items: center; gap: 7px; margin-bottom: 12px; }
  .font-row .shell-label { color: var(--dim); font-size: 11px; font-family: var(--mono); }
  .font-row .stepper { flex: 1; display: flex; align-items: center; justify-content: space-between;
    background: var(--orange); border-radius: 6px; padding: 3px 9px; color: #2a1003;
    font-size: 11.5px; font-weight: 650; }
  .font-row .gear { width: 27px; height: 23px; border-radius: 6px; background: var(--cyan);
    display: flex; align-items: center; justify-content: center; font-size: 11px; }

  .card { background: var(--raised); border: 1px solid var(--line); border-radius: 9px;
    padding: 10px; margin-bottom: 9px; }
  .card-title { display: flex; align-items: center; justify-content: space-between;
    font-size: 11.5px; font-weight: 650; color: #eaeaf2; }
  .card-sub { color: var(--faint); font-size: 9.5px; margin-top: 2px; }
  .card-body { color: #b6b6c6; font-size: 10px; line-height: 1.5; margin-top: 7px; }
  .section-label { color: var(--faint); font-size: 9px; font-weight: 700;
    letter-spacing: .09em; text-transform: uppercase; margin: 12px 0 6px; }
  .badge { border-radius: 999px; font-size: 8.5px; font-weight: 700; padding: 2px 7px; }
  .badge.green { background: rgba(34,197,94,.16); color: var(--green); }
  .badge.grey { background: #23232c; color: var(--dim); }
  .badge.amber { color: var(--amber); background: rgba(245,158,11,.14); }
  .callout { border-left: 2px solid var(--cyan); background: #12121a; border-radius: 0 7px 7px 0;
    padding: 8px 9px; margin-bottom: 8px; font-size: 9.5px; line-height: 1.5; color: #a8a8ba; }
  .callout b { color: #dcdce8; display: block; margin-bottom: 3px; font-size: 10px; }
  .callout.amber { border-left-color: var(--amber); }

  .phase-bar { flex: 0 0 auto; border-top: 1px solid var(--line); background: #0d0d12; }
  .phase-strip { position: relative; display: flex; align-items: center;
    justify-content: center; height: 13px; }
  .phase-strip .idle-chip { background: #1c1c24; color: var(--faint); font-size: 8px;
    letter-spacing: .16em; padding: 1px 12px; border-radius: 3px; }
  .phase-strip .isolate { position: absolute; right: 10px; color: var(--cyan);
    font-size: 9.5px; border: 1px solid #1f3f47; border-radius: 4px; padding: 1px 7px; }
  .phases { display: flex; }
  .phases div { flex: 1; text-align: center; padding: 3px 0 5px; border-right: 1px solid #191921; }
  .phases div:last-child { border-right: 0; }
  .phases .name { font-size: 9.5px; color: #9a9aa8; }
  .phases .state { font-size: 7.5px; color: var(--faint); margin-top: 1px; }
  .phases div.done .name { color: #cfd6e2; }
  .phases div.done .state { color: var(--green); }
  .phases div.active .name { color: var(--cyan); font-weight: 650; }
  .phases div.active .state { color: var(--cyan); }
  .hint { font-family: var(--mono); font-size: 9.5px; color: var(--faint);
    padding: 1px 0 2px 8px; border-top: 1px solid #17171e; }
`;

/** Wraps screen markup in the standalone document Playwright screenshots. */
export function createForgeDocument(documentTitle, bodyMarkup) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(documentTitle)}</title>
    <style>${FORGE_SCREEN_STYLESHEET}</style>
  </head>
  <body>${bodyMarkup}</body>
</html>`;
}

function createTabStrip() {
  return `
    <div class="tabstrip">
      <div class="tab">&gt;_ ${escapeHtml(DEMO_BACKGROUND_REPOSITORY)}</div>
      <div class="tab active">&gt;_ ${escapeHtml(DEMO_ACTIVE_REPOSITORY)} ✕</div>
      <div class="spacer"></div>
      <span class="strip-icon">📊</span><span class="strip-icon">⚡</span>
      <span class="strip-icon">🔒</span><span class="strip-icon">＋</span>
    </div>`;
}

/** Renders the rail's four-destination tab bar with one destination selected. */
export function createRailTabs(activeRailTabId) {
  const tabsMarkup = RAIL_TAB_ICONS.map((railTab) => {
    const activeClassName = railTab.id === activeRailTabId ? ' class="active"' : '';
    return `<div${activeClassName}>${railTab.glyph}</div>`;
  }).join('');

  return `<div class="rail-tabs">${tabsMarkup}</div>`;
}

/** Renders the quick-action button row and shell/font controls shared by all rails. */
export function createRailControls() {
  const quickActionsMarkup = RAIL_QUICK_ACTION_GLYPHS
    .map((glyph) => `<span>${glyph}</span>`)
    .join('');

  return `
    <div class="quick-actions">${quickActionsMarkup}</div>
    <div class="font-row">
      <span class="shell-label">&gt;_ PS</span>
      <span class="stepper"><span>−</span><span>27px</span><span>＋</span></span>
      <span class="gear">⚙</span>
    </div>`;
}

function createPhaseBar() {
  const phasesMarkup = DEMO_WORKFLOW_PHASES.map((workflowPhase) => {
    const stateClassName = workflowPhase.state.toLowerCase();
    return `<div class="${stateClassName}">
      <div class="name">${escapeHtml(workflowPhase.label)}</div>
      <div class="state">${escapeHtml(workflowPhase.state)}</div>
    </div>`;
  }).join('');

  return `
    <div class="phase-bar">
      <div class="phase-strip">
        <span class="idle-chip">IDLE</span>
        <span class="isolate">⌄ Isolate this tab</span>
      </div>
      <div class="phases">${phasesMarkup}</div>
      <div class="hint">Run /speckit-plan to continue.</div>
    </div>`;
}

/** Renders the updater banner that the shipped UI pins above the prompt. */
export function createUpdateBanner() {
  const { currentVersion, availableVersion, message } = DEMO_UPDATE_BANNER;

  return `<div class="update-banner">globalVersion: ${escapeHtml(currentVersion)} ·
    latestVersion: ${escapeHtml(availableVersion)} <b>✓ ${escapeHtml(message)}</b></div>`;
}

/**
 * Assembles a complete Forge Terminal screen from the terminal content on the
 * left and whichever rail panel the screen is meant to showcase on the right.
 */
export function createForgeShell(terminalMarkup, railMarkup) {
  return `
    <div class="app">
      ${createTabStrip()}
      <div class="body">
        <div class="terminal">${terminalMarkup}</div>
        <div class="rail">${railMarkup}</div>
      </div>
      ${createPhaseBar()}
    </div>`;
}
