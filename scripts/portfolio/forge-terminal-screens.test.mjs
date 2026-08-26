// Guards the Forge Terminal portfolio screens: they must mirror the shipped UI
// while containing zero real workspace, project, or credential data.
//
// Two things can go wrong when a portfolio screen is rebuilt from a real
// screenshot. It can drift away from the product (marketing mockup instead of
// the actual UI), or it can leak the private data that was on screen when the
// reference screenshot was taken. Every test below defends one of those.

import assert from 'node:assert/strict';
import test from 'node:test';

import { FORGE_TERMINAL_SCREEN_BUILDERS } from './screens/forge-terminal-screens.mjs';

// Feature ids the Forge Terminal portfolio card promises to illustrate.
// Each one must resolve to a screen builder, or a card renders a broken image.
const REQUIRED_SCREEN_FEATURE_IDS = [
  'multi-tab-terminal',
  'context-engineering',
  'mcp-integration',
  'release-manager',
  'web-app-debugger',
  'secret-vault',
];

// Strings that only ever appear in the maintainer's private environment.
// If any reaches a published screen, real data escaped the anonymisation pass.
const FORBIDDEN_PRIVATE_STRINGS = [
  'mikej',
  'mikejsmith1985',
  'C:\\Users\\mikej',
  'ProjectsWin',
  'NodeToolbox',
  'mbl2pc',
  'TranscriptBoss',
  'discord-snow-bot',
  'AzureWorkflowPOC',
  'Onefinity',
  'CLOUDFLARE_API_TOKEN',
  'SUPABASE_ACCESS_TOKEN',
  'CODEMAGIC',
  'RESEND',
  'SLACK_CLIENT_SECRET',
  'SERVICECARD',
  'localhost:3005',
];

// Markers proving each screen reproduces the shipped Forge Terminal surface
// rather than a generic dashboard. These are literal labels from the product.
const SCREEN_FIDELITY_MARKERS = {
  'multi-tab-terminal': ['Specify', 'Clarify', 'Implement', 'Isolate this tab', 'RUN WITH'],
  'context-engineering': ['Context Cart', 'FILES GROUPED BY DIRECTORY', 'Heatmap', 'tokens'],
  'mcp-integration': ['MCP Discovery', 'Adaptive Build Environments', 'CONNECT YOUR AI TOOL'],
  'release-manager': ['Release Manager', 'MAJOR', 'MINOR', 'Prepare Release'],
  'web-app-debugger': ['Web App Debugger', 'What it captures', 'Follow Me'],
  'secret-vault': ['Forge Vault', 'Auto-inject on', 'SECRETS STORED', 'Reveal'],
};

function renderEveryScreen() {
  return REQUIRED_SCREEN_FEATURE_IDS.map((featureId) => ({
    featureId,
    markup: FORGE_TERMINAL_SCREEN_BUILDERS[featureId](),
  }));
}

test('every promised Forge Terminal feature resolves to a screen builder', () => {
  for (const featureId of REQUIRED_SCREEN_FEATURE_IDS) {
    assert.equal(
      typeof FORGE_TERMINAL_SCREEN_BUILDERS[featureId],
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

test('no screen leaks private workspace, project, or credential data', () => {
  for (const { featureId, markup } of renderEveryScreen()) {
    for (const forbiddenString of FORBIDDEN_PRIVATE_STRINGS) {
      assert.ok(
        !markup.toLowerCase().includes(forbiddenString.toLowerCase()),
        `${featureId} leaks the private string "${forbiddenString}".`,
      );
    }
  }
});

test('no screen displays anything shaped like a real secret value', () => {
  // A published vault screen may show names and env vars, never a value.
  // Long unbroken token-like runs are the giveaway, so they are rejected outright.
  const tokenShapedPattern = /\b[A-Za-z0-9_-]{28,}\b/;

  for (const { featureId, markup } of renderEveryScreen()) {
    const visibleText = markup
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ');

    assert.ok(
      !tokenShapedPattern.test(visibleText),
      `${featureId} shows a value that looks like a live credential.`,
    );
  }
});

test('each screen reproduces the shipped Forge Terminal surface it claims to show', () => {
  for (const { featureId, markup } of renderEveryScreen()) {
    for (const fidelityMarker of SCREEN_FIDELITY_MARKERS[featureId]) {
      assert.ok(
        markup.includes(fidelityMarker),
        `${featureId} is missing the product marker "${fidelityMarker}".`,
      );
    }
  }
});

test('no two shell screens show the same terminal session', () => {
  // Identical scrollback under every rail reads as one static mock-up rather
  // than an application in use, and hides what the phase bar exists to show.
  const shellScreens = renderEveryScreen().filter(({ featureId }) => featureId !== 'secret-vault');
  const scrollbackByFeature = shellScreens.map(({ featureId, markup }) => {
    const scrollbackMatch = markup.match(/<div class="scrollback">([\s\S]*?)<\/div>\s*<div class="update-banner"/);
    assert.ok(scrollbackMatch, `${featureId} has no scrollback to compare.`);
    return { featureId, scrollback: scrollbackMatch[1] };
  });

  const seenScrollbacks = new Map();
  for (const { featureId, scrollback } of scrollbackByFeature) {
    const duplicateOf = seenScrollbacks.get(scrollback);
    assert.equal(
      duplicateOf,
      undefined,
      `${featureId} shows the same terminal session as ${duplicateOf}.`,
    );
    seenScrollbacks.set(scrollback, featureId);
  }
});

test('the workflow phase bar advances across the screens', () => {
  // The six screens should read as one piece of work moving through the
  // pipeline, so the active phase must not be identical on all of them.
  const activePhases = renderEveryScreen()
    .filter(({ featureId }) => featureId !== 'secret-vault')
    .map(({ markup }) => {
      const activeMatch = markup.match(/<div class="active">\s*<div class="name">([^<]+)</);
      return activeMatch ? activeMatch[1] : null;
    });

  assert.ok(activePhases.every(Boolean), 'every shell screen must mark one phase active.');
  assert.ok(
    new Set(activePhases).size > 1,
    `every screen sits on the same phase (${activePhases[0]}) — the bar looks static.`,
  );
});
