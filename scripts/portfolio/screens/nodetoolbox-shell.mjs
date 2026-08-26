// Reusable chrome for the NodeToolbox portfolio screens.
//
// Every NodeToolbox surface sits inside the same frame: a workspace pill nav
// across the top, a page title, and — on the team surfaces — a program-increment
// selector above a long tab strip. This file owns that frame and the shared
// styling so each screen only describes the panel that makes it different.

import { DEMO_PROGRAM_INCREMENT, DEMO_TEAM_NAME } from './nodetoolbox-demo-data.mjs';

// The four workspaces in the shipped product's top-level navigation.
const WORKSPACE_TABS = [
  { label: 'Team', glyph: '🧍' },
  { label: 'Product', glyph: '🎯' },
  { label: 'Train', glyph: '🚂' },
  { label: 'Search', glyph: '🔍' },
];

// The team dashboard's full tab strip, in shipped order.
export const TEAM_DASHBOARD_TABS = [
  'Overview', 'By Assignee', 'Blockers', 'Defects', 'Standup', 'Hygiene', 'Metrics',
  'Planning', 'Pointing', 'Feature Review', 'PI Review', 'Remediation', 'Roll-Up Board',
  'Forecast', 'Releases', 'Settings',
];

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const NODETOOLBOX_STYLESHEET = `
  :root {
    --bg: #0b0f17; --panel: #161c28; --panel-2: #1b2331; --raised: #212b3b;
    --line: #2b3646; --line-soft: #222c3a;
    --text: #e6ebf3; --muted: #9aa7bd; --faint: #667488;
    --blue: #4a9eff; --green: #3fb950; --red: #f85149; --amber: #d29922;
    --violet: #a371f7; --teal: #39c5cf;
    --ui: "Segoe UI", Inter, system-ui, Arial, sans-serif;
    --mono: "Cascadia Mono", Consolas, monospace;
  }
  * { box-sizing: border-box; }
  body { margin: 0; width: 100vw; overflow-x: hidden;
    background: var(--bg); color: var(--text); font-family: var(--ui); font-size: 13px; }

  .workspace-nav { display: flex; gap: 7px; padding: 7px 12px;
    border-bottom: 1px solid var(--blue); background: #0d121c; }
  .workspace-nav span { display: flex; align-items: center; gap: 5px; padding: 4px 13px;
    border-radius: 999px; font-size: 11.5px; color: var(--muted); background: #171e2b; }
  .workspace-nav span.active { background: var(--blue); color: #06121f; font-weight: 650; }

  .page { padding: 14px 16px 18px; }
  .page-title { margin: 0 0 3px; font-size: 15.5px; font-weight: 650; }
  .page-subtitle { margin: 0 0 14px; color: var(--muted); font-size: 12px; }

  .pi-bar { display: flex; gap: 26px; padding: 10px 13px; margin-bottom: 12px;
    background: var(--panel); border: 1px solid var(--line); border-radius: 7px; }
  .pi-bar .field-label { display: block; color: var(--faint); font-size: 9.5px;
    letter-spacing: .05em; margin-bottom: 4px; }
  .pi-bar .field-value { background: #0e131d; border: 1px solid var(--line);
    border-radius: 5px; padding: 5px 11px; font-size: 12px; }

  .tab-strip { display: flex; flex-wrap: wrap; gap: 3px; padding: 6px 8px; margin-bottom: 12px;
    background: var(--panel); border: 1px solid var(--line); border-radius: 999px; }
  .tab-strip span { padding: 4px 11px; border-radius: 999px; font-size: 11.5px;
    color: var(--muted); }
  .tab-strip span.active { background: #1f3a5c; color: #cfe4ff; }

  .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 9px; }
  .toolbar button, .btn { background: var(--panel-2); border: 1px solid var(--line);
    border-radius: 5px; padding: 4px 10px; color: var(--text); font-size: 11px;
    font-family: inherit; }
  .btn-primary { background: var(--blue); border-color: var(--blue); color: #06121f;
    font-weight: 650; }
  .toolbar .scope-note { color: var(--faint); font-size: 11px; margin-left: 6px; }

  .notice-bar { display: flex; align-items: center; justify-content: space-between;
    padding: 6px 11px; margin-bottom: 10px; border-radius: 5px; font-size: 11px;
    background: rgba(210,153,34,.09); border: 1px solid rgba(210,153,34,.3); color: #e5c07b; }

  .chip { display: inline-block; border-radius: 999px; padding: 1px 8px; font-size: 10px;
    line-height: 1.55; }
  .chip-blue { background: rgba(74,158,255,.15); color: #8fc4ff; }
  .chip-green { background: rgba(63,185,80,.15); color: #7ee787; }
  .chip-red { background: rgba(248,81,73,.15); color: #ff9d97; }
  .chip-amber { background: rgba(210,153,34,.15); color: #e5c07b; }
  .chip-violet { background: rgba(163,113,247,.16); color: #d2b4ff; }
  .chip-grey { background: #263141; color: var(--muted); }

  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 7px; }
  .muted { color: var(--muted); }
  .faint { color: var(--faint); }
`;

/** Wraps screen markup in the standalone document Playwright screenshots. */
export function createNodeToolboxDocument(documentTitle, bodyMarkup, extraStyles = '') {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(documentTitle)}</title>
    <style>${NODETOOLBOX_STYLESHEET}${extraStyles}</style>
  </head>
  <body>${bodyMarkup}</body>
</html>`;
}

/** Renders the workspace pill nav with one workspace selected. */
export function createWorkspaceNav(activeWorkspaceLabel) {
  const tabsMarkup = WORKSPACE_TABS.map((workspaceTab) => {
    const activeClassName = workspaceTab.label === activeWorkspaceLabel ? ' class="active"' : '';
    return `<span${activeClassName}>${workspaceTab.glyph} ${escapeHtml(workspaceTab.label)}</span>`;
  }).join('');

  return `<div class="workspace-nav">${tabsMarkup}</div>`;
}

/** Renders the program-increment selector shown above the team tab strip. */
export function createProgramIncrementBar() {
  return `
    <div class="pi-bar">
      <div>
        <span class="field-label">DASHBOARD TEAM</span>
        <span class="field-value">${escapeHtml(DEMO_TEAM_NAME)}</span>
      </div>
      <div>
        <span class="field-label">VIEW WORK BY</span>
        <span class="field-value">Sprint</span>
      </div>
      <div>
        <span class="field-label">PI</span>
        <span class="field-value">${escapeHtml(DEMO_PROGRAM_INCREMENT)}</span>
      </div>
    </div>`;
}

/** Renders a tab strip with one tab selected. */
export function createTabStrip(tabLabels, activeTabLabel) {
  const tabsMarkup = tabLabels.map((tabLabel) => {
    const activeClassName = tabLabel === activeTabLabel ? ' class="active"' : '';
    return `<span${activeClassName}>${escapeHtml(tabLabel)}</span>`;
  }).join('');

  return `<div class="tab-strip">${tabsMarkup}</div>`;
}

/** Renders the page heading every NodeToolbox surface carries. */
export function createPageHeading(title, subtitle) {
  return `
    <h1 class="page-title">${escapeHtml(title)}</h1>
    <p class="page-subtitle">${escapeHtml(subtitle)}</p>`;
}
