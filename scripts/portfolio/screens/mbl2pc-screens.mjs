// The three MBL2PC portfolio screens, rebuilt from the shipped UI.
//
// MBL2PC is a phone-shaped app, so all three replicas render a narrow portrait
// frame. The screens differ by theme and by which part of the workflow they
// show: the handoff itself in light, the same thread in dark, and a search with
// the snippet drawer open in ocean.
//
// The originals were genuine screenshots of the maintainer's own devices and
// carried a résumé filename with a real name on it, so every value here comes
// from the invented session in the demo-data module instead.

import {
  DEMO_APP_NAME,
  DEMO_BUILD_LABEL,
  DEMO_MESSAGES,
  DEMO_PHONE_LABEL,
  DEMO_PINNED_ROWS,
  DEMO_SEARCH_RESULTS,
  DEMO_SEARCH_TERM,
  DEMO_SNIPPETS,
  DEMO_THEMES,
} from './mbl2pc-demo-data.mjs';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Builds the stylesheet for one theme, so all three screens share a layout. */
function createStylesheet(theme) {
  return `
    * { box-sizing: border-box; }
    body { margin: 0; width: 100vw; background: ${theme.page}; color: ${theme.text};
      font-family: "Segoe UI", Inter, system-ui, sans-serif; font-size: 17px; }
    .phone { display: flex; flex-direction: column; min-height: 100vh; }

    .app-header { display: flex; align-items: center; gap: 14px; padding: 16px 18px;
      background: linear-gradient(120deg, ${theme.headerFrom}, ${theme.headerTo}); color: #fff; }
    .avatar { width: 52px; height: 52px; border-radius: 50%; background: rgba(255,255,255,.22);
      display: flex; align-items: center; justify-content: center; font-size: 22px;
      font-weight: 650; }
    .app-name { font-size: 22px; font-weight: 700; line-height: 1.15; }
    .device-pill { display: flex; align-items: center; gap: 6px; font-size: 15px;
      opacity: .92; border-bottom: 1px dashed rgba(255,255,255,.45); padding-bottom: 2px; }
    .header-icons { margin-left: auto; display: flex; gap: 16px; font-size: 19px; opacity: .95; }

    .pinned { background: ${theme.pinnedBg}; border-bottom: 2px solid ${theme.accent};
      padding: 10px 16px 12px; }
    .pinned-head { display: flex; justify-content: space-between; align-items: center;
      color: #b45309; font-weight: 700; font-size: 16px; margin-bottom: 6px; }
    .pinned-row { display: flex; align-items: center; gap: 14px; padding: 5px 0;
      font-size: 15px; }
    .pinned-row .who { color: ${theme.muted}; flex: 0 0 46px; }
    .pinned-row .what { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden;
      text-overflow: ellipsis; }

    .search { display: flex; align-items: center; gap: 12px; padding: 12px 16px;
      background: ${theme.surface}; }
    .search-box { flex: 1; border: 1px solid ${theme.line}; border-radius: 999px;
      padding: 10px 18px; color: ${theme.muted}; font-size: 16px; background: ${theme.surface}; }
    .search-box.filled { border-color: ${theme.accent}; color: ${theme.text}; }

    .clipboard { display: flex; align-items: center; gap: 10px; padding: 12px 16px;
      background: ${theme.surface}; border-top: 1px solid ${theme.line};
      border-bottom: 1px solid ${theme.line}; font-weight: 650; font-size: 17px; }
    .clipboard .caret { margin-left: auto; color: ${theme.muted}; }

    .thread { flex: 1; padding: 16px 14px; display: flex; flex-direction: column; gap: 14px; }
    .day-divider { display: flex; align-items: center; gap: 12px; color: ${theme.muted};
      font-size: 14px; }
    .day-divider::before, .day-divider::after { content: ''; flex: 1; height: 1px;
      background: ${theme.line}; }
    .day-divider span { background: ${theme.surface}; border-radius: 999px; padding: 3px 16px; }

    .bubble { position: relative; border-radius: 14px; padding: 12px 14px 10px;
      max-width: 88%; }
    .bubble.own { align-self: flex-end; background: ${theme.bubbleOwn}; color: #fff; }
    .bubble.other { align-self: flex-start; background: ${theme.bubbleOther};
      color: ${theme.text}; }
    .bubble.pinned-bubble { border: 3px solid #f5a524; }
    .bubble .star { position: absolute; top: -9px; right: -6px; font-size: 17px; }
    .bubble .who { font-size: 15px; font-weight: 650; margin-bottom: 5px; opacity: .9; }
    .bubble p { margin: 0 0 6px; line-height: 1.4; }
    .bubble .time { text-align: right; font-size: 13px; opacity: .72; }
    .bubble .actions { display: flex; gap: 8px; margin-top: 8px; }
    .bubble .actions span { width: 32px; height: 26px; border-radius: 7px;
      background: rgba(255,255,255,.22); display: flex; align-items: center;
      justify-content: center; font-size: 13px; }
    .bubble.other .actions span { background: rgba(0,0,0,.07); }

    .attachment { display: flex; align-items: center; gap: 12px; border-radius: 10px;
      padding: 11px 13px; margin-bottom: 9px; background: rgba(0,0,0,.09); }
    .bubble.own .attachment { background: rgba(255,255,255,.16); }
    .attachment .glyph { font-size: 22px; }
    .attachment .file-name { font-weight: 650; font-size: 16px; }
    .attachment .file-hint { font-size: 13px; opacity: .74; }

    .snippets { background: ${theme.surface}; border-top: 1px solid ${theme.line};
      padding: 12px 16px 10px; }
    .snippets-head { display: flex; align-items: center; gap: 9px; font-weight: 700;
      font-size: 17px; margin-bottom: 9px; }
    .snippets-head .count { color: ${theme.muted}; font-weight: 400; font-size: 15px; }
    .snippets-head .add { margin-left: auto; width: 32px; height: 32px; border-radius: 50%;
      background: ${theme.accent}; color: #fff; display: flex; align-items: center;
      justify-content: center; }
    .snippet-row { display: flex; align-items: center; gap: 10px; border: 1px solid ${theme.line};
      border-radius: 10px; padding: 9px 12px; margin-bottom: 7px; font-size: 15px; }
    .snippet-row .label { color: ${theme.accent}; font-weight: 700; white-space: nowrap; }
    .snippet-row .preview { color: ${theme.muted}; flex: 1; min-width: 0;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    .composer { display: flex; align-items: center; gap: 11px; padding: 14px 16px 8px;
      background: ${theme.surface}; border-top: 1px solid ${theme.line}; }
    .composer .circle { width: 46px; height: 46px; border-radius: 50%;
      border: 1px solid ${theme.line}; display: flex; align-items: center;
      justify-content: center; font-size: 18px; color: ${theme.muted}; }
    .composer .field { flex: 1; border: 1px solid ${theme.line}; border-radius: 999px;
      padding: 12px 18px; color: ${theme.muted}; font-size: 16px; }
    .composer .send { background: ${theme.accent}; color: #fff; border-color: ${theme.accent}; }
    .build-label { text-align: center; color: ${theme.muted}; font-size: 13px;
      padding: 6px 0 12px; background: ${theme.surface}; }
  `;
}

function createDocument(documentTitle, theme, bodyMarkup) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(documentTitle)}</title>
    <style>${createStylesheet(theme)}</style>
  </head>
  <body>${bodyMarkup}</body>
</html>`;
}

function createHeader() {
  return `
    <div class="app-header">
      <span class="avatar">M</span>
      <span>
        <div class="app-name">${escapeHtml(DEMO_APP_NAME)}</div>
        <div class="device-pill">📱 ${escapeHtml(DEMO_PHONE_LABEL)}</div>
      </span>
      <span class="header-icons">🎨 ☑ 📅 ⇥</span>
    </div>`;
}

function createPinnedPanel(pinnedRows) {
  const rowsMarkup = pinnedRows.map((pinnedRow) => `
    <div class="pinned-row">
      <span class="who">${escapeHtml(pinnedRow.device)}</span>
      <span class="what">${escapeHtml(pinnedRow.preview)}</span>
      <span>📋</span>
    </div>`).join('');

  return `
    <div class="pinned">
      <div class="pinned-head"><span>📌 Pinned</span><span>(${pinnedRows.length})</span></div>
      ${rowsMarkup}
    </div>`;
}

function createSearchBar(searchTerm) {
  const isFilled = Boolean(searchTerm);
  return `
    <div class="search">
      <span>🔍</span>
      <span class="search-box${isFilled ? ' filled' : ''}">${escapeHtml(searchTerm || 'Search messages…')}</span>
    </div>
    <div class="clipboard"><span>📋</span> Clipboard Sync <span class="caret">▾</span></div>`;
}

function createAttachment(attachment) {
  const glyph = attachment.kind === 'zip' ? '🗜' : '📄';
  return `
    <div class="attachment">
      <span class="glyph">${glyph}</span>
      <span>
        <div class="file-name">${escapeHtml(attachment.name)}</div>
        <div class="file-hint">${escapeHtml(attachment.hint)}</div>
      </span>
    </div>`;
}

function createBubble(message) {
  const ownClassName = message.isOwn ? 'own' : 'other';
  const pinnedClassName = message.isPinned ? ' pinned-bubble' : '';
  const starMarkup = message.isPinned ? '<span class="star">⭐</span>' : '';
  const attachmentMarkup = message.attachment ? createAttachment(message.attachment) : '';
  const trailingMarkup = message.trailing ? `<p>${escapeHtml(message.trailing)}</p>` : '';

  return `
    <div class="bubble ${ownClassName}${pinnedClassName}">
      ${starMarkup}
      <div class="who">${escapeHtml(message.device)}</div>
      ${attachmentMarkup}
      <p>${escapeHtml(message.body)}</p>
      ${trailingMarkup}
      <div class="time">${escapeHtml(message.timestamp)}</div>
      <div class="actions"><span>📋</span><span>★</span><span>✕</span></div>
    </div>`;
}

function createSnippetDrawer() {
  const rowsMarkup = DEMO_SNIPPETS.map((snippet) => `
    <div class="snippet-row">
      <span class="label">${escapeHtml(snippet.label)}</span>
      <span class="preview">${escapeHtml(snippet.preview)}</span>
      <span>📋</span><span>✕</span>
    </div>`).join('');

  return `
    <div class="snippets">
      <div class="snippets-head">⚡ Snippets <span class="count">(${DEMO_SNIPPETS.length})</span>
        <span class="add">＋</span></div>
      ${rowsMarkup}
    </div>`;
}

function createSnippetSummary() {
  return `
    <div class="snippets">
      <div class="snippets-head">⚡ Snippets <span class="count">(${DEMO_SNIPPETS.length})</span>
        <span class="add">＋</span></div>
    </div>`;
}

function createComposer() {
  return `
    <div class="composer">
      <span class="circle">📎</span>
      <span class="field">Message…</span>
      <span class="circle">📋</span>
      <span class="circle">⏱</span>
      <span class="circle send">➤</span>
    </div>
    <div class="build-label">${escapeHtml(DEMO_BUILD_LABEL)}</div>`;
}

/** Assembles one phone screen from the parts each variant needs. */
function createPhoneScreen({ theme, searchTerm, messages, pinnedRows, snippetsMarkup }) {
  const threadMarkup = messages.map(createBubble).join('');

  return `
    <div class="phone">
      ${createHeader()}
      ${createPinnedPanel(pinnedRows)}
      ${createSearchBar(searchTerm)}
      <div class="thread">
        <div class="day-divider"><span>Today</span></div>
        ${threadMarkup}
      </div>
      ${snippetsMarkup}
      ${createComposer()}
    </div>`;
}

// ── The three screens ───────────────────────────────────────────────────────

function createLightHandoffScreen() {
  return createDocument('MBL2PC — phone to desktop handoff', DEMO_THEMES.light,
    createPhoneScreen({
      theme: DEMO_THEMES.light,
      searchTerm: '',
      messages: DEMO_MESSAGES,
      pinnedRows: DEMO_PINNED_ROWS,
      snippetsMarkup: createSnippetSummary(),
    }));
}

function createDarkThreadScreen() {
  return createDocument('MBL2PC — dark theme', DEMO_THEMES.dark,
    createPhoneScreen({
      theme: DEMO_THEMES.dark,
      searchTerm: '',
      messages: DEMO_MESSAGES,
      pinnedRows: DEMO_PINNED_ROWS,
      snippetsMarkup: createSnippetSummary(),
    }));
}

function createSearchAndSnippetsScreen() {
  return createDocument('MBL2PC — search and snippets', DEMO_THEMES.ocean,
    createPhoneScreen({
      theme: DEMO_THEMES.ocean,
      searchTerm: DEMO_SEARCH_TERM,
      messages: DEMO_SEARCH_RESULTS,
      pinnedRows: [DEMO_PINNED_ROWS[1]],
      snippetsMarkup: createSnippetDrawer(),
    }));
}

/** Maps each MBL2PC showcase feature id to the screen it renders. */
export const MBL2PC_SCREEN_BUILDERS = {
  'chat-dashboard': createLightHandoffScreen,
  'dark-mode-theme': createDarkThreadScreen,
  'search-and-theme': createSearchAndSnippetsScreen,
};
