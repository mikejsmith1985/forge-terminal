// Guards the NodeToolbox portfolio screens.
//
// These replicas are rebuilt from live captures of a real employer workspace,
// so the anonymisation bar is higher here than anywhere else on the site: the
// source images contain real project keys, real colleagues, a real product
// roadmap, and a real corporate hostname. None of it may survive into a
// published screen. Every forbidden string below appears in at least one of
// those captures.

import assert from 'node:assert/strict';
import test from 'node:test';

import { NODETOOLBOX_SCREEN_BUILDERS } from './screens/nodetoolbox-screens.mjs';

const REQUIRED_SCREEN_FEATURE_IDS = [
  'rollup-board',
  'daily-forecast',
  'hygiene-workspace',
  'simple-search',
  'feature-composition',
];

// Real project keys, teams, people, initiatives, and hosts read off the source
// captures. Any one of these on a published screen is a data leak.
const FORBIDDEN_EMPLOYER_STRINGS = [
  // Project and issue keys
  'ENCUC', 'ENFCT', 'DENP', 'MAPD', 'EGFCRA', 'CBAM', 'MMCPROGRAM',
  'CCAM', 'MAPAP', 'CFBTM', 'FNTCA', 'DASTM', 'SCDPT', 'QAPM', 'HSGR',
  // Real people from the captures
  'Somagutta', 'Kasuganti', 'Siddhartha', 'Bhargavi', 'Seastrand',
  'Cavicchio', 'Shadley', 'Quevedo', 'Hemingway', 'Purnell', 'Ferebee',
  'Rashidat', 'Mariah',
  // Real teams, products, vendors, and hosts
  'Transformers', 'Cleanup Crew', 'hcsc', 'EGWP', 'Facets', 'FiServ',
  'Zelis', 'HealthSpring', 'Salesforce', 'GIPM', 'Cignahealthcare',
  'ServiceNow', 'Medicare',
];

// Literal labels from the shipped NodeToolbox UI. Their presence is what makes
// a replica a replica rather than an invented dashboard.
const SCREEN_FIDELITY_MARKERS = {
  'rollup-board': ['UNMAPPED', 'Why is an issue missing?', 'Feature lanes', 'Whole Feature'],
  'daily-forecast': ['CANNOT FORECAST', 'BEHIND', 'START TODAY', 'ON TRACK'],
  'hygiene-workspace': ['Hygiene Score', 'BROKEN', 'UNTIDY', 'DATES FIXABLE', 'CLEAN'],
  'simple-search': ['Portfolio', 'ART', 'Team', 'Match', 'Run search'],
  'feature-composition': [
    'What you are writing from',
    'Readiness checklist',
    'Create Feature in Jira',
    'never suggested',
  ],
};

function renderEveryScreen() {
  return REQUIRED_SCREEN_FEATURE_IDS.map((featureId) => ({
    featureId,
    markup: NODETOOLBOX_SCREEN_BUILDERS[featureId](),
  }));
}

test('every promised NodeToolbox feature resolves to a screen builder', () => {
  for (const featureId of REQUIRED_SCREEN_FEATURE_IDS) {
    assert.equal(
      typeof NODETOOLBOX_SCREEN_BUILDERS[featureId],
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

test('no screen leaks a real project key, colleague, team, product, or host', () => {
  for (const { featureId, markup } of renderEveryScreen()) {
    for (const forbiddenString of FORBIDDEN_EMPLOYER_STRINGS) {
      assert.ok(
        !markup.toLowerCase().includes(forbiddenString.toLowerCase()),
        `${featureId} leaks the employer string "${forbiddenString}".`,
      );
    }
  }
});

test('every issue key on screen uses an invented project prefix', () => {
  // The replicas may only ever use the three invented prefixes agreed for this
  // workspace. Anything else is a key that came from the source capture.
  const allowedKeyPattern = /^(BEN|PGM|MER)-\d+$/;

  for (const { featureId, markup } of renderEveryScreen()) {
    const visibleText = markup
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ');
    const issueKeys = visibleText.match(/\b[A-Z]{2,10}-\d+\b/g) ?? [];

    for (const issueKey of issueKeys) {
      assert.match(
        issueKey,
        allowedKeyPattern,
        `${featureId} shows the issue key "${issueKey}", which is not an invented key.`,
      );
    }
  }
});

test('each screen reproduces the shipped NodeToolbox surface it claims to show', () => {
  for (const { featureId, markup } of renderEveryScreen()) {
    for (const fidelityMarker of SCREEN_FIDELITY_MARKERS[featureId]) {
      assert.ok(
        markup.includes(fidelityMarker),
        `${featureId} is missing the product marker "${fidelityMarker}".`,
      );
    }
  }
});

test('the screens carry the "refuses to guess" thesis, not just data', () => {
  // The entry's whole claim is that the tool reports what it cannot measure.
  // If these honest-uncertainty surfaces vanish from the replicas, the copy
  // stops being supported by the images.
  const screensByFeatureId = Object.fromEntries(
    renderEveryScreen().map(({ featureId, markup }) => [featureId, markup]),
  );

  assert.match(screensByFeatureId['rollup-board'], /No work rolls up to this Feature yet/);
  assert.match(screensByFeatureId['daily-forecast'], /unsized, unowned or undated/i);
  assert.match(screensByFeatureId['hygiene-workspace'], /not auto-fixed/i);
});
