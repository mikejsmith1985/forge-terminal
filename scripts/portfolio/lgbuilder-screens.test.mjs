// Guards the LG-Builder portfolio screens.
//
// Two of these replicas are rebuilt from captures of a real Discord workspace
// and three from a running admin console, so they carry the same anonymisation
// burden as the rest of the site: the source material shows a real server, real
// colleagues, real ticket and issue identifiers, and a live webhook URL. None
// of it may survive into a published screen.

import assert from 'node:assert/strict';
import test from 'node:test';

import { LGBUILDER_SCREEN_BUILDERS } from './screens/lgbuilder-screens.mjs';

const REQUIRED_SCREEN_FEATURE_IDS = [
  'hitl-checkpoint',
  'sla-escalation',
  'review-queue',
  'pipeline-view',
  'automation-policy',
];

// Identifiers read off the source captures and the running console.
const FORBIDDEN_PRIVATE_STRINGS = [
  'SmithWorksApps',
  'smithbros',
  'DBAI',
  'SBRO-',
  'INC0010136', 'INC0010137', 'INC0010138', 'INC0010144',
  'sim-hitl',
  'poc-chat', 'poc-escalation-chat', 'poc-intake',
  'Chuck', 'Daniel', 'John', 'Mike',
  'ProjectsWin',
  'mikejsmith1985',
  'discord.com/api/webhooks/1510',
];

// Literal labels from the shipped surfaces, so a replica cannot drift into a
// generic dashboard that happens to mention AI.
const SCREEN_FIDELITY_MARKERS = {
  'hitl-checkpoint': ['HITL Checkpoint', 'action required', 'Checkpoint:', 'approve'],
  'sla-escalation': ['SLA ESCALATION', 'AUTO-REJECTED', 'SLA expired'],
  'review-queue': ['Review Queue', 'PENDING EVENTS', 'DECISION HISTORY'],
  'pipeline-view': ['Pipeline', 'Pending HITL', 'Building', 'In Production', 'Close-Loop Status'],
  'automation-policy': [
    'CONVERSATION POLICY',
    'Wait for response',
    'Auto-reject if still unresolved after escalation',
  ],
};

function renderEveryScreen() {
  return REQUIRED_SCREEN_FEATURE_IDS.map((featureId) => ({
    featureId,
    markup: LGBUILDER_SCREEN_BUILDERS[featureId](),
  }));
}

test('every promised LG-Builder feature resolves to a screen builder', () => {
  for (const featureId of REQUIRED_SCREEN_FEATURE_IDS) {
    assert.equal(
      typeof LGBUILDER_SCREEN_BUILDERS[featureId],
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

test('no screen leaks a real server, colleague, identifier, or webhook', () => {
  for (const { featureId, markup } of renderEveryScreen()) {
    for (const forbiddenString of FORBIDDEN_PRIVATE_STRINGS) {
      assert.ok(
        !markup.toLowerCase().includes(forbiddenString.toLowerCase()),
        `${featureId} leaks the private string "${forbiddenString}".`,
      );
    }
  }
});

test('no screen shows a usable webhook or credential', () => {
  // A webhook URL is a credential: anyone holding it can post to the channel.
  // The screens may show the field, never a working value.
  for (const { featureId, markup } of renderEveryScreen()) {
    const visibleText = markup
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ');

    assert.ok(
      !/discord\.com\/api\/webhooks\/\d{6,}/.test(visibleText),
      `${featureId} shows what looks like a live webhook URL.`,
    );
    // A checkpoint id like build_waiting_pr_review_20260826_104512 is long but
    // is the product's own vocabulary, so readable snake_case is allowed. A
    // credential is an undifferentiated run of characters, and is not.
    const longRuns = visibleText.match(/\b[A-Za-z0-9_-]{32,}\b/g) ?? [];
    const opaqueRuns = longRuns.filter(
      (longRun) => !/^[a-z]+(?:[_-][a-z0-9]+)+$/.test(longRun),
    );

    assert.deepEqual(
      opaqueRuns,
      [],
      `${featureId} shows value(s) that look like live credentials: ${opaqueRuns.join(', ')}`,
    );
  }
});

test('each screen reproduces the surface it claims to show', () => {
  for (const { featureId, markup } of renderEveryScreen()) {
    for (const fidelityMarker of SCREEN_FIDELITY_MARKERS[featureId]) {
      // Compared case-insensitively: several of these labels are uppercased by
      // CSS in the shipped UI, so the source casing is not what is being
      // asserted — the label's presence is.
      assert.ok(
        markup.toLowerCase().includes(fidelityMarker.toLowerCase()),
        `${featureId} is missing the product marker "${fidelityMarker}".`,
      );
    }
  }
});

test('the screens carry the "stops and asks" thesis, not just a dashboard', () => {
  // The entry's claim is that the pipeline refuses to proceed without a human
  // decision, and says so out loud when nobody answers. If these surfaces go,
  // the copy is no longer supported by the images.
  const screensByFeatureId = Object.fromEntries(
    renderEveryScreen().map(({ featureId, markup }) => [featureId, markup]),
  );

  assert.match(screensByFeatureId['hitl-checkpoint'], /Status: pending/);
  assert.match(screensByFeatureId['sla-escalation'], /no Product Owner decision was received/i);
  assert.match(screensByFeatureId['automation-policy'], /Auto-reject if still unresolved/);
});
