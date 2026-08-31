// The five LG-Builder portfolio screens, rebuilt from the shipped surfaces.
//
// LG-Builder runs in two places, so the screens do too: the pipeline talks to
// people in a chat channel, and it is governed from an admin console. Two
// replicas reproduce the channel, three reproduce the console.
//
// The through-line every screen has to carry is the entry's claim: the pipeline
// stops and asks a human rather than guessing, and when nobody answers it says
// so out loud instead of quietly proceeding. The pending checkpoint, the SLA
// escalation, and the auto-reject switch are where that is visible.

import {
  DEMO_BOT_NAME,
  DEMO_CHANNELS,
  DEMO_CHECKPOINT,
  DEMO_CLARIFYING_EXCHANGE,
  DEMO_CREATED_ISSUES,
  DEMO_ESCALATION,
  DEMO_PIPELINE,
  DEMO_POLICY,
  DEMO_REVIEW_QUEUE,
  DEMO_SERVER_NAME,
  DEMO_TEST_BOT_NAME,
} from './lgbuilder-demo-data.mjs';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Chat surface ────────────────────────────────────────────────────────────

const CHAT_STYLESHEET = `
  :root {
    --bg: #313338; --rail: #2b2d31; --sidebar: #1e1f22; --text: #dbdee1;
    --muted: #949ba4; --faint: #80848e; --blue: #5865f2; --link: #00a8fc;
    --green: #23a55a; --red: #f23f43; --amber: #f0b132;
    --ui: "gg sans", "Segoe UI", Inter, system-ui, sans-serif;
    --mono: "Cascadia Mono", Consolas, monospace;
  }
  * { box-sizing: border-box; }
  body { margin: 0; width: 100vw; background: var(--bg); color: var(--text);
    font-family: var(--ui); font-size: 15px; line-height: 1.42; }
  .chat-app { display: flex; align-items: stretch; }

  .sidebar { flex: 0 0 240px; background: var(--sidebar); padding: 0 0 14px; }
  .server-name { display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px; font-weight: 650; font-size: 15px; color: #f2f3f5;
    box-shadow: 0 1px 0 rgba(0,0,0,.24); }
  .channel-group { color: var(--faint); font-size: 11px; font-weight: 700;
    letter-spacing: .02em; text-transform: uppercase; padding: 16px 10px 4px 16px; }
  .channel { display: flex; align-items: center; gap: 7px; margin: 1px 8px;
    padding: 6px 8px; border-radius: 4px; color: var(--muted); font-size: 15px; }
  .channel.active { background: #404249; color: #f2f3f5; }
  .channel .hash { color: var(--faint); font-weight: 600; }

  .main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .channel-header { display: flex; align-items: center; gap: 9px; padding: 13px 18px;
    box-shadow: 0 1px 0 rgba(0,0,0,.2); font-weight: 650; color: #f2f3f5; }
  .messages { flex: 1; padding: 14px 18px 26px; }

  .message { display: flex; gap: 14px; padding: 9px 0; }
  .avatar { flex: 0 0 40px; height: 40px; border-radius: 50%;
    background: linear-gradient(135deg, #5865f2, #eb459e); display: flex;
    align-items: center; justify-content: center; font-size: 17px; }
  .avatar.reviewer { background: linear-gradient(135deg, #1abc9c, #3498db); }
  .message-body { flex: 1; min-width: 0; }
  .author-line { display: flex; align-items: baseline; gap: 8px; margin-bottom: 3px; }
  .author { font-weight: 650; color: #f2f3f5; }
  .app-tag { background: var(--blue); color: #fff; border-radius: 3px; padding: 0 4px;
    font-size: 10px; font-weight: 600; text-transform: uppercase; }
  .timestamp { color: var(--faint); font-size: 12px; }
  .message-title { font-weight: 650; color: #f2f3f5; margin-bottom: 4px; }
  .message p { margin: 0 0 5px; }
  .code { background: #1e1f22; border-radius: 3px; padding: 1px 5px;
    font-family: var(--mono); font-size: 13px; color: #dbdee1; }
  .link { color: var(--link); }
  .quote { border-left: 4px solid #4e5058; padding-left: 12px; margin: 6px 0;
    color: var(--muted); }
  .divider { border: 0; border-top: 1px solid #3f4147; margin: 14px 0; }
  .reply-hint { display: flex; gap: 7px; margin-top: 7px; }
  .reply-hint .glyph { color: var(--link); }
  .decision-list { margin: 5px 0 0; padding-left: 4px; list-style: none; }
  .decision-list li { padding: 2px 0; }
  .mention { background: rgba(88,101,242,.3); color: #c9cdfb; border-radius: 3px;
    padding: 0 3px; font-weight: 600; }
  .escalation { border-left: 4px solid var(--amber); padding-left: 14px; }
  .rejected-title { color: var(--red); font-weight: 650; }
  .question-block { margin-bottom: 12px; }
  .question-block b { color: #f2f3f5; display: block; margin-bottom: 2px; }
  .question-block span { color: var(--muted); }
  .numbered { padding-left: 20px; margin: 4px 0; }
  .numbered li { margin-bottom: 8px; color: var(--muted); }
`;

function createChatDocument(documentTitle, bodyMarkup) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(documentTitle)}</title>
    <style>${CHAT_STYLESHEET}</style>
  </head>
  <body>${bodyMarkup}</body>
</html>`;
}

function createChannelSidebar(activeChannelName) {
  const channelsMarkup = DEMO_CHANNELS.map((channel) => {
    const activeClassName = channel.name === activeChannelName ? ' active' : '';
    const glyph = channel.kind === 'forum' ? '🗨' : '#';
    return `<div class="channel${activeClassName}"><span class="hash">${glyph}</span>
      ${escapeHtml(channel.name)}</div>`;
  }).join('');

  return `
    <div class="sidebar">
      <div class="server-name">${escapeHtml(DEMO_SERVER_NAME)} <span>⌄</span></div>
      <div class="channel-group">Text Channels</div>
      ${channelsMarkup}
    </div>`;
}

function createChatShell(activeChannelName, messagesMarkup) {
  return `
    <div class="chat-app">
      ${createChannelSidebar(activeChannelName)}
      <div class="main">
        <div class="channel-header"><span class="hash">#</span> ${escapeHtml(activeChannelName)}</div>
        <div class="messages">${messagesMarkup}</div>
      </div>
    </div>`;
}

function createBotMessage(authorName, timestamp, bodyMarkup, avatarClassName = '') {
  return `
    <div class="message">
      <div class="avatar ${avatarClassName}">${avatarClassName ? '🧑‍💻' : '🤖'}</div>
      <div class="message-body">
        <div class="author-line">
          <span class="author">${escapeHtml(authorName)}</span>
          <span class="app-tag">App</span>
          <span class="timestamp">${escapeHtml(timestamp)}</span>
        </div>
        ${bodyMarkup}
      </div>
    </div>`;
}

// ── Screen 1 — the checkpoint the pipeline will not pass without a human ────

function createHitlCheckpointScreen() {
  const checkpoint = DEMO_CHECKPOINT;

  const questionsMarkup = DEMO_CLARIFYING_EXCHANGE.questions.map((question) => `
    <div class="question-block">
      <b>${escapeHtml(question.heading)}</b>
      <span>${escapeHtml(question.answer)}</span>
    </div>`).join('');

  const decisionsMarkup = checkpoint.decisions.map((decision) => `
    <li><span class="code">${escapeHtml(decision.keyword)}</span> — ${escapeHtml(decision.meaning)}</li>`).join('');

  const issuesMarkup = DEMO_CREATED_ISSUES.map((createdIssue) => `
    <p>✅ <b>Issue created</b> — <span class="link">${escapeHtml(createdIssue.jiraKey)}</span><br />
      Ticket: ${escapeHtml(createdIssue.ticketId)}<br />
      Open a PR with <span class="code">${escapeHtml(createdIssue.jiraKey)}</span> in the branch
      name and the workflow will auto-detect it.</p>`).join('');

  const messagesMarkup = `
    ${createBotMessage(DEMO_BOT_NAME, 'Today at 10:41', `
      <p>👋 I need Product Owner input before I can continue this workflow.</p>
      <p>📋 <b>Ticket:</b> ${escapeHtml(checkpoint.ticketId)} — ${escapeHtml(checkpoint.ticketTitle)}</p>`)}

    ${createBotMessage(DEMO_TEST_BOT_NAME, 'Today at 10:44', `
      <div class="message-title">PO answers — ${escapeHtml(checkpoint.ticketId)} task summary view</div>
      <hr class="divider" />
      ${questionsMarkup}`, 'reviewer')}

    ${createBotMessage(DEMO_BOT_NAME, 'Today at 10:45', issuesMarkup)}

    ${createBotMessage(DEMO_BOT_NAME, 'Today at 10:45', `
      <div class="message-title">⏸ HITL Checkpoint — action required</div>
      <p>Stage: <span class="code">${escapeHtml(checkpoint.stage)}</span> |
        Checkpoint: <span class="code">${escapeHtml(checkpoint.checkpointId)}</span></p>
      <p>Agent: ${escapeHtml(checkpoint.agent)} | Status: ${escapeHtml(checkpoint.status)}</p>
      <p>Review at: <span class="link">${escapeHtml(checkpoint.reviewUrl)}</span></p>
      <div class="reply-hint"><span class="glyph">↩</span>
        <span><b>Reply with your review decision</b> — one of:</span></div>
      <ul class="decision-list">${decisionsMarkup}</ul>`)}

    ${createBotMessage(DEMO_TEST_BOT_NAME, 'Today at 10:47', `
      <p><span class="link">${escapeHtml(checkpoint.pullRequestUrl)}</span></p>`, 'reviewer')}`;

  return createChatDocument(
    'LG-Builder — human-in-the-loop checkpoint',
    createChatShell('delivery-chat', messagesMarkup),
  );
}

// ── Screen 2 — escalation, then an honest auto-reject ───────────────────────

function createSlaEscalationScreen() {
  const escalation = DEMO_ESCALATION;

  const questionsMarkup = escalation.outstandingQuestions
    .map((question) => `<li>${escapeHtml(question)}</li>`)
    .join('');

  const messagesMarkup = `
    ${createBotMessage(DEMO_BOT_NAME, 'Today at 12:45', `
      <div class="message-title rejected-title">⛔ AUTO-REJECTED — SLA expired after
        ${escalation.autoRejectMinutes} minutes</div>
      <p>Checkpoint <span class="code">waiting_po_input_20260826_164137</span>
        ${escapeHtml(escalation.autoRejectNotice)}</p>
      <p>${escapeHtml(escalation.ticketOutcome)}</p>
      <p>Review at: <span class="link">${escapeHtml(escalation.reviewUrl)}</span></p>`)}

    <div class="escalation">
      ${createBotMessage(DEMO_BOT_NAME, 'Today at 12:54', `
        <div class="message-title">🚨 <span class="mention">@here</span>
          SLA ESCALATION — PRODUCT OWNER RESPONSE OVERDUE</div>
        <p>Checkpoint <span class="code">${escapeHtml(escalation.checkpointId)}</span> has been
          waiting for <b>${escalation.waitedMinutes} minutes</b> with no response.</p>
        <p>Workflow: ${escapeHtml(escalation.workflow)}</p>
        <p>📋 <b>Ticket:</b> ${escapeHtml(escalation.ticketId)} — ${escapeHtml(escalation.ticketTitle)}</p>
        <div class="quote">${escapeHtml(escalation.ticketExcerpt)}</div>
        <p><b>Questions awaiting an answer:</b></p>
        <ol class="numbered">${questionsMarkup}</ol>
        <div class="reply-hint"><span class="glyph">↩</span>
          <span><b>A senior reviewer can resolve this right here</b> — reply with your decision:
          answer the questions, say <b>approve</b> to proceed, or <b>reject</b> with a reason.</span></div>
        <p>Auto-reject fires in <b>${escalation.remainingMinutes} more minutes</b> if no decision
          is received.</p>
        <p>Or review in the console: <span class="link">${escapeHtml(escalation.reviewUrl)}</span></p>`)}
    </div>

    ${createBotMessage(DEMO_BOT_NAME, 'Today at 12:57', `
      <div class="message-title rejected-title">⛔ AUTO-REJECTED — SLA expired after
        ${escalation.autoRejectMinutes} minutes</div>
      <p>Checkpoint <span class="code">${escapeHtml(escalation.checkpointId)}</span>
        ${escapeHtml(escalation.autoRejectNotice)}</p>
      <p>${escapeHtml(escalation.ticketOutcome)}</p>`)}`;

  return createChatDocument(
    'LG-Builder — SLA escalation and auto-reject',
    createChatShell('escalation-chat', messagesMarkup),
  );
}

// ── Admin console surface ───────────────────────────────────────────────────

const CONSOLE_STYLESHEET = `
  :root {
    --bg: #080d16; --panel: #0d1420; --raised: #111a28; --line: #1d2836;
    --text: #dbe4f0; --muted: #7f93ac; --faint: #5b6b80;
    --teal: #22d3ee; --blue: #3b82f6; --green: #34d399; --amber: #fbbf24;
    --red: #f87171; --violet: #a78bfa;
    --ui: "Segoe UI", Inter, system-ui, sans-serif;
    --mono: "Cascadia Mono", Consolas, monospace;
  }
  * { box-sizing: border-box; }
  body { margin: 0; width: 100vw; background: var(--bg); color: var(--text);
    font-family: var(--ui); font-size: 14px; }
  .console { display: flex; align-items: stretch; }

  .console-rail { flex: 0 0 250px; background: linear-gradient(180deg,#0c1420,#080d16);
    border-right: 1px solid var(--line); padding: 18px 0; }
  .brand { display: flex; align-items: center; gap: 11px; padding: 0 18px 22px; }
  .brand-mark { width: 34px; height: 34px; border-radius: 9px;
    background: linear-gradient(135deg,var(--teal),var(--blue)); display: flex;
    align-items: center; justify-content: center; color: #04222a; font-weight: 800; }
  .brand-name { font-weight: 650; color: #eaf2ff; line-height: 1.2; }
  .brand-sub { color: var(--faint); font-size: 11px; }
  .rail-item { display: flex; align-items: center; gap: 11px; margin: 2px 10px;
    padding: 9px 12px; border-radius: 7px; color: var(--muted); font-size: 13.5px; }
  .rail-item.active { background: rgba(34,211,238,.09); color: var(--teal);
    box-shadow: inset 2px 0 0 var(--teal); }

  .console-main { flex: 1; min-width: 0; padding: 20px 26px 34px; }
  .console-tabs { display: flex; gap: 22px; border-bottom: 1px solid var(--line);
    margin-bottom: 22px; }
  .console-tabs span { padding: 0 0 10px; color: var(--muted); font-size: 13.5px; }
  .console-tabs span.active { color: var(--teal); box-shadow: inset 0 -2px 0 var(--teal); }
  h1 { margin: 0 0 5px; font-size: 26px; letter-spacing: -.02em; }
  .page-sub { margin: 0 0 20px; color: var(--muted); font-size: 13.5px; }

  .info-panel { border: 1px solid var(--line); border-left: 3px solid var(--teal);
    border-radius: 8px; padding: 13px 16px; margin-bottom: 18px; background: var(--panel);
    color: var(--muted); font-size: 12.5px; line-height: 1.6; }
  .info-panel b { color: var(--text); }
  .section-label { color: var(--faint); font-size: 10.5px; font-weight: 700;
    letter-spacing: .1em; text-transform: uppercase; margin: 22px 0 9px; }
  .filters { display: flex; gap: 8px; margin-bottom: 16px; }
  .filters span { border: 1px solid var(--line); border-radius: 999px; padding: 5px 14px;
    font-size: 12.5px; color: var(--muted); }
  .filters span.active { background: rgba(34,211,238,.11); border-color: var(--teal);
    color: var(--teal); }

  .row { display: flex; align-items: center; gap: 14px; background: var(--panel);
    border: 1px solid var(--line); border-radius: 9px; padding: 12px 15px; margin-bottom: 8px; }
  .row-key { font-family: var(--mono); font-size: 12px; color: var(--teal); white-space: nowrap; }
  .row-main { flex: 1; min-width: 0; }
  .row-title { font-size: 13.5px; color: var(--text); }
  .row-detail { font-size: 11.5px; color: var(--faint); margin-top: 2px; }
  .row-side { text-align: right; white-space: nowrap; }
  .pill { display: inline-block; border-radius: 999px; padding: 2px 11px; font-size: 11px;
    font-weight: 650; }
  .pill-hitl { background: rgba(251,191,36,.14); color: var(--amber); }
  .pill-building { background: rgba(59,130,246,.16); color: #93c5fd; }
  .pill-production { background: rgba(52,211,153,.14); color: var(--green); }
  .pill-complete { background: rgba(127,147,172,.14); color: var(--muted); }
  .pill-approved { background: rgba(52,211,153,.14); color: var(--green); }
  .pill-rejected { background: rgba(248,113,113,.14); color: var(--red); }
  .pill-auto { background: rgba(167,139,250,.16); color: var(--violet); }
  .pill-escalated { background: rgba(248,113,113,.16); color: var(--red); }
  .row-time { display: block; color: var(--faint); font-size: 11px; margin-top: 4px; }

  .close-loop { border: 1px solid var(--line); border-radius: 9px; padding: 14px 16px;
    background: var(--panel); }
  .close-loop-head { display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 9px; }
  .close-loop-head h3 { margin: 0; font-size: 14px; }
  .loop-line { font-size: 12.5px; color: var(--muted); }
  .loop-line b { color: var(--teal); font-family: var(--mono); font-size: 12px; }

  .field-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr));
    gap: 15px 22px; }
  .field label { display: block; color: var(--muted); font-size: 12px; margin-bottom: 5px; }
  .field .value { background: #060b13; border: 1px solid var(--line); border-radius: 7px;
    padding: 9px 12px; font-size: 13px; color: var(--text); }
  .field .value.tall { min-height: 62px; }
  .field .note { color: var(--faint); font-size: 11px; margin-top: 5px; }
  .toggle-row { display: flex; align-items: center; gap: 11px; padding: 7px 0;
    font-size: 13px; color: var(--text); }
  .switch { width: 34px; height: 18px; border-radius: 999px; background: var(--teal);
    position: relative; flex: 0 0 auto; }
  .switch::after { content: ''; position: absolute; top: 3px; right: 3px; width: 12px;
    height: 12px; border-radius: 50%; background: #04222a; }
  .actions { display: flex; gap: 10px; margin-top: 22px; }
  .actions .primary { background: rgba(34,211,238,.16); border: 1px solid var(--teal);
    color: var(--teal); border-radius: 7px; padding: 9px 20px; font-size: 13px;
    font-weight: 650; }
  .actions .ghost { border: 1px solid var(--line); border-radius: 7px; padding: 9px 20px;
    font-size: 13px; color: var(--muted); }
`;

const CONSOLE_RAIL_ITEMS = [
  { label: 'Monitor', glyph: '⟳' },
  { label: 'Review Queue', glyph: '✦' },
  { label: 'Automation', glyph: '◆' },
  { label: 'Configuration', glyph: '⬡' },
  { label: 'Repos & Apps', glyph: '▦' },
];

function createConsoleDocument(documentTitle, bodyMarkup) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(documentTitle)}</title>
    <style>${CONSOLE_STYLESHEET}</style>
  </head>
  <body>${bodyMarkup}</body>
</html>`;
}

function createConsoleShell(activeRailLabel, mainMarkup) {
  const railMarkup = CONSOLE_RAIL_ITEMS.map((railItem) => {
    const activeClassName = railItem.label === activeRailLabel ? ' active' : '';
    return `<div class="rail-item${activeClassName}">${railItem.glyph} ${escapeHtml(railItem.label)}</div>`;
  }).join('');

  return `
    <div class="console">
      <div class="console-rail">
        <div class="brand">
          <span class="brand-mark">L</span>
          <span><span class="brand-name">Admin Console</span><br />
            <span class="brand-sub">Control Plane</span></span>
        </div>
        ${railMarkup}
      </div>
      <div class="console-main">${mainMarkup}</div>
    </div>`;
}

function createConsoleTabs(tabLabels, activeTabLabel) {
  return `<div class="console-tabs">${tabLabels.map((tabLabel) => {
    const activeClassName = tabLabel === activeTabLabel ? ' class="active"' : '';
    return `<span${activeClassName}>${escapeHtml(tabLabel)}</span>`;
  }).join('')}</div>`;
}

// ── Screen 3 — the review queue a human resolves from ───────────────────────

function createReviewQueueScreen() {
  const pendingMarkup = DEMO_REVIEW_QUEUE.pendingEvents.map((pendingEvent) => `
    <div class="row">
      <span class="row-key">${escapeHtml(pendingEvent.ticketId)}</span>
      <div class="row-main">
        <div class="row-title">${escapeHtml(pendingEvent.title)}</div>
        <div class="row-detail">Stage ${escapeHtml(pendingEvent.stage)} ·
          waiting on ${escapeHtml(pendingEvent.waitingFor)}</div>
      </div>
      <div class="row-side">
        <span class="pill ${pendingEvent.isEscalated ? 'pill-escalated' : 'pill-hitl'}">
          ${pendingEvent.isEscalated ? 'Escalated' : 'Pending'}</span>
        <span class="row-time">${escapeHtml(pendingEvent.age)}</span>
      </div>
    </div>`).join('');

  const historyMarkup = DEMO_REVIEW_QUEUE.decisionHistory.map((decision) => `
    <div class="row">
      <span class="row-key">${escapeHtml(decision.ticketId)}</span>
      <div class="row-main">
        <div class="row-title">${escapeHtml(decision.title)}</div>
        <div class="row-detail">${escapeHtml(decision.decidedBy)}</div>
      </div>
      <div class="row-side">
        <span class="pill pill-${escapeHtml(decision.tone)}">${escapeHtml(decision.decision)}</span>
        <span class="row-time">${escapeHtml(decision.resolvedAfter)}</span>
      </div>
    </div>`).join('');

  const mainMarkup = `
    <h1>Review Queue</h1>
    <p class="page-sub">Tickets the workflow paused on because it needed human input.
      Review the context, then approve, reject, or request changes.</p>
    <div class="info-panel"><b>How this works.</b>
      ${escapeHtml(DEMO_REVIEW_QUEUE.explanation)}</div>
    <div class="section-label">Pending events</div>
    ${pendingMarkup}
    <div class="section-label">Decision history</div>
    ${historyMarkup}`;

  return createConsoleDocument(
    'LG-Builder — review queue',
    createConsoleShell('Review Queue', mainMarkup),
  );
}

// ── Screen 4 — the pipeline, ticket to production and back ──────────────────

function createPipelineScreen() {
  const filtersMarkup = DEMO_PIPELINE.filters.map((filterLabel) => {
    const activeClassName = filterLabel === DEMO_PIPELINE.activeFilter ? ' class="active"' : '';
    return `<span${activeClassName}>${escapeHtml(filterLabel)}</span>`;
  }).join('');

  const runsMarkup = DEMO_PIPELINE.runs.map((pipelineRun) => `
    <div class="row">
      <span class="row-key">${escapeHtml(pipelineRun.ticketId)}</span>
      <div class="row-main">
        <div class="row-title">${escapeHtml(pipelineRun.title)}</div>
        <div class="row-detail">${escapeHtml(pipelineRun.jiraKey)} · ${escapeHtml(pipelineRun.detail)}</div>
      </div>
      <div class="row-side">
        <span class="pill pill-${escapeHtml(pipelineRun.tone)}">${escapeHtml(pipelineRun.stage)}</span>
        <span class="row-time">${escapeHtml(pipelineRun.duration)}</span>
      </div>
    </div>`).join('');

  const loopMarkup = DEMO_PIPELINE.closeLoop.map((loopEntry) => `
    <p class="loop-line">${escapeHtml(loopEntry.detectedFrom)} →
      raised as <b>${escapeHtml(loopEntry.raisedAs)}</b> from
      <b>${escapeHtml(loopEntry.sourceTicket)}</b><br />${escapeHtml(loopEntry.note)}</p>`).join('');

  const mainMarkup = `
    ${createConsoleTabs(['Overview', 'Pipeline', 'Metrics', 'Live'], 'Pipeline')}
    <h1>Pipeline</h1>
    <p class="page-sub">${escapeHtml(DEMO_PIPELINE.subtitle)}</p>
    <div class="filters">${filtersMarkup}</div>
    ${runsMarkup}
    <div class="section-label">Close-Loop Status</div>
    <div class="close-loop">
      <div class="close-loop-head"><h3>Defects found in production re-enter intake</h3>
        <span class="row-time">Updated just now</span></div>
      ${loopMarkup}
    </div>`;

  return createConsoleDocument(
    'LG-Builder — delivery pipeline',
    createConsoleShell('Monitor', mainMarkup),
  );
}

// ── Screen 5 — the governance dial ──────────────────────────────────────────

function createAutomationPolicyScreen() {
  const policy = DEMO_POLICY;

  const mainMarkup = `
    ${createConsoleTabs(['Workflows', 'Agents', 'Policy'], 'Policy')}
    <h1>Policy</h1>
    <p class="page-sub">${escapeHtml(policy.description)}</p>
    <div class="section-label">Conversation policy</div>
    <div class="info-panel">Controls how long the workflow waits for Product Owner responses
      and when escalation occurs.</div>
    <div class="field-grid">
      <div class="field"><label>Primary channel</label>
        <div class="value">${escapeHtml(policy.primaryChannel)}</div></div>
      <div class="field"><label>Wait for response (minutes)</label>
        <div class="value">${policy.waitForResponseMinutes}</div></div>
      <div class="field"><label>Wait after escalation (minutes)</label>
        <div class="value">${policy.waitAfterEscalationMinutes}</div></div>
      <div class="field">
        <div class="toggle-row"><span class="switch"></span>
          Auto-reject if still unresolved after escalation</div>
        <div class="toggle-row"><span class="switch"></span>
          Allow ticket reopen after rejection</div>
      </div>
      <div class="field"><label>Multi-channel response policy</label>
        <div class="value">${escapeHtml(policy.multiChannelPolicy)}</div></div>
      <div class="field"><label>Escalation channel webhook</label>
        <div class="value">${escapeHtml(policy.escalationWebhookLabel)}</div>
        <div class="note">${escapeHtml(policy.escalationWebhookNote)}</div></div>
      <div class="field" style="grid-column:1 / -1;"><label>Plain-language guidance</label>
        <div class="value tall">${escapeHtml(policy.plainLanguageGuidance)}</div></div>
    </div>
    <div class="actions">
      <span class="primary">Save Runtime Settings</span><span class="ghost">Refresh</span>
    </div>`;

  return createConsoleDocument(
    'LG-Builder — automation policy',
    createConsoleShell('Automation', mainMarkup),
  );
}

// ── Registry consumed by the portfolio capture runner ───────────────────────

/** Maps each LG-Builder showcase feature id to the screen it renders. */
export const LGBUILDER_SCREEN_BUILDERS = {
  'hitl-checkpoint': createHitlCheckpointScreen,
  'sla-escalation': createSlaEscalationScreen,
  'review-queue': createReviewQueueScreen,
  'pipeline-view': createPipelineScreen,
  'automation-policy': createAutomationPolicyScreen,
};
