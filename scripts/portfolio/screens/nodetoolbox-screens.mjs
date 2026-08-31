// The five NodeToolbox portfolio screens, rebuilt from the shipped UI.
//
// Each builder returns a standalone HTML document that the portfolio capture
// runner screenshots into a PNG. The layouts mirror real product surfaces —
// the Roll-Up Board, the daily forecast, the hygiene workspace, cross-level
// search, and Feature composition — while every value on screen comes from the
// invented program in the demo-data module.
//
// The through-line these screens have to carry is the entry's whole claim: the
// tool reports what it cannot measure instead of rounding it to zero. The empty
// lane's note, the CANNOT FORECAST card, and the hygiene refusal are the three
// places that claim is visible, so none of them may be dropped for tidiness.

import {
  DEMO_BOARD_COLUMNS,
  DEMO_BOARD_NOTICE,
  DEMO_BOARD_SCOPE_LINE,
  DEMO_COMPOSITION_CHECKLIST,
  DEMO_COMPOSITION_DRAFT,
  DEMO_COMPOSITION_SOURCES,
  DEMO_COMPOSITION_TABS,
  DEMO_DOMAIN_COMPONENT_RULE,
  DEMO_EMPTY_LANE_NOTE,
  DEMO_FEATURE_LANES,
  DEMO_FORECAST_GROUPS,
  DEMO_FORECAST_SCAN_LINE,
  DEMO_FORECAST_STATS,
  DEMO_HYGIENE_BANDS,
  DEMO_HYGIENE_BULK_ACTION,
  DEMO_HYGIENE_CHECKS,
  DEMO_HYGIENE_FINDINGS,
  DEMO_HYGIENE_REFUSAL,
  DEMO_HYGIENE_SCORE,
  DEMO_READINESS_GUIDANCE,
  DEMO_SEARCH_KEYWORD,
  DEMO_SEARCH_LEVELS,
  DEMO_SEARCH_RESULT_LINE,
  DEMO_TEAM_PROJECT_KEY,
} from './nodetoolbox-demo-data.mjs';
import {
  TEAM_DASHBOARD_TABS,
  createNodeToolboxDocument,
  createPageHeading,
  createProgramIncrementBar,
  createTabStrip,
  createWorkspaceNav,
  escapeHtml,
} from './nodetoolbox-shell.mjs';

/** Assembles the team-dashboard frame every team surface shares. */
function createTeamSurface(activeTabLabel, panelMarkup) {
  return `
    ${createWorkspaceNav('Team')}
    <div class="page">
      ${createPageHeading('Team Dashboard', 'Monitor team health, board progress, and facilitate standup from one place.')}
      ${createProgramIncrementBar()}
      ${createTabStrip(TEAM_DASHBOARD_TABS, activeTabLabel)}
      ${panelMarkup}
    </div>`;
}

// ── Screen 1 — Roll-Up Board ────────────────────────────────────────────────

function createBoardColumnHeaders() {
  return DEMO_BOARD_COLUMNS.map((boardColumn) => `
    <div class="board-col${boardColumn.isUnmapped ? ' unmapped' : ''}">
      <div class="col-name">${escapeHtml(boardColumn.label)} <b>${boardColumn.count}</b></div>
      <div class="col-maps">${escapeHtml(boardColumn.mapsTo)}</div>
    </div>`).join('');
}

function createFeatureLaneMeta(featureLane) {
  const metaEntries = [
    ['STATUS', featureLane.status],
    ['ITEMS', featureLane.itemCount],
    ['POINTS', featureLane.points],
    ['PRIORITY', featureLane.priority],
    ['DEPENDENCIES', featureLane.dependencies],
  ];

  const metaMarkup = metaEntries
    .map(([metaLabel, metaValue]) => `<span class="meta"><i>${escapeHtml(metaLabel)}</i> ${escapeHtml(metaValue)}</span>`)
    .join('');

  const integrationMarkup = featureLane.integrationDate
    ? `<span class="meta"><i>INT BY</i> ${escapeHtml(featureLane.integrationDate)}</span>`
    : '';

  return `<div class="lane-meta">${metaMarkup}${integrationMarkup}</div>`;
}

function createFeatureLane(featureLane, laneIndex) {
  const laneHeader = `
    <div class="lane-head">
      <span class="lane-index">${laneIndex + 1}</span>
      <span class="lane-key">${escapeHtml(featureLane.key)}</span>
      <span class="lane-summary">${escapeHtml(featureLane.summary)}</span>
    </div>`;

  if (featureLane.isEmpty) {
    return `
      <div class="lane">
        ${laneHeader}
        <div class="lane-empty-meta">
          <span class="faint">no work to measure yet</span>
          ${createFeatureLaneMeta(featureLane)}
        </div>
        <div class="lane-note">${escapeHtml(DEMO_EMPTY_LANE_NOTE)}</div>
        <div class="lane-cells">${DEMO_BOARD_COLUMNS.map(() => '<div class="cell"></div>').join('')}</div>
      </div>`;
  }

  const verdictClassName = featureLane.isBehind ? 'chip-red' : 'chip-green';

  return `
    <div class="lane">
      ${laneHeader}
      <div class="lane-body">
        <div class="lane-bars">
          <div class="bar-track"><span class="bar-dev" style="width:${featureLane.devPercent}%"></span></div>
          <div class="bar-label"><b>Dev ${featureLane.devPercent}%</b> ${escapeHtml(featureLane.devBasis)}</div>
          <div class="bar-track"><span class="bar-whole" style="width:${featureLane.wholePercent}%"></span></div>
          <div class="bar-label"><b>Whole Feature ${featureLane.wholePercent}%</b> ${escapeHtml(featureLane.wholeBasis)}</div>
        </div>
        <div class="lane-verdict">
          <span class="chip ${verdictClassName}">${escapeHtml(featureLane.verdict)}</span>
          <span class="faint">INT by ${escapeHtml(featureLane.integrationDate)}</span>
          <div class="faint breakdown">${escapeHtml(featureLane.breakdown)}</div>
        </div>
        ${createFeatureLaneMeta(featureLane)}
      </div>
    </div>`;
}

const ROLLUP_BOARD_STYLES = `
  .board-cols { display: flex; gap: 2px; margin-bottom: 7px; }
  .board-col { flex: 1; min-width: 0; background: var(--panel-2); border: 1px solid var(--line);
    border-radius: 4px; padding: 5px 6px; }
  .board-col.unmapped { border-color: var(--amber); }
  .board-col .col-name { font-size: 9px; font-weight: 700; letter-spacing: .03em;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .board-col.unmapped .col-name { color: var(--amber); }
  .board-col .col-maps { font-size: 8px; color: var(--faint); margin-top: 2px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lane { background: var(--panel); border: 1px solid var(--line); border-radius: 6px;
    padding: 7px 9px; margin-bottom: 6px; }
  .lane-head { display: flex; align-items: baseline; gap: 8px; }
  .lane-index { background: #263141; border-radius: 3px; padding: 0 6px; font-size: 9px;
    color: var(--muted); }
  .lane-key { color: var(--blue); font-size: 11.5px; font-weight: 650; }
  .lane-summary { font-size: 11px; color: var(--muted); overflow: hidden;
    white-space: nowrap; text-overflow: ellipsis; }
  .lane-empty-meta { display: flex; align-items: center; gap: 12px; margin-top: 5px;
    font-size: 9.5px; }
  .lane-note { margin-top: 5px; padding: 4px 8px; border-radius: 4px; font-size: 9.5px;
    font-style: italic; color: #b6c2d6; background: #1d2634; border-left: 2px solid var(--amber); }
  .lane-cells { display: flex; gap: 2px; margin-top: 6px; }
  .lane-cells .cell { flex: 1; height: 26px; border: 1px solid var(--line-soft);
    border-radius: 3px; }
  .lane-body { display: grid; grid-template-columns: minmax(0,1.5fr) minmax(0,1fr) auto;
    gap: 16px; align-items: center; margin-top: 6px; }
  .bar-track { height: 7px; border-radius: 999px; background: #222c3a; overflow: hidden;
    margin-bottom: 3px; }
  .bar-dev { display: block; height: 100%; background: var(--amber); }
  .bar-whole { display: block; height: 100%;
    background: linear-gradient(90deg, var(--red) 45%, var(--green) 45%); }
  .bar-label { font-size: 8.5px; color: var(--faint); margin-bottom: 5px; }
  .bar-label b { color: var(--muted); }
  .lane-verdict { font-size: 9.5px; display: flex; align-items: center; gap: 7px;
    flex-wrap: wrap; }
  .lane-verdict .breakdown { width: 100%; }
  .lane-meta { display: flex; flex-wrap: wrap; gap: 5px; justify-content: flex-end; }
  .lane-meta .meta { background: #1e2734; border-radius: 3px; padding: 1px 6px; font-size: 8.5px;
    color: var(--text); white-space: nowrap; }
  .lane-meta .meta i { color: var(--faint); font-style: normal; margin-right: 3px; }
`;

function createRollupBoardScreen() {
  const panelMarkup = `
    <div class="toolbar">
      <button>Refresh</button><button>Expand all</button><button>Collapse all</button>
      <button>Board setup</button><button>Why is an issue missing?</button>
      <button>Share this order</button><button>Reset order</button>
      <span class="scope-note">${escapeHtml(DEMO_BOARD_SCOPE_LINE)}</span>
    </div>
    <div class="notice-bar"><span>⚠ ${escapeHtml(DEMO_BOARD_NOTICE)}</span>
      <span><span class="btn">Show details</span></span></div>
    <div class="board-cols">${createBoardColumnHeaders()}</div>
    ${DEMO_FEATURE_LANES.map(createFeatureLane).join('')}`;

  return createNodeToolboxDocument(
    'NodeToolbox — Roll-Up Board',
    createTeamSurface('Roll-Up Board', panelMarkup),
    ROLLUP_BOARD_STYLES,
  );
}

// ── Screen 2 — Daily forecast ───────────────────────────────────────────────

function createForecastStatCards() {
  return DEMO_FORECAST_STATS.map((forecastStat) => `
    <div class="fc-stat fc-${forecastStat.tone}">
      <div class="fc-label">${escapeHtml(forecastStat.label)}</div>
      <div class="fc-value">${forecastStat.value}</div>
      <div class="fc-note">${escapeHtml(forecastStat.note)}</div>
    </div>`).join('');
}

function createForecastIssueRow(forecastIssue) {
  const chips = [
    `<span class="chip chip-blue">${escapeHtml(forecastIssue.team)}</span>`,
    `<span class="chip chip-violet">${escapeHtml(forecastIssue.owner)}</span>`,
  ];

  if (forecastIssue.startBy) {
    chips.push(`<span class="chip chip-green">Start by ${escapeHtml(forecastIssue.startBy)}</span>`);
  }
  if (forecastIssue.lateness) {
    chips.push(`<span class="chip chip-red">${escapeHtml(forecastIssue.lateness)}</span>`);
  }
  if (forecastIssue.slack) {
    chips.push(`<span class="chip chip-grey">${escapeHtml(forecastIssue.slack)}</span>`);
  }
  if (forecastIssue.jiraTargetStart) {
    chips.push(`<span class="chip chip-amber">Target Start in Jira: ${escapeHtml(forecastIssue.jiraTargetStart)}</span>`);
  }

  return `
    <div class="fc-row">
      <div class="fc-row-head">
        <span class="fc-key">${escapeHtml(forecastIssue.key)}</span>
        <span class="fc-summary">${escapeHtml(forecastIssue.summary)}</span>
      </div>
      <div class="fc-chips">${chips.join('')}</div>
      <div class="fc-reason">${escapeHtml(forecastIssue.reason)}</div>
    </div>`;
}

function createForecastGroups() {
  return DEMO_FORECAST_GROUPS.map((forecastGroup) => `
    <section class="fc-group fc-group-${forecastGroup.tone}">
      <header>
        <span class="fc-dot"></span>
        <h3>${escapeHtml(forecastGroup.title)}</h3>
        <span class="fc-count">${forecastGroup.count}</span>
      </header>
      ${forecastGroup.issues.map(createForecastIssueRow).join('')}
    </section>`).join('');
}

const FORECAST_STYLES = `
  .fc-head { display: flex; align-items: baseline; justify-content: space-between;
    margin-bottom: 9px; }
  .fc-head h2 { margin: 0; font-size: 13px; }
  .fc-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 9px; margin-bottom: 12px; }
  .fc-stat { border-radius: 7px; padding: 10px 13px; border: 1px solid var(--line); }
  .fc-label { font-size: 9px; font-weight: 700; letter-spacing: .1em; }
  .fc-value { font-size: 27px; font-weight: 650; line-height: 1.1; }
  .fc-note { font-size: 9.5px; color: var(--muted); }
  .fc-behind { background: rgba(248,81,73,.08); border-color: rgba(248,81,73,.35); }
  .fc-behind .fc-label, .fc-behind .fc-value { color: var(--red); }
  .fc-today { background: rgba(210,153,34,.08); border-color: rgba(210,153,34,.35); }
  .fc-today .fc-label, .fc-today .fc-value { color: var(--amber); }
  .fc-ontrack { background: rgba(63,185,80,.08); border-color: rgba(63,185,80,.35); }
  .fc-ontrack .fc-label, .fc-ontrack .fc-value { color: var(--green); }
  .fc-unknown { background: #1a212d; }
  .fc-unknown .fc-label, .fc-unknown .fc-value { color: var(--muted); }
  .fc-group { border: 1px solid var(--line); border-radius: 7px; padding: 9px 11px;
    margin-bottom: 8px; background: var(--panel); }
  .fc-group header { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
  .fc-group h3 { margin: 0; font-size: 11.5px; flex: 1; }
  .fc-count { background: #263141; border-radius: 3px; padding: 0 7px; font-size: 9.5px;
    color: var(--muted); }
  .fc-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
  .fc-group-behind { border-color: rgba(248,81,73,.32); }
  .fc-group-behind .fc-dot { background: var(--red); }
  .fc-group-passed { border-color: rgba(248,81,73,.45); background: rgba(248,81,73,.05); }
  .fc-group-passed .fc-dot { background: var(--red); }
  .fc-group-ontrack .fc-dot { background: var(--green); }
  .fc-group-unknown .fc-dot { background: var(--muted); }
  .fc-row { padding: 5px 0; border-top: 1px solid var(--line-soft); }
  .fc-row:first-of-type { border-top: 0; }
  .fc-row-head { display: flex; gap: 8px; align-items: baseline; }
  .fc-key { color: var(--blue); font-size: 10.5px; font-weight: 650; }
  .fc-summary { font-size: 10.5px; }
  .fc-chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0 3px; }
  .fc-reason { font-size: 9.5px; color: var(--faint); }
`;

function createDailyForecastScreen() {
  const panelMarkup = `
    <div class="card" style="padding:11px 13px;">
      <div class="fc-head">
        <h2>Daily forecast</h2>
        <span class="faint" style="font-size:10px;">${escapeHtml(DEMO_FORECAST_SCAN_LINE)}</span>
      </div>
      <div class="fc-stats">${createForecastStatCards()}</div>
      ${createForecastGroups()}
    </div>`;

  return createNodeToolboxDocument(
    'NodeToolbox — daily forecast',
    createTeamSurface('Forecast', panelMarkup),
    FORECAST_STYLES,
  );
}

// ── Screen 3 — Hygiene workspace ────────────────────────────────────────────

function createHygieneCheckTiles() {
  const scoreTile = `
    <div class="hg-tile hg-score">
      <div class="hg-count">${escapeHtml(DEMO_HYGIENE_SCORE)}</div>
      <div class="hg-name">Hygiene Score</div>
    </div>`;

  const checkTiles = DEMO_HYGIENE_CHECKS.map((hygieneCheck) => `
    <div class="hg-tile${hygieneCheck.count > 0 ? ' flagged' : ''}">
      <div class="hg-count">${hygieneCheck.count}</div>
      <div class="hg-name">${escapeHtml(hygieneCheck.label)}</div>
    </div>`).join('');

  return `<div class="hg-tiles">${scoreTile}${checkTiles}</div>`;
}

function createHygieneBands() {
  return `<div class="hg-bands">${DEMO_HYGIENE_BANDS.map((hygieneBand) => `
    <div class="hg-band hg-${hygieneBand.tone}">
      <div class="hg-band-label">${escapeHtml(hygieneBand.label)}</div>
      <div class="hg-band-value">${hygieneBand.value}</div>
      <div class="hg-band-note">${escapeHtml(hygieneBand.note)}</div>
    </div>`).join('')}</div>`;
}

function createHygieneFindings() {
  return DEMO_HYGIENE_FINDINGS.map((hygieneFinding) => `
    <div class="hg-finding">
      <div class="hg-finding-head">
        <span class="fc-key">${escapeHtml(hygieneFinding.key)}</span>
        <span class="hg-finding-summary">${escapeHtml(hygieneFinding.summary)}</span>
        <span class="hg-finding-chips">
          <span class="chip chip-green">${escapeHtml(hygieneFinding.issueType)}</span>
          <span class="chip chip-grey">${escapeHtml(hygieneFinding.status)}</span>
          <span class="chip chip-violet">${escapeHtml(hygieneFinding.owner)}</span>
        </span>
      </div>
      <div class="hg-dates">
        <span class="hg-date empty">TARGET START</span>
        <span class="hg-date empty">DUE</span>
        <span class="hg-date empty">TARGET END</span>
      </div>
      ${hygieneFinding.flags.map((hygieneFlag) => `
        <div class="hg-flag">
          <span class="chip chip-amber">${escapeHtml(hygieneFlag.label)}</span>
          <span class="hg-flag-detail">${escapeHtml(hygieneFlag.detail)}</span>
        </div>`).join('')}
    </div>`).join('');
}

const HYGIENE_STYLES = `
  .hg-tiles { display: grid; grid-template-columns: repeat(13, minmax(0,1fr)); gap: 4px;
    margin-bottom: 10px; }
  .hg-tile { background: var(--panel-2); border: 1px solid var(--line); border-radius: 5px;
    padding: 6px; }
  .hg-tile.flagged { border-color: var(--amber); }
  .hg-score { border-color: var(--blue); }
  .hg-count { font-size: 14px; font-weight: 650; }
  .hg-score .hg-count { color: var(--blue); font-size: 13px; }
  .hg-name { font-size: 8px; color: var(--faint); line-height: 1.35; margin-top: 2px; }
  .hg-bands { display: grid; grid-template-columns: repeat(4, 1fr); gap: 9px; margin-bottom: 10px; }
  .hg-band { border: 1px solid var(--line); border-left-width: 3px; border-radius: 6px;
    padding: 8px 12px; background: var(--panel); }
  .hg-band-label { font-size: 9px; font-weight: 700; letter-spacing: .09em; color: var(--faint); }
  .hg-band-value { font-size: 23px; font-weight: 650; line-height: 1.15; }
  .hg-band-note { font-size: 9.5px; color: var(--muted); }
  .hg-broken { border-left-color: var(--red); } .hg-broken .hg-band-value { color: var(--red); }
  .hg-untidy { border-left-color: var(--amber); } .hg-untidy .hg-band-value { color: var(--amber); }
  .hg-fixable { border-left-color: var(--blue); } .hg-fixable .hg-band-value { color: var(--blue); }
  .hg-clean { border-left-color: var(--green); } .hg-clean .hg-band-value { color: var(--green); }
  .hg-action { display: flex; align-items: center; gap: 11px; margin-bottom: 11px; }
  .hg-refusal { font-size: 10px; color: var(--amber); font-style: italic; }
  .hg-finding { background: var(--panel); border: 1px solid var(--line);
    border-left: 3px solid var(--amber); border-radius: 6px; padding: 8px 11px;
    margin-bottom: 7px; }
  .hg-finding-head { display: flex; align-items: baseline; gap: 8px; }
  .hg-finding-summary { flex: 1; font-size: 10.5px; }
  .hg-finding-chips { display: flex; gap: 4px; }
  .hg-dates { display: flex; gap: 6px; margin: 6px 0; }
  .hg-date { flex: 1; border: 1px solid var(--line); border-radius: 4px; padding: 3px 8px;
    font-size: 8.5px; letter-spacing: .06em; color: var(--muted); }
  .hg-date.empty { border-color: rgba(210,153,34,.5); color: var(--amber); }
  .hg-flag { display: flex; align-items: baseline; gap: 8px; padding: 3px 0; }
  .hg-flag-detail { font-size: 9.5px; color: var(--faint); }
`;

function createHygieneWorkspaceScreen() {
  const panelMarkup = `
    ${createHygieneCheckTiles()}
    ${createHygieneBands()}
    <div class="hg-action">
      <span class="btn btn-primary">🗓 ${escapeHtml(DEMO_HYGIENE_BULK_ACTION)}</span>
      <span class="hg-refusal">${escapeHtml(DEMO_HYGIENE_REFUSAL)}</span>
    </div>
    ${createHygieneFindings()}`;

  return createNodeToolboxDocument(
    'NodeToolbox — hygiene workspace',
    createTeamSurface('Hygiene', panelMarkup),
    HYGIENE_STYLES,
  );
}

// ── Screen 4 — Simple search ────────────────────────────────────────────────

function createSearchLevelTable(searchLevel) {
  const rowsMarkup = searchLevel.rows.map((searchRow) => `
    <tr>
      <td class="sr-key">${escapeHtml(searchRow.key)}</td>
      <td>${escapeHtml(searchRow.summary)}</td>
      <td><span class="chip chip-grey">${escapeHtml(searchRow.match)}</span></td>
      <td>${escapeHtml(searchRow.type)}</td>
      <td>${escapeHtml(searchRow.status)}</td>
      <td>${escapeHtml(searchRow.assignee)}</td>
      <td class="faint">${escapeHtml(searchRow.updated)}</td>
    </tr>`).join('');

  return `
    <section class="sr-level">
      <header><h3>${escapeHtml(searchLevel.level)}</h3>
        <span class="fc-count">${searchLevel.issueCount} issues</span></header>
      <table>
        <thead><tr>
          <th>Key</th><th>Summary</th><th>Match</th><th>Type</th>
          <th>Status</th><th>Assignee</th><th>Updated</th>
        </tr></thead>
        <tbody>${rowsMarkup}</tbody>
      </table>
    </section>`;
}

const SEARCH_STYLES = `
  .sr-controls { display: grid; grid-template-columns: 2fr 1.2fr 1fr auto; gap: 10px;
    margin-bottom: 9px; align-items: end; }
  .sr-controls .field-label { display: block; color: var(--faint); font-size: 9px;
    letter-spacing: .05em; margin-bottom: 4px; }
  .sr-controls .field-value { display: block; background: #0e131d; border: 1px solid var(--line);
    border-radius: 5px; padding: 6px 11px; font-size: 11.5px; }
  .sr-result-line { font-size: 10px; color: var(--faint); margin-bottom: 10px; }
  .sr-level { background: var(--panel); border: 1px solid var(--line); border-radius: 7px;
    padding: 8px 11px; margin-bottom: 8px; }
  .sr-level header { display: flex; align-items: center; gap: 9px; margin-bottom: 6px; }
  .sr-level h3 { margin: 0; font-size: 11.5px; }
  .sr-level table { width: 100%; border-collapse: collapse; }
  .sr-level th { text-align: left; font-size: 8.5px; letter-spacing: .07em; color: var(--faint);
    font-weight: 700; padding: 3px 6px; border-bottom: 1px solid var(--line); }
  .sr-level td { font-size: 10px; padding: 4px 6px; border-bottom: 1px solid var(--line-soft);
    color: var(--muted); }
  .sr-level td.sr-key { color: var(--blue); font-weight: 650; white-space: nowrap; }
`;

function createSimpleSearchScreen() {
  const bodyMarkup = `
    ${createWorkspaceNav('Search')}
    <div class="page">
      ${createPageHeading('Simple Search', 'Search Jira with a plain keyword while Toolbox writes the hidden Jira query behind the scenes.')}
      <div class="sr-controls">
        <div><span class="field-label">KEYWORD</span>
          <span class="field-value">${escapeHtml(DEMO_SEARCH_KEYWORD)}</span></div>
        <div><span class="field-label">SORT RESULTS</span>
          <span class="field-value">Keyword in Summary first</span></div>
        <div><span class="field-label">ISSUE TYPE</span>
          <span class="field-value">All types</span></div>
        <div><span class="field-value btn-primary" style="text-align:center;">Run search</span></div>
      </div>
      <div class="sr-result-line">${escapeHtml(DEMO_SEARCH_RESULT_LINE)}</div>
      ${DEMO_SEARCH_LEVELS.map(createSearchLevelTable).join('')}
    </div>`;

  return createNodeToolboxDocument('NodeToolbox — cross-level search', bodyMarkup, SEARCH_STYLES);
}

// ── Screen 5 — Feature composition ──────────────────────────────────────────

function createReadinessChecklist() {
  return DEMO_COMPOSITION_CHECKLIST.map((checklistItem) => `
    <div class="fx-check ${checklistItem.isSatisfied ? 'ok' : 'todo'}">
      ${checklistItem.isSatisfied ? '✓' : '•'} ${escapeHtml(checklistItem.text)}
    </div>`).join('');
}

function createReadinessGuidance() {
  return DEMO_READINESS_GUIDANCE.map((guidanceEntry) => `
    <div class="fx-guide">
      <b>${escapeHtml(guidanceEntry.title)}</b>
      <p>${escapeHtml(guidanceEntry.detail)}</p>
      <i>${escapeHtml(guidanceEntry.question)}</i>
    </div>`).join('');
}

const COMPOSITION_STYLES = `
  .fx-banner { background: var(--blue); color: #06121f; border-radius: 5px; padding: 5px 11px;
    font-size: 10.5px; font-weight: 600; margin-bottom: 10px; }
  .fx-columns { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1.15fr); gap: 10px;
    margin-bottom: 10px; }
  .fx-panel { background: var(--panel); border: 1px solid var(--line); border-radius: 7px;
    padding: 10px 12px; }
  .fx-panel h3 { margin: 0 0 9px; font-size: 11.5px; }
  .fx-field { margin-bottom: 8px; }
  .fx-field .field-label { display: block; color: var(--faint); font-size: 8.5px;
    letter-spacing: .06em; margin-bottom: 3px; }
  .fx-input { background: #0e131d; border: 1px solid var(--line); border-radius: 5px;
    padding: 5px 9px; font-size: 10px; color: var(--muted); min-height: 22px;
    white-space: pre-wrap; }
  .fx-drop { border: 1px dashed var(--line); border-radius: 6px; padding: 12px;
    text-align: center; font-size: 10px; color: var(--faint); margin-bottom: 9px; }
  .fx-check { font-size: 9.5px; padding: 2px 0; }
  .fx-check.ok { color: var(--green); } .fx-check.todo { color: var(--red); }
  .fx-create { display: block; text-align: center; background: #2a5b96; border-radius: 5px;
    padding: 6px 0; font-size: 11px; font-weight: 650; margin-top: 9px; color: #dbe9ff; }
  .fx-components { background: var(--panel); border: 1px solid var(--line); border-radius: 7px;
    padding: 10px 12px; margin-bottom: 10px; }
  .fx-rule { font-size: 9.5px; color: var(--muted); }
  .fx-guides { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 7px; }
  .fx-guide { background: var(--panel-2); border: 1px solid var(--line-soft); border-radius: 5px;
    padding: 7px 9px; }
  .fx-guide b { font-size: 10px; }
  .fx-guide p { margin: 3px 0; font-size: 9px; color: var(--faint); line-height: 1.45; }
  .fx-guide i { font-size: 9px; color: var(--muted); }
`;

function createFeatureCompositionScreen() {
  const draft = DEMO_COMPOSITION_DRAFT;
  const bodyMarkup = `
    ${createWorkspaceNav('Product')}
    <div class="page">
      ${createPageHeading('PO Tool', 'Feature-level product owner work — review, split, and compose Features in one place.')}
      ${createTabStrip(DEMO_COMPOSITION_TABS, 'Feature Composition')}
      <div class="fx-banner">Writing a new Feature. Nothing exists in Jira until you choose a project and create it.</div>
      <div class="fx-columns">
        <div class="fx-panel">
          <h3>What you are writing from</h3>
          <div class="fx-drop">Drop a spreadsheet here, or click to choose one (.xlsx, .xls, .csv)</div>
          <div class="fx-field"><span class="field-label">CONFLUENCE PAGE URL</span>
            <div class="fx-input">${escapeHtml(DEMO_COMPOSITION_SOURCES.confluenceUrl)}</div></div>
          <div class="fx-field"><span class="field-label">RELATED JIRA ISSUE</span>
            <div class="fx-input">${escapeHtml(DEMO_COMPOSITION_SOURCES.relatedIssue)}</div></div>
          <div class="fx-field"><span class="field-label">PASTE ANYTHING ELSE</span>
            <div class="fx-input">${escapeHtml(DEMO_COMPOSITION_SOURCES.noteText)}</div></div>
        </div>
        <div class="fx-panel">
          <h3>The Feature</h3>
          <div class="fx-field"><span class="field-label">SUMMARY</span>
            <div class="fx-input">${escapeHtml(draft.summary)}</div></div>
          <div class="fx-field"><span class="field-label">DESCRIPTION</span>
            <div class="fx-input">${escapeHtml(draft.description)}</div></div>
          <div class="fx-field"><span class="field-label">ACCEPTANCE CRITERIA</span>
            <div class="fx-input">${escapeHtml(draft.acceptanceCriteria)}</div></div>
          <div class="fx-field"><span class="field-label">YOUR OWN WORDS ABOUT THIS FEATURE</span>
            <div class="fx-input">${escapeHtml(draft.ownWords)}</div></div>
          <div class="fx-field"><span class="field-label">CREATE IN PROJECT</span>
            <div class="fx-input">${escapeHtml(DEMO_TEAM_PROJECT_KEY)}</div></div>
          <div class="field-label" style="color:var(--muted);font-size:9.5px;">Readiness checklist</div>
          ${createReadinessChecklist()}
          <span class="fx-create">Create Feature in Jira</span>
        </div>
      </div>
      <div class="fx-components">
        <h3 style="margin:0 0 5px;font-size:11.5px;">Team domain components</h3>
        <div class="fx-rule">${escapeHtml(DEMO_DOMAIN_COMPONENT_RULE)}</div>
      </div>
      <div class="fx-panel">
        <h3>What &ldquo;ready&rdquo; looks like</h3>
        <div class="fx-guides">${createReadinessGuidance()}</div>
      </div>
    </div>`;

  return createNodeToolboxDocument(
    'NodeToolbox — Feature composition',
    bodyMarkup,
    COMPOSITION_STYLES,
  );
}

// ── Registry consumed by the portfolio capture runner ───────────────────────

/** Maps each NodeToolbox showcase feature id to the screen it renders. */
export const NODETOOLBOX_SCREEN_BUILDERS = {
  'rollup-board': createRollupBoardScreen,
  'daily-forecast': createDailyForecastScreen,
  'hygiene-workspace': createHygieneWorkspaceScreen,
  'simple-search': createSimpleSearchScreen,
  'feature-composition': createFeatureCompositionScreen,
};
