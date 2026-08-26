// Guards the MBL2PC portfolio screens.
//
// These were the last screens on the site still publishing genuine captures.
// They were real screenshots of the maintainer's own devices, and one of them
// showed a résumé filename carrying a real name — so the replicas that replaced
// them must not reintroduce any of it.

import assert from 'node:assert/strict';
import test from 'node:test';

import { MBL2PC_SCREEN_BUILDERS } from './screens/mbl2pc-screens.mjs';

const REQUIRED_SCREEN_FEATURE_IDS = ['chat-dashboard', 'dark-mode-theme', 'search-and-theme'];

// Everything the original captures showed that identifies a real person.
const FORBIDDEN_PRIVATE_STRINGS = [
  'Michael_Smith',
  'Michael Smith',
  'mikejsmith1985',
  'mikej',
  'Resume_2026',
  'iPhone',
  'ProjectsWin',
];

const SCREEN_FIDELITY_MARKERS = {
  'chat-dashboard': ['Pinned', 'Clipboard Sync', 'Snippets', 'Tap to download'],
  'dark-mode-theme': ['Pinned', 'Clipboard Sync', 'Snippets'],
  'search-and-theme': ['Clipboard Sync', 'Snippets', 'Intro note', 'PC link'],
};

function renderEveryScreen() {
  return REQUIRED_SCREEN_FEATURE_IDS.map((featureId) => ({
    featureId,
    markup: MBL2PC_SCREEN_BUILDERS[featureId](),
  }));
}

test('every promised MBL2PC feature resolves to a screen builder', () => {
  for (const featureId of REQUIRED_SCREEN_FEATURE_IDS) {
    assert.equal(
      typeof MBL2PC_SCREEN_BUILDERS[featureId],
      'function',
      `${featureId} must have a screen builder.`,
    );
  }
});

test('every screen renders a complete standalone HTML document', () => {
  for (const { featureId, markup } of renderEveryScreen()) {
    assert.match(markup, /^<!doctype html>/i, `${featureId} must render a full document.`);
    assert.match(markup, /<\/html>\s*$/i, `${featureId} must close its document.`);
    assert.ok(markup.length > 2000, `${featureId} looks too sparse to be a product screen.`);
  }
});

test('no screen reintroduces a real name, filename, or device', () => {
  for (const { featureId, markup } of renderEveryScreen()) {
    for (const forbiddenString of FORBIDDEN_PRIVATE_STRINGS) {
      assert.ok(
        !markup.toLowerCase().includes(forbiddenString.toLowerCase()),
        `${featureId} leaks the private string "${forbiddenString}".`,
      );
    }
  }
});

test('no attached filename carries a personal name', () => {
  // The original capture's résumé filename is exactly the failure being
  // guarded here, so any attachment shown must read as a work artefact.
  for (const { featureId, markup } of renderEveryScreen()) {
    const attachmentNames = markup.match(/class="file-name">([^<]+)</g) ?? [];

    for (const attachmentName of attachmentNames) {
      assert.doesNotMatch(
        attachmentName,
        /[A-Z][a-z]+_[A-Z][a-z]+/,
        `${featureId} shows a filename shaped like a person's name: ${attachmentName}`,
      );
    }
  }
});

test('each screen reproduces the surface it claims to show', () => {
  for (const { featureId, markup } of renderEveryScreen()) {
    for (const fidelityMarker of SCREEN_FIDELITY_MARKERS[featureId]) {
      assert.ok(
        markup.includes(fidelityMarker),
        `${featureId} is missing the product marker "${fidelityMarker}".`,
      );
    }
  }
});

test('the three screens are genuinely different views, not one screen recoloured', () => {
  const [lightScreen, darkScreen, searchScreen] = renderEveryScreen().map(({ markup }) => markup);

  assert.notEqual(lightScreen, darkScreen, 'the dark screen must differ from the light one.');
  // The search screen is the one that proves the product does more than chat.
  // Matched on the rendered element rather than the class name, which appears
  // in every document's stylesheet whether the drawer is open or not.
  assert.match(searchScreen, /class="search-box filled"/);
  assert.match(searchScreen, /<div class="snippet-row">/);
  assert.doesNotMatch(lightScreen, /<div class="snippet-row">/);
});
