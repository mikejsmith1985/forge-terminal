// Guards the U2 Counter portfolio screens.
//
// U2 Counter reads an ERP running on a Pick (MultiValue) database, and the two
// things a reader must be able to trust about these replicas are the two things
// that would be easiest to get wrong. First, that no real business data appears:
// the product runs entirely on a synthetic store, and the screens are rebuilt
// rather than captured, so nothing here should carry a customer, a price, or an
// account that belongs to anybody. Second, that the MultiValue detail is real:
// a replica that draws attribute and value marks as ordinary punctuation would
// be claiming the interesting part of this product without showing it.

import assert from 'node:assert/strict';
import test from 'node:test';

import { U2_COUNTER_SCREEN_BUILDERS } from './screens/u2-counter-screens.mjs';

const REQUIRED_SCREEN_FEATURE_IDS = ['guided-tour', 'availability-answer', 'mcp-transcript'];

// Anything that would identify the maintainer, a real machine, or a real
// customer of the ERP this product reads.
const FORBIDDEN_PRIVATE_STRINGS = [
  'Michael Smith',
  'Michael_Smith',
  'mikejsmith1985',
  'mikej',
  'ProjectsWin',
  'UniVerse licence',
];

// The prototype is deliberately published without a live link, so no screen may
// advertise the deployment it happens to run on.
const FORBIDDEN_DEPLOYMENT_HOSTS = ['core.windows.net', 'azurewebsites.net', 'azurecontainerapps.io'];

// What each replica has to actually contain to be the surface it claims. These
// are the labels a reader recognises from the running product, not decoration.
const SCREEN_FIDELITY_MARKERS = {
  'guided-tour': ['Step', 'Skip tour', 'Next', 'Free to sell'],
  'availability-answer': ['Free to sell', 'On hand', 'Committed', 'Branch'],
  'mcp-transcript': ['MCP', 'INVENTORY', 'read_record', 'Demonstration data'],
};

// The byte-level separators a MultiValue record is made of. A replica that
// omits these is drawing a table, not a Pick record — and the whole claim of
// this product is that the marks are real.
const MULTIVALUE_MARK_GLYPHS = ['þ', 'ý'];

function renderEveryScreen() {
  return REQUIRED_SCREEN_FEATURE_IDS.map((featureId) => ({
    featureId,
    markup: U2_COUNTER_SCREEN_BUILDERS[featureId](),
  }));
}

test('every promised U2 Counter feature resolves to a screen builder', () => {
  for (const featureId of REQUIRED_SCREEN_FEATURE_IDS) {
    assert.equal(
      typeof U2_COUNTER_SCREEN_BUILDERS[featureId],
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

test('no screen carries a real person, machine, or ERP customer', () => {
  for (const { featureId, markup } of renderEveryScreen()) {
    for (const forbiddenString of FORBIDDEN_PRIVATE_STRINGS) {
      assert.doesNotMatch(
        markup,
        new RegExp(forbiddenString, 'i'),
        `${featureId} leaks the private string "${forbiddenString}".`,
      );
    }
  }
});

test('no screen advertises the deployment, because the card publishes no live link', () => {
  for (const { featureId, markup } of renderEveryScreen()) {
    for (const forbiddenHost of FORBIDDEN_DEPLOYMENT_HOSTS) {
      assert.ok(
        !markup.includes(forbiddenHost),
        `${featureId} points at the live deployment (${forbiddenHost}).`,
      );
    }
  }
});

test('each screen reproduces the shipped U2 Counter surface it claims to show', () => {
  for (const { featureId, markup } of renderEveryScreen()) {
    for (const fidelityMarker of SCREEN_FIDELITY_MARKERS[featureId]) {
      assert.ok(
        markup.includes(fidelityMarker),
        `${featureId} is missing the "${fidelityMarker}" surface.`,
      );
    }
  }
});

test('the transcript screen shows real MultiValue marks, not punctuation', () => {
  const transcriptMarkup = U2_COUNTER_SCREEN_BUILDERS['mcp-transcript']();

  for (const markGlyph of MULTIVALUE_MARK_GLYPHS) {
    assert.ok(
      transcriptMarkup.includes(markGlyph),
      `the transcript must render the "${markGlyph}" separator a Pick record actually contains.`,
    );
  }
});

test('every screen says on its face that the data is invented', () => {
  // The governance strip is on every screen in the product for the same reason
  // it is asserted here: a MultiValue record with no badge on it is an image
  // anyone could present in good faith as production data.
  for (const { featureId, markup } of renderEveryScreen()) {
    assert.ok(
      /demonstration data/i.test(markup),
      `${featureId} must carry the demonstration-data badge.`,
    );
  }
});

test('no screen claims the prototype was validated against a live instance', () => {
  for (const { featureId, markup } of renderEveryScreen()) {
    assert.doesNotMatch(
      markup,
      /production data|live instance|production database/i,
      `${featureId} overclaims what this prototype ran against.`,
    );
  }
});
