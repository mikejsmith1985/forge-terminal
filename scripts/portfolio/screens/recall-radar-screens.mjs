// The four Recall Radar portfolio screens, rebuilt from the shipped UI.
//
// Recall Radar is a single-page application with three tabs, and the replicas
// follow the shipped stylesheet token for token in the light theme it opens
// in. The data on them is a real session captured from the running product —
// see recall-radar-demo-data.mjs for what that means. The screens are ordered
// as an argument: the answer says what the product does, the opened record
// shows what "checked" means, the search results show the arithmetic under a
// rank, and the evaluation table shows the numbers the author chose to publish
// rather than hide.

import {
  DEMO_ANSWER,
  DEMO_CITATIONS,
  DEMO_EVALUATION,
  DEMO_QUESTION,
  DEMO_RECORDS,
  DEMO_SEARCH,
  DEMO_THEME,
  DEMO_VEHICLES,
} from './recall-radar-demo-data.mjs';

// The product prints fused scores to four places and metrics to three.
const FUSED_SCORE_DECIMALS = 4;
const METRIC_DECIMALS = 3;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The stylesheet every Recall Radar screen shares, built from the shipped tokens. */
function createStylesheet() {
  return `
    * { box-sizing: border-box; }
    body { margin: 0; background: ${DEMO_THEME.page}; color: ${DEMO_THEME.ink};
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      font-size: 15px; line-height: 1.55; -webkit-font-smoothing: antialiased; }
    .app-shell { max-width: 1120px; margin: 0 auto; padding: 32px 24px 48px; }

    .app-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px;
      padding-bottom: 16px; margin-bottom: 24px; border-bottom: 1px solid ${DEMO_THEME.line}; }
    .app-header h1 { margin: 0; font-size: 28px; letter-spacing: -0.02em; line-height: 1.2; }
    .tagline { margin: 4px 0 0; color: ${DEMO_THEME.muted}; font-size: 13px; max-width: 52ch; }
    .tab-bar { display: flex; gap: 4px; padding: 4px; background: ${DEMO_THEME.surfaceSunken};
      border: 1px solid ${DEMO_THEME.line}; border-radius: 999px; }
    .tab-bar span { color: ${DEMO_THEME.inkSoft}; padding: 8px 16px; border-radius: 999px; font-weight: 500; }
    .tab-bar span.selected { background: ${DEMO_THEME.accent}; color: ${DEMO_THEME.onAccent}; }

    .panel { background: ${DEMO_THEME.surface}; border: 1px solid ${DEMO_THEME.line}; border-radius: 14px;
      padding: 24px; margin-bottom: 24px; box-shadow: 0 1px 2px rgb(16 24 39 / 6%); }
    .panel h2, .panel h3, .panel h4 { margin: 0 0 8px; }
    .panel h3 { font-size: 17px; }
    .panel h4 { font-size: 15px; margin-top: 16px; }
    .section-header { display: flex; align-items: center; justify-content: space-between; gap: 16px;
      margin-bottom: 12px; }
    .section-label { margin: 0; font-size: 12px; font-weight: 600; letter-spacing: 0.08em;
      text-transform: uppercase; color: ${DEMO_THEME.muted}; }
    .link-button { border: 1px dashed ${DEMO_THEME.lineStrong}; color: ${DEMO_THEME.inkSoft};
      border-radius: 6px; padding: 8px 12px; font-size: 13px; }

    .vehicle-picker { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; }
    .vehicle-picker div { min-height: 4.75rem; border: 1px solid ${DEMO_THEME.line};
      background: ${DEMO_THEME.surface}; border-radius: 10px; padding: 12px 16px; font-weight: 600; }
    .vehicle-picker div.selected { border-color: ${DEMO_THEME.accent}; background: ${DEMO_THEME.accentSoft};
      color: ${DEMO_THEME.accentInk}; box-shadow: 0 1px 2px rgb(16 24 39 / 6%); }
    .vehicle-picker small { display: block; margin-top: 4px; color: ${DEMO_THEME.muted}; font-weight: 400;
      font-size: 12px; font-variant-numeric: tabular-nums; }
    .recent-loads-panel { margin-top: 16px; border-top: 1px solid ${DEMO_THEME.line}; padding-top: 12px;
      color: ${DEMO_THEME.muted}; font-size: 13px; }

    .search-box { display: flex; gap: 8px; }
    .search-box .input { flex: 1; background: ${DEMO_THEME.surface}; padding: 12px 16px;
      border: 1px solid ${DEMO_THEME.lineStrong}; border-radius: 10px; }
    .search-box .submit { background: ${DEMO_THEME.accent}; color: ${DEMO_THEME.onAccent}; border-radius: 6px;
      padding: 8px 24px; font-weight: 600; display: flex; align-items: center; }

    .mode-switch { display: flex; align-items: center; gap: 8px; margin: 16px 0; }
    .mode-switch span { border: 1px solid ${DEMO_THEME.line}; background: ${DEMO_THEME.surface};
      color: ${DEMO_THEME.inkSoft}; padding: 4px 16px; border-radius: 999px; font-size: 13px; font-weight: 500; }
    .mode-switch span.selected { background: ${DEMO_THEME.accent}; border-color: ${DEMO_THEME.accent};
      color: ${DEMO_THEME.onAccent}; }

    .result-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
    .result-card { border: 1px solid ${DEMO_THEME.line}; border-radius: 10px; padding: 16px;
      background: ${DEMO_THEME.surface}; box-shadow: 0 1px 2px rgb(16 24 39 / 6%); }
    .result-card header { display: flex; justify-content: space-between; gap: 16px; align-items: baseline; }
    .result-card p { margin: 8px 0 0; }
    .kind { text-transform: uppercase; font-size: 12px; font-weight: 600; letter-spacing: 0.07em;
      color: ${DEMO_THEME.accentInk}; }
    .meta { color: ${DEMO_THEME.muted}; font-size: 13px; font-variant-numeric: tabular-nums; }
    .rank-explanation { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; font-size: 12px; }
    .rank-badge { border-radius: 999px; padding: 4px 12px; background: ${DEMO_THEME.accentSoft};
      color: ${DEMO_THEME.accentInk}; font-variant-numeric: tabular-nums; font-weight: 500; }
    .rank-badge.absent { background: ${DEMO_THEME.surfaceSunken}; border: 1px solid ${DEMO_THEME.line};
      color: ${DEMO_THEME.muted}; font-weight: 400; }

    .status-pill { display: inline-block; border-radius: 999px; padding: 4px 12px; font-size: 12px;
      font-weight: 600; letter-spacing: 0.02em; background: ${DEMO_THEME.surfaceSunken};
      border: 1px solid ${DEMO_THEME.line}; color: ${DEMO_THEME.inkSoft}; }
    .status-pill.grounded { background: ${DEMO_THEME.okSoft}; color: ${DEMO_THEME.ok}; border-color: transparent; }
    .answer-text { margin: 12px 0 0; }
    .dropped-count { color: ${DEMO_THEME.warn}; font-size: 13px; margin: 8px 0 0; }
    .citation-list { list-style: none; padding: 0; margin: 16px 0 0; display: grid; gap: 8px; }
    .citation-list li { border: 1px solid ${DEMO_THEME.line}; background: ${DEMO_THEME.surface};
      border-radius: 10px; padding: 12px 16px; }
    .citation-list li.opened { border-color: ${DEMO_THEME.accent}; background: ${DEMO_THEME.accentSoft}; }
    .citation-list blockquote { margin: 4px 0 0; padding-left: 12px; border-left: 3px solid ${DEMO_THEME.accent};
      color: ${DEMO_THEME.inkSoft}; }
    .empty-state { color: ${DEMO_THEME.muted}; margin: 16px 0; }
    .caption { color: ${DEMO_THEME.muted}; font-size: 13px; margin: 8px 0 0; }
    .known-pattern-panel ul { margin: 4px 0 0; padding-left: 24px; }
    .known-pattern-panel strong { display: block; margin-top: 12px; }

    .record-body { white-space: pre-wrap; line-height: 1.6; margin: 12px 0 0;
      font-family: ui-monospace, "Cascadia Mono", "SF Mono", Consolas, monospace; font-size: 13px;
      background: ${DEMO_THEME.surfaceSunken}; border: 1px solid ${DEMO_THEME.line}; border-radius: 10px;
      padding: 16px; max-height: 24rem; overflow: hidden; }
    .record-body mark { background: ${DEMO_THEME.mark}; color: ${DEMO_THEME.ink}; padding: 0 4px; border-radius: 2px; }

    .eval-table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
    .eval-table th, .eval-table td { border-bottom: 1px solid ${DEMO_THEME.line}; padding: 8px 12px;
      text-align: left; font-weight: 400; vertical-align: top; }
    .eval-table thead th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em;
      color: ${DEMO_THEME.muted}; font-weight: 600; }
    .eval-table td.number { text-align: right; font-variant-numeric: tabular-nums; color: ${DEMO_THEME.muted};
      white-space: nowrap; }
    .eval-table td.worst { color: ${DEMO_THEME.warn}; font-weight: 600; }
    .eval-table td.best { color: ${DEMO_THEME.ok}; font-weight: 600; }`;
}

/** Wraps one screen's body in a standalone document the capture runner can render. */
function createDocument(title, bodyMarkup) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>${createStylesheet()}</style>
  </head>
  <body>${bodyMarkup}</body>
</html>`;
}

// ── Shared chrome ───────────────────────────────────────────────────────────

function createHeader(selectedTab) {
  const tabs = ['Search', 'Ask', 'Evaluation'];

  return `
    <header class="app-header">
      <div>
        <h1>Recall Radar</h1>
        <p class="tagline">Ask what is wrong with your car and get an answer quoted from NHTSA complaints,
          recalls and defect investigations — every quote checked against the record it came from.</p>
      </div>
      <nav class="tab-bar">
        ${tabs.map((tabLabel) => `<span class="${tabLabel === selectedTab ? 'selected' : ''}">${escapeHtml(tabLabel)}</span>`).join('')}
      </nav>
    </header>`;
}

/** "1 complaint", not "1 complaints" — the product's own rule. */
function pluralise(count, singular) {
  return `${count.toLocaleString('en-US')} ${count === 1 ? singular : `${singular}s`}`;
}

function describeVehicleCounts(vehicle) {
  return [
    pluralise(vehicle.counts.complaint, 'complaint'),
    pluralise(vehicle.counts.recall, 'recall'),
    pluralise(vehicle.counts.investigation, 'investigation'),
  ].join(' · ');
}

/** The vehicles panel every tab sits under. */
function createVehiclesPanel() {
  const vehiclesMarkup = DEMO_VEHICLES.map((vehicle) => `
    <div class="${vehicle.isSelected ? 'selected' : ''}">
      ${escapeHtml(vehicle.displayName)}
      <small>${escapeHtml(describeVehicleCounts(vehicle))}</small>
    </div>`).join('');

  return `
    <section class="panel">
      <div class="section-header">
        <h2 class="section-label">Your vehicles</h2>
        <span class="link-button">Add a vehicle</span>
      </div>
      <div class="vehicle-picker">${vehiclesMarkup}</div>
      <div class="recent-loads-panel">▸ Recent loads</div>
    </section>`;
}

function createSearchBox(text, submitLabel) {
  return `
    <div class="search-box">
      <div class="input">${escapeHtml(text)}</div>
      <span class="submit">${escapeHtml(submitLabel)}</span>
    </div>`;
}

function findRecord(documentId) {
  return DEMO_RECORDS.find((candidate) => candidate.id === documentId);
}

// ── Ask tab ─────────────────────────────────────────────────────────────────

/** The product's wording for the dropped count, shown even when it is zero. */
function describeDroppedCitations(droppedCitationCount) {
  if (droppedCitationCount === 0) {
    return 'Every citation the model offered was verified against its source record.';
  }
  const noun = droppedCitationCount === 1 ? 'citation' : 'citations';
  return `${droppedCitationCount} ${noun} dropped: the quoted text was not found in the record it cited.`;
}

/**
 * The answer panel: the verdict pills, the text, the dropped count, and every
 * surviving citation as something the reader can open.
 *
 * @param openedCitationIndex Index of the citation drawn as selected, or -1.
 */
function createAnswerPanel(openedCitationIndex = -1) {
  const citationsMarkup = DEMO_CITATIONS.map((citation, citationIndex) => `
    <li class="${citationIndex === openedCitationIndex ? 'opened' : ''}">
      <span class="kind">${escapeHtml(citation.kind)}</span> ${escapeHtml(citation.externalId)}
      <blockquote>${escapeHtml(citation.quote)}</blockquote>
    </li>`).join('');

  return `
    <section class="panel">
      <span class="status-pill grounded">${DEMO_ANSWER.isGrounded ? 'Grounded' : 'Not grounded'}</span>
      <span class="status-pill">${DEMO_ANSWER.isKnownPattern ? 'Known pattern' : 'No known pattern'}</span>
      <p class="answer-text">${escapeHtml(DEMO_ANSWER.text)}</p>
      <p class="dropped-count">${escapeHtml(describeDroppedCitations(DEMO_ANSWER.droppedCitationCount))}</p>
      <ul class="citation-list">${citationsMarkup}</ul>
    </section>`;
}

/** Unique cited investigations and recalls, in citation order; complaints are evidence, not actions. */
function collectCitedCampaignRecords() {
  const seenExternalIds = new Set();

  return DEMO_CITATIONS.filter((citation) => {
    const isActionable = citation.kind === 'recall' || citation.kind === 'investigation';
    if (!isActionable || seenExternalIds.has(citation.externalId)) {
      return false;
    }
    seenExternalIds.add(citation.externalId);
    return true;
  });
}

/** Campaign-pool matches the answer did not quote — retrieved, so a lead to read, never evidence. */
function collectUncitedMatches() {
  const citedExternalIds = new Set(collectCitedCampaignRecords().map((record) => record.externalId));
  return DEMO_ANSWER.campaignMatches.filter((match) => !citedExternalIds.has(match.externalId));
}

function createRecordListItem(record) {
  return `<li><span class="kind">${escapeHtml(record.kind)}</span> ${escapeHtml(record.externalId)}</li>`;
}

/**
 * The recalls and investigations the answer tied the symptom to, section by
 * section as the product renders them — each only when it has something to
 * show, and an empty-state line when none do.
 */
function createKnownPatternPanel() {
  const citedRecords = collectCitedCampaignRecords();
  const uncitedMatches = collectUncitedMatches();
  const hasAnything = DEMO_ANSWER.linkedCampaigns.length > 0 || citedRecords.length > 0 || uncitedMatches.length > 0;

  const campaignsMarkup = DEMO_ANSWER.linkedCampaigns.length === 0 ? '' : `
    <strong>Recall campaigns</strong>
    <ul>${DEMO_ANSWER.linkedCampaigns.map((campaign) => `<li>${escapeHtml(campaign)}</li>`).join('')}</ul>`;
  const citedMarkup = citedRecords.length === 0 ? '' : `
    <strong>Cited records</strong>
    <ul>${citedRecords.map(createRecordListItem).join('')}</ul>`;
  const uncitedMarkup = uncitedMatches.length === 0 ? '' : `
    <strong>Also matched, not quoted</strong>
    <p class="caption">Retrieved from this vehicle's recalls and investigations. Nothing here was quoted in
      the answer, so none of it has been verified — read it yourself.</p>
    <ul>${uncitedMatches.map((match) => `<li><span class="kind">${escapeHtml(match.kind)}</span> ${escapeHtml(match.externalId)} — ${escapeHtml(match.title)}</li>`).join('')}</ul>`;
  const emptyMarkup = hasAnything ? '' : `
    <p class="empty-state">No recall campaign or investigation was linked to this answer.</p>`;

  return `
    <section class="panel known-pattern-panel">
      <h3>Related recalls and investigations</h3>
      ${emptyMarkup}${campaignsMarkup}${citedMarkup}${uncitedMarkup}
    </section>`;
}

/** The opened record in full, with the verified span marked at the offsets the verifier matched. */
function createCitationView() {
  const openedCitation = DEMO_CITATIONS[DEMO_ANSWER.openedCitationIndex];
  const record = findRecord(openedCitation.documentId);
  const bodyMarkup = escapeHtml(record.body.slice(0, openedCitation.startOffset))
    + `<mark>${escapeHtml(record.body.slice(openedCitation.startOffset, openedCitation.endOffset))}</mark>`
    + escapeHtml(record.body.slice(openedCitation.endOffset));

  return `
    <section class="panel">
      <h3><span class="kind">${escapeHtml(record.kind)}</span> ${escapeHtml(record.title)}</h3>
      <div class="meta">${escapeHtml(record.externalId)} · ${escapeHtml(record.component)} · ${escapeHtml(record.filedOn)}</div>
      <pre class="record-body">${bodyMarkup}</pre>
    </section>`;
}

// ── Search tab ──────────────────────────────────────────────────────────────

/** Formats a per-method rank, or says the method did not surface this record at all. */
function describeRank(methodName, rank) {
  return rank === null ? `${methodName}: not in top results` : `${methodName} rank ${rank}`;
}

function createRankBadge(methodName, rank) {
  return `<span class="rank-badge${rank === null ? ' absent' : ''}">${escapeHtml(describeRank(methodName, rank))}</span>`;
}

function createResultCard(searchHit, position) {
  return `
    <li class="result-card">
      <header>
        <div><span class="kind">${escapeHtml(searchHit.kind)}</span> <strong>${escapeHtml(searchHit.title)}</strong></div>
        <span class="meta">#${position}</span>
      </header>
      <div class="meta">${escapeHtml(searchHit.externalId)} · ${escapeHtml(searchHit.component)} · ${escapeHtml(searchHit.filedOn)}</div>
      <p>${escapeHtml(searchHit.snippet)}</p>
      <div class="rank-explanation">
        ${createRankBadge('Meaning', searchHit.denseRank)}
        ${createRankBadge('Keyword', searchHit.sparseRank)}
        <span class="rank-badge">Fused score ${searchHit.fusedScore.toFixed(FUSED_SCORE_DECIMALS)}</span>
      </div>
    </li>`;
}

function createModeSwitch() {
  const modes = [
    { mode: 'hybrid', label: 'Combined' },
    { mode: 'dense', label: 'Meaning' },
    { mode: 'sparse', label: 'Keyword' },
  ];

  return `
    <div class="mode-switch">
      ${modes.map((entry) => `<span class="${entry.mode === DEMO_SEARCH.mode ? 'selected' : ''}">${escapeHtml(entry.label)}</span>`).join('')}
    </div>`;
}

// ── Evaluation tab ──────────────────────────────────────────────────────────

const EVALUATION_MODE_ROWS = [
  { key: 'dense', label: 'Meaning (dense)' },
  { key: 'sparse', label: 'Keyword (sparse)' },
  { key: 'hybrid', label: 'Combined (hybrid)' },
];

const EVALUATION_POOLS = [
  {
    scope: 'all',
    heading: 'Every record',
    caption: 'All complaints, recalls and investigations ranked together. Complaints outnumber the rest by '
      + 'orders of magnitude, so they take most places.',
  },
  {
    scope: 'campaigns',
    heading: 'Recalls and investigations only',
    caption: 'The same questions, ranked against the official records alone. The gap between the two '
      + 'sections is how much of the failure was crowding rather than ranking.',
  },
];

/** The key one mode occupies in the run's metrics, for a given pool — the product's own mapping. */
function createMetricsKey(mode, scope) {
  return scope === 'all' ? mode : `campaigns${mode.charAt(0).toUpperCase()}${mode.slice(1)}`;
}

/** Colours a cell the way a reader's eye would: zero is the bad news, the best recall the good. */
function describeMetricTone(value, columnBest) {
  if (value === 0) {
    return 'worst';
  }
  return value === columnBest ? 'best' : '';
}

function createMetricCell(value, columnBest) {
  return `<td class="number ${describeMetricTone(value, columnBest)}">${value.toFixed(METRIC_DECIMALS)}</td>`;
}

function createEvaluationPool(pool) {
  const rows = EVALUATION_MODE_ROWS.map((modeRow) => ({
    label: modeRow.label,
    metrics: DEMO_EVALUATION.metrics[createMetricsKey(modeRow.key, pool.scope)],
  }));
  const bestRecallAt10 = Math.max(...rows.map((row) => row.metrics.recallAt10));

  const rowsMarkup = rows.map((row) => `
    <tr>
      <th scope="row">${escapeHtml(row.label)}</th>
      ${createMetricCell(row.metrics.recallAt5, -1)}
      ${createMetricCell(row.metrics.recallAt10, bestRecallAt10)}
      ${createMetricCell(row.metrics.mrr, -1)}
    </tr>`).join('');

  return `
    <div>
      <h4>${escapeHtml(pool.heading)}</h4>
      <p class="caption">${escapeHtml(pool.caption)}</p>
      <table class="eval-table">
        <thead><tr><th scope="col">Mode</th><th scope="col">Recall@5</th><th scope="col">Recall@10</th><th scope="col">MRR</th></tr></thead>
        <tbody>${rowsMarkup}</tbody>
      </table>
    </div>`;
}

function createEvaluationPanel() {
  const earlierRunsLabel = `${DEMO_EVALUATION.earlierRunCount} earlier run${DEMO_EVALUATION.earlierRunCount === 1 ? '' : 's'} recorded.`;

  return `
    <section class="panel">
      <h2>Retrieval quality</h2>
      <p class="meta">Ground truth is derived from NHTSA investigations and the recall campaigns they led to; queries are
        owner complaints filed while each investigation was open.</p>
      <p class="meta">Run #${DEMO_EVALUATION.runId} · ${escapeHtml(DEMO_EVALUATION.ranAt)} · ${DEMO_EVALUATION.caseCount} ground-truth cases</p>
      ${EVALUATION_POOLS.map(createEvaluationPool).join('')}
      <p>Citation faithfulness: not measured (answering unavailable)</p>
      <p class="meta">${escapeHtml(earlierRunsLabel)}</p>
    </section>`;
}

// ── The four screens ────────────────────────────────────────────────────────

/** The Ask tab after a question: the verdict, the answer, and every citation that survived. */
function createGroundedAnswerScreen() {
  return createDocument('Recall Radar — a grounded answer', `
    <div class="app-shell">
      ${createHeader('Ask')}
      ${createVehiclesPanel()}
      ${createSearchBox(DEMO_QUESTION, 'Ask')}
      ${createAnswerPanel()}
      ${createKnownPatternPanel()}
    </div>`);
}

/**
 * The same answer with one citation opened: the record in full, the quoted
 * span marked at the offsets the verifier matched.
 *
 * The record is shown directly beneath the answer, as the product does the
 * moment a citation is clicked; the related-campaigns panel that sits between
 * them in the shipped page is kept on the grounded-answer screen, where it is
 * the subject, so the picture here stays about the highlight.
 */
function createVerifiedQuoteScreen() {
  return createDocument('Recall Radar — the quote, checked', `
    <div class="app-shell">
      ${createHeader('Ask')}
      ${createVehiclesPanel()}
      ${createSearchBox(DEMO_QUESTION, 'Ask')}
      ${createAnswerPanel(DEMO_ANSWER.openedCitationIndex)}
      ${createCitationView()}
    </div>`);
}

/** The Search tab: every result says how it was found — by meaning, by keyword, or by both. */
function createExplainedSearchScreen() {
  const resultsMarkup = DEMO_SEARCH.hits
    .map((searchHit, index) => createResultCard(searchHit, index + 1))
    .join('');

  return createDocument('Recall Radar — search, explained', `
    <div class="app-shell">
      ${createHeader('Search')}
      ${createVehiclesPanel()}
      ${createSearchBox(DEMO_SEARCH.query, 'Search')}
      ${createModeSwitch()}
      <ul class="result-list">${resultsMarkup}</ul>
    </div>`);
}

/** The Evaluation tab: the measured run, both pools, zeros included. */
function createRetrievalEvaluationScreen() {
  return createDocument('Recall Radar — retrieval quality, measured', `
    <div class="app-shell">
      ${createHeader('Evaluation')}
      ${createVehiclesPanel()}
      ${createEvaluationPanel()}
    </div>`);
}

/** Maps each Recall Radar showcase feature id to the screen it renders. */
export const RECALL_RADAR_SCREEN_BUILDERS = {
  'grounded-answer': createGroundedAnswerScreen,
  'verified-quote': createVerifiedQuoteScreen,
  'explained-search': createExplainedSearchScreen,
  'retrieval-evaluation': createRetrievalEvaluationScreen,
};
