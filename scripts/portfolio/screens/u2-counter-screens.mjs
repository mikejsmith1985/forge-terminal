// The three U2 Counter portfolio screens, rebuilt from the shipped UI.
//
// U2 Counter is a workstation application — it is used standing at a trade
// counter with a customer on the telephone — so all three replicas render a wide
// desktop frame in the warm light theme the product opens in.
//
// The screens are ordered as an argument rather than a gallery: the tour says
// what the thing is, the answer screen shows the figure a representative would
// actually quote, and the transcript shows where that figure came from. The
// third is the one that does the work, because a screenshot of a number is worth
// nothing without the lookup underneath it.

import {
  DEMO_ANSWER,
  DEMO_BRANCHES,
  DEMO_CUSTOMER,
  DEMO_GOVERNANCE_BADGES,
  DEMO_MARKS,
  DEMO_MCP_CALLS,
  DEMO_PART,
  DEMO_QUESTION,
  DEMO_RECORD_FIELDS,
  DEMO_THEME,
  DEMO_TOOL_POLICY,
  DEMO_TOUR_STEP,
  buildStoredRecord,
  describeAvailability,
} from './u2-counter-demo-data.mjs';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The stylesheet every U2 Counter screen shares, built from the shipped tokens. */
function createStylesheet() {
  return `
    * { box-sizing: border-box; }
    body { margin: 0; background: ${DEMO_THEME.surface}; color: ${DEMO_THEME.text};
      font-family: Inter, "Segoe UI", system-ui, sans-serif; font-size: 15px; line-height: 1.5; }
    .app { display: flex; flex-direction: column; min-height: 100vh; }

    .app-header { display: flex; align-items: center; gap: 18px; padding: 14px 26px;
      background: ${DEMO_THEME.surfaceRaised}; border-bottom: 1px solid ${DEMO_THEME.line}; }
    .brand { font-weight: 700; font-size: 17px; letter-spacing: -0.01em; }
    .brand span { color: ${DEMO_THEME.accent}; }
    .header-links { display: flex; gap: 20px; margin-left: auto; color: ${DEMO_THEME.textMuted};
      font-size: 14px; }
    .header-links .current { color: ${DEMO_THEME.accent}; font-weight: 600; }

    .pickers { display: grid; grid-template-columns: 1.4fr 1.4fr auto; gap: 16px;
      padding: 18px 26px; background: ${DEMO_THEME.surfaceRaised};
      border-bottom: 1px solid ${DEMO_THEME.line}; align-items: end; }
    .picker label { display: block; font-size: 12px; font-weight: 700; letter-spacing: 0.08em;
      text-transform: uppercase; color: ${DEMO_THEME.textFaint}; margin-bottom: 6px; }
    .picker .field { display: flex; align-items: center; gap: 10px; padding: 10px 13px;
      border: 1px solid ${DEMO_THEME.lineStrong}; border-radius: 3px;
      background: ${DEMO_THEME.surfaceRaised}; }
    .picker .value { font-family: "Cascadia Mono", Consolas, monospace; font-weight: 650; }
    .picker .sub { color: ${DEMO_THEME.textMuted}; font-size: 13px; }
    .picker .caret { margin-left: auto; color: ${DEMO_THEME.textFaint}; }
    .shortcut { font-family: "Cascadia Mono", Consolas, monospace; font-size: 12px;
      color: ${DEMO_THEME.textFaint}; border: 1px solid ${DEMO_THEME.line}; border-radius: 3px;
      padding: 3px 7px; }

    .main { flex: 1; padding: 24px 26px 8px; display: flex; flex-direction: column; gap: 22px; }
    .panel { border: 1px solid ${DEMO_THEME.line}; border-radius: 3px;
      background: ${DEMO_THEME.surfaceRaised}; }
    .panel-head { display: flex; align-items: baseline; gap: 12px; padding: 13px 18px;
      border-bottom: 1px solid ${DEMO_THEME.line}; }
    .panel-head h2 { margin: 0; font-size: 15px; letter-spacing: -0.01em; }
    .panel-head .hint { color: ${DEMO_THEME.textMuted}; font-size: 13px; }
    .panel-head .spacer { margin-left: auto; }

    .grid-head, .grid-row { display: grid;
      grid-template-columns: 78px 1.6fr 110px 120px 130px 1fr; gap: 14px;
      padding: 11px 18px; align-items: center; }
    .grid-head { font-size: 11.5px; font-weight: 700; letter-spacing: 0.09em;
      text-transform: uppercase; color: ${DEMO_THEME.textFaint};
      background: ${DEMO_THEME.surfaceSunken}; border-bottom: 1px solid ${DEMO_THEME.line}; }
    .grid-row { border-bottom: 1px solid ${DEMO_THEME.line}; }
    .grid-row:last-child { border-bottom: 0; }
    .grid-row .code, .grid-row .qty { font-family: "Cascadia Mono", Consolas, monospace; }
    .grid-row .qty { text-align: right; }
    .grid-row .free { font-family: "Cascadia Mono", Consolas, monospace; font-weight: 700;
      font-size: 17px; text-align: right; }
    .grid-row.available .free { color: ${DEMO_THEME.available}; }
    .grid-row.committed .free { color: ${DEMO_THEME.committed}; }
    .grid-row.none .free { color: ${DEMO_THEME.none}; }
    .pill { display: inline-block; border-radius: 999px; padding: 3px 11px; font-size: 12px;
      font-weight: 650; }
    .pill.available { background: ${DEMO_THEME.availableSoft}; color: ${DEMO_THEME.available}; }
    .pill.committed { background: ${DEMO_THEME.committedSoft}; color: ${DEMO_THEME.committed}; }
    .pill.none { background: ${DEMO_THEME.noneSoft}; color: ${DEMO_THEME.none}; }

    .ask { padding: 16px 18px; }
    .ask-field { display: flex; align-items: center; gap: 12px; padding: 12px 15px;
      border: 1px solid ${DEMO_THEME.accent}; border-radius: 3px;
      background: ${DEMO_THEME.accentSoft}; }
    .ask-field .question { font-weight: 600; }
    .ask-field .send { margin-left: auto; background: ${DEMO_THEME.accent};
      color: ${DEMO_THEME.accentText}; border-radius: 3px; padding: 6px 15px; font-size: 13px;
      font-weight: 650; }
    .answer { margin-top: 16px; padding-left: 15px; border-left: 3px solid ${DEMO_THEME.accent}; }
    .answer .headline { font-size: 17px; font-weight: 600; margin: 0 0 6px; }
    .answer .qualifier { margin: 0; color: ${DEMO_THEME.textMuted}; }

    .calls { border-top: 1px solid ${DEMO_THEME.line}; margin-top: 18px; }
    .calls-head { display: flex; align-items: center; gap: 10px; padding: 12px 0 10px;
      font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
      color: ${DEMO_THEME.textFaint}; }
    .calls-head .policy { margin-left: auto; text-transform: none; letter-spacing: 0;
      font-weight: 500; font-size: 12.5px; color: ${DEMO_THEME.textMuted}; }
    .call { display: grid; grid-template-columns: 168px 1fr 150px 62px; gap: 14px;
      padding: 9px 0; border-top: 1px solid ${DEMO_THEME.line}; align-items: center;
      font-family: "Cascadia Mono", Consolas, monospace; font-size: 13px; }
    .call .tool { color: ${DEMO_THEME.accent}; font-weight: 700; }
    .call .detail { color: ${DEMO_THEME.text}; overflow: hidden; text-overflow: ellipsis;
      white-space: nowrap; }
    .call .result { color: ${DEMO_THEME.textMuted}; }
    .call .ms { color: ${DEMO_THEME.textFaint}; text-align: right; }

    .record { display: grid; grid-template-columns: 1.15fr 1fr; gap: 0; }
    .record > div { padding: 16px 18px; }
    .record > div + div { border-left: 1px solid ${DEMO_THEME.line}; }
    .record h3 { margin: 0 0 4px; font-size: 13px; letter-spacing: 0.06em;
      text-transform: uppercase; color: ${DEMO_THEME.textFaint}; }
    .record .caption { margin: 0 0 12px; font-size: 13px; color: ${DEMO_THEME.textMuted}; }
    .bytes { font-family: "Cascadia Mono", Consolas, monospace; font-size: 13px;
      line-height: 1.9; overflow-wrap: anywhere; background: ${DEMO_THEME.surfaceSunken};
      border: 1px solid ${DEMO_THEME.line}; border-radius: 3px; padding: 12px 14px; }
    .mark { display: inline-block; padding: 0 3px; border-radius: 2px; font-weight: 700; }
    .mark.attribute { background: ${DEMO_THEME.accent}; color: ${DEMO_THEME.accentText}; }
    .mark.value { background: ${DEMO_THEME.committedSoft}; color: ${DEMO_THEME.committed}; }
    .legend { list-style: none; margin: 12px 0 0; padding: 0; font-size: 13px; }
    .legend li { display: flex; gap: 10px; padding: 5px 0;
      border-bottom: 1px solid ${DEMO_THEME.line}; }
    .legend li:last-child { border-bottom: 0; }
    .legend .pos { font-family: "Cascadia Mono", Consolas, monospace;
      color: ${DEMO_THEME.textFaint}; flex: 0 0 20px; }
    .legend .name { font-family: "Cascadia Mono", Consolas, monospace; font-weight: 650;
      flex: 0 0 150px; }
    .legend .note { color: ${DEMO_THEME.textMuted}; }

    .parallel-head, .parallel-row { display: grid; grid-template-columns: 60px 1fr 78px 78px;
      gap: 12px; padding: 8px 0; font-family: "Cascadia Mono", Consolas, monospace;
      font-size: 13px; }
    .parallel-head { font-family: Inter, system-ui, sans-serif; font-size: 11.5px;
      font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
      color: ${DEMO_THEME.textFaint}; border-bottom: 1px solid ${DEMO_THEME.line}; }
    .parallel-row { border-bottom: 1px solid ${DEMO_THEME.line}; }
    .parallel-row span:nth-child(3), .parallel-row span:nth-child(4) { text-align: right; }

    .governance { display: flex; align-items: center; gap: 10px; padding: 12px 26px;
      background: ${DEMO_THEME.surfaceSunken}; border-top: 1px solid ${DEMO_THEME.line}; }
    .governance .badge { border: 1px solid ${DEMO_THEME.lineStrong}; border-radius: 999px;
      padding: 3px 12px; font-size: 12px; color: ${DEMO_THEME.textMuted};
      background: ${DEMO_THEME.surfaceRaised}; }
    .governance .activity { margin-left: auto; font-size: 12.5px;
      color: ${DEMO_THEME.textMuted}; border: 1px solid ${DEMO_THEME.lineStrong};
      border-radius: 3px; padding: 5px 12px; }

    /* The tour dims the page and leaves the control a step names lit, exactly as
       the shipped overlay does. The spotlight is produced by raising the target
       above a full-page scrim rather than by positioning a hole over it, because
       a hole placed by hand lands a few pixels off and cuts through the first
       row of the table it is supposed to be pointing at. */
    .tour-scrim { position: fixed; inset: 0; background: rgba(28, 25, 23, 0.62); z-index: 10; }
    .tour-target { position: relative; z-index: 11;
      border-color: ${DEMO_THEME.accent}; box-shadow: 0 0 0 3px rgba(180, 83, 9, 0.22); }
    .tour-card { position: relative; z-index: 12; width: 420px; align-self: flex-start;
      background: ${DEMO_THEME.surfaceRaised}; border: 1px solid ${DEMO_THEME.lineStrong};
      border-radius: 4px; padding: 18px 20px;
      box-shadow: 0 22px 60px rgba(28, 25, 23, 0.28); }
    .tour-card .count { margin: 0 0 8px; font-size: 12px; font-weight: 700;
      letter-spacing: 0.09em; text-transform: uppercase; color: ${DEMO_THEME.accent}; }
    .tour-card h2 { margin: 0 0 8px; font-size: 19px; letter-spacing: -0.015em; }
    .tour-card p.body { margin: 0 0 16px; color: ${DEMO_THEME.textMuted}; font-size: 14px; }
    .tour-actions { display: flex; align-items: center; gap: 10px; }
    .tour-actions .spacer { margin-left: auto; }
    .tour-actions .quiet { color: ${DEMO_THEME.textMuted}; font-size: 13.5px; }
    .tour-actions .primary { background: ${DEMO_THEME.accent}; color: ${DEMO_THEME.accentText};
      border-radius: 3px; padding: 7px 18px; font-size: 13.5px; font-weight: 650; }
    .tour-actions .escape { font-size: 12px; color: ${DEMO_THEME.textFaint}; }`;
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

function createHeader(currentLink) {
  const links = ['Explore the database', 'Use your own data', 'Take the tour'];

  return `
    <div class="app-header">
      <div class="brand">Counter <span>availability lookup</span></div>
      <div class="header-links">
        ${links.map((linkLabel) => `<span class="${linkLabel === currentLink ? 'current' : ''}">${escapeHtml(linkLabel)}</span>`).join('')}
      </div>
    </div>`;
}

function createPickers() {
  return `
    <div class="pickers">
      <div class="picker" data-tour="part-search">
        <label>Part</label>
        <div class="field">
          <span class="value">${escapeHtml(DEMO_PART.number)}</span>
          <span class="sub">${escapeHtml(DEMO_PART.description)}</span>
          <span class="caret">▾</span>
        </div>
      </div>
      <div class="picker" data-tour="customer-picker">
        <label>Customer</label>
        <div class="field">
          <span class="value">${escapeHtml(DEMO_CUSTOMER.id)}</span>
          <span class="sub">${escapeHtml(DEMO_CUSTOMER.name)} · ${escapeHtml(DEMO_CUSTOMER.priceClass)}</span>
          <span class="caret">▾</span>
        </div>
      </div>
      <div class="picker">
        <label>Shortcuts</label>
        <div class="field" style="border-style: dashed;">
          <span class="shortcut">/</span><span class="sub">part</span>
          <span class="shortcut">R</span><span class="sub">record</span>
        </div>
      </div>
    </div>`;
}

/** The strip that says whose figures these are, on every screen. */
function createGovernanceStrip() {
  return `
    <div class="governance" data-tour="governance">
      ${DEMO_GOVERNANCE_BADGES.map((badge) => `<span class="badge">${escapeHtml(badge)}</span>`).join('')}
      <span class="activity" data-tour="activity-button">Who asked what ↗</span>
    </div>`;
}

/**
 * The branch table — the figure a representative is allowed to quote.
 *
 * @param extraClassName Extra class for the panel, used by the tour screen to
 *   mark this table as the spotlighted target.
 */
function createBranchGrid(extraClassName = '') {
  const rowsMarkup = DEMO_BRANCHES.map((branch) => {
    const { freeToSell, tone, label } = describeAvailability(branch);

    return `
      <div class="grid-row ${tone}">
        <span class="code">${escapeHtml(branch.code)}</span>
        <span>${escapeHtml(branch.name)}</span>
        <span class="qty">${branch.onHand}</span>
        <span class="qty">${branch.committed}</span>
        <span class="free">${freeToSell}</span>
        <span><span class="pill ${tone}">${escapeHtml(label)}</span></span>
      </div>`;
  }).join('');

  return `
    <section class="panel ${extraClassName}" data-tour="branch-grid">
      <div class="panel-head">
        <h2>Availability by branch</h2>
        <span class="hint">Free to sell is on hand minus what orders already hold</span>
      </div>
      <div class="grid-head">
        <span>Branch</span><span>Name</span><span>On hand</span>
        <span>Committed</span><span>Free to sell</span><span>Status</span>
      </div>
      ${rowsMarkup}
    </section>`;
}

/** The assistant panel: a question in words, the answer, and every call beneath it. */
function createAskPanel() {
  const callsMarkup = DEMO_MCP_CALLS.map((mcpCall) => `
    <div class="call">
      <span class="tool">${escapeHtml(mcpCall.tool)}</span>
      <span class="detail">${escapeHtml(mcpCall.detail)}</span>
      <span class="result">${escapeHtml(mcpCall.result)}</span>
      <span class="ms">${mcpCall.milliseconds}ms</span>
    </div>`).join('');

  return `
    <section class="panel" data-tour="ask">
      <div class="panel-head">
        <h2>Ask in plain words</h2>
        <span class="hint">Answered only from what it reads out of this database</span>
      </div>
      <div class="ask">
        <div class="ask-field">
          <span class="question">${escapeHtml(DEMO_QUESTION)}</span>
          <span class="send">Ask</span>
        </div>
        <div class="answer">
          <p class="headline">${escapeHtml(DEMO_ANSWER.headline)}</p>
          <p class="qualifier">${escapeHtml(DEMO_ANSWER.qualifier)}</p>
        </div>
        <div class="calls">
          <div class="calls-head">
            <span>Every call it made — MCP</span>
            <span class="policy">${DEMO_TOOL_POLICY.available} tools offered ·
              ${DEMO_TOOL_POLICY.writes} of them write</span>
          </div>
          ${callsMarkup}
        </div>
      </div>
    </section>`;
}

/** The stored record with its separators shown, beside the parallel fields parsed out. */
function createRecordPanel() {
  const markedBytes = escapeHtml(buildStoredRecord())
    .split(DEMO_MARKS.attribute)
    .join(`<span class="mark attribute">${DEMO_MARKS.attribute}</span>`)
    .split(DEMO_MARKS.value)
    .join(`<span class="mark value">${DEMO_MARKS.value}</span>`);

  const legendMarkup = DEMO_RECORD_FIELDS.map((recordField) => `
    <li>
      <span class="pos">${recordField.position}</span>
      <span class="name">${escapeHtml(recordField.name)}</span>
      <span class="note">${escapeHtml(recordField.note)}</span>
    </li>`).join('');

  const parallelRowsMarkup = DEMO_BRANCHES.map((branch) => `
    <div class="parallel-row">
      <span>${escapeHtml(branch.code)}</span>
      <span>${escapeHtml(branch.name)}</span>
      <span>${branch.onHand}</span>
      <span>${branch.committed}</span>
    </div>`).join('');

  return `
    <section class="panel">
      <div class="panel-head">
        <h2>INVENTORY record ${escapeHtml(DEMO_PART.number)}</h2>
        <span class="hint">Exactly as stored — attribute and value marks, not JSON</span>
      </div>
      <div class="record">
        <div>
          <h3>The bytes that came back</h3>
          <p class="caption">${escapeHtml(DEMO_MARKS.attribute)} separates fields,
            ${escapeHtml(DEMO_MARKS.value)} separates values within one.</p>
          <div class="bytes">${markedBytes}</div>
          <ul class="legend">${legendMarkup}</ul>
        </div>
        <div>
          <h3>Fields 2 to 5, read in parallel</h3>
          <p class="caption">Position three of each field belongs to the same branch. Reading
            across positions instead is the mistake that produces a plausible, wrong screen.</p>
          <div class="parallel-head">
            <span>Branch</span><span>Name</span><span>On hand</span><span>Committed</span>
          </div>
          ${parallelRowsMarkup}
        </div>
      </div>
    </section>`;
}

// ── The three screens ───────────────────────────────────────────────────────

/**
 * The guided tour, dimming the page and pointing at the branch table.
 *
 * The spotlight sits on the free-to-sell column because that is the step where
 * the product stops being a lookup and starts being an opinion about what may
 * be promised to a customer.
 */
function createGuidedTourScreen() {
  // The card sits in the flow directly beneath the table it describes, which is
  // where the shipped overlay places it: a table is read downwards, so below is
  // where a card hides the least of what the step is pointing at.
  const tourCardMarkup = `
    <div class="tour-card">
      <p class="count">Step ${DEMO_TOUR_STEP.index} of ${DEMO_TOUR_STEP.total}</p>
      <h2>${escapeHtml(DEMO_TOUR_STEP.title)}</h2>
      <p class="body">${escapeHtml(DEMO_TOUR_STEP.body)}</p>
      <div class="tour-actions">
        <span class="quiet">Skip tour</span>
        <span class="spacer"></span>
        <span class="quiet">Back</span>
        <span class="primary">Next</span>
        <span class="escape">Esc leaves</span>
      </div>
    </div>`;

  return createDocument('U2 Counter — the guided tour', `
    <div class="app">
      ${createHeader('Take the tour')}
      ${createPickers()}
      <div class="main">
        ${createBranchGrid('tour-target')}
        ${tourCardMarkup}
      </div>
      ${createGovernanceStrip()}
    </div>
    <div class="tour-scrim"></div>`);
}

/** The answer to a counter question: the branch table with the figure to quote. */
function createAvailabilityAnswerScreen() {
  return createDocument('U2 Counter — availability by branch', `
    <div class="app">
      ${createHeader('')}
      ${createPickers()}
      <div class="main">
        ${createBranchGrid()}
        ${createRecordPanel()}
      </div>
      ${createGovernanceStrip()}
    </div>`);
}

/** The same question asked in words, with every MCP call and the raw record shown. */
function createMcpTranscriptScreen() {
  return createDocument('U2 Counter — the assistant, and what it asked', `
    <div class="app">
      ${createHeader('')}
      ${createPickers()}
      <div class="main">
        ${createAskPanel()}
        ${createRecordPanel()}
      </div>
      ${createGovernanceStrip()}
    </div>`);
}

/** Maps each U2 Counter showcase feature id to the screen it renders. */
export const U2_COUNTER_SCREEN_BUILDERS = {
  'guided-tour': createGuidedTourScreen,
  'availability-answer': createAvailabilityAnswerScreen,
  'mcp-transcript': createMcpTranscriptScreen,
};
