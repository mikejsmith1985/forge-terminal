// Validates the app-specific portfolio capture/config definitions for EZTest
// and MBL2PC so the operational runner contract stays consistent as the
// definitions evolve.

import assert from 'node:assert/strict';
import test from 'node:test';

import { EZTEST_PORTFOLIO_CONFIG, MBL2PC_PORTFOLIO_CONFIG } from './apps/index.mjs';

// ── Helpers ────────────────────────────────────────────────────────────────

const ALL_APP_CONFIGS = [EZTEST_PORTFOLIO_CONFIG, MBL2PC_PORTFOLIO_CONFIG];

/**
 * Asserts that a given value is a non-empty string.
 * Used throughout to verify required string fields in one call.
 */
function assertIsNonEmptyString(value, fieldLabel) {
  assert.equal(typeof value, 'string', `${fieldLabel} must be a string`);
  assert.ok(value.length > 0, `${fieldLabel} must not be empty`);
}

// ── Identity and paths ─────────────────────────────────────────────────────

test('each app config exports a unique non-empty slug', () => {
  const slugSet = new Set(ALL_APP_CONFIGS.map((appConfig) => appConfig.slug));
  assert.equal(slugSet.size, ALL_APP_CONFIGS.length, 'slug values must be unique');

  for (const appConfig of ALL_APP_CONFIGS) {
    assertIsNonEmptyString(appConfig.slug, `${appConfig.slug}.slug`);
  }
});

test('each app config provides a concrete localRepoPath', () => {
  for (const appConfig of ALL_APP_CONFIGS) {
    assertIsNonEmptyString(appConfig.localRepoPath, `${appConfig.slug}.localRepoPath`);
  }
});

test('EZTest localRepoPath points to the expected Windows directory', () => {
  assert.equal(EZTEST_PORTFOLIO_CONFIG.localRepoPath, 'C:\\ProjectsWin\\EZTest');
});

test('MBL2PC localRepoPath points to the expected Windows directory', () => {
  assert.equal(MBL2PC_PORTFOLIO_CONFIG.localRepoPath, 'C:\\ProjectsWin\\mbl2pc');
});

// ── Launch strategy ────────────────────────────────────────────────────────

test('each app config defines a launch strategy with required fields', () => {
  for (const appConfig of ALL_APP_CONFIGS) {
    const launchStrategy = appConfig.launchStrategy;
    const configLabel = `${appConfig.slug}.launchStrategy`;

    assert.ok(launchStrategy, `${configLabel} must be defined`);
    assertIsNonEmptyString(launchStrategy.localRepoPath, `${configLabel}.localRepoPath`);
    assertIsNonEmptyString(launchStrategy.command, `${configLabel}.command`);
    assertIsNonEmptyString(launchStrategy.readySignal, `${configLabel}.readySignal`);
    assert.equal(
      typeof launchStrategy.environmentVariables,
      'object',
      `${configLabel}.environmentVariables must be an object`,
    );
  }
});

// ── Demo setup hooks ───────────────────────────────────────────────────────

test('each app config defines at least one demo setup hook', () => {
  for (const appConfig of ALL_APP_CONFIGS) {
    assert.ok(
      Array.isArray(appConfig.demoSetupHooks),
      `${appConfig.slug}.demoSetupHooks must be an array`,
    );
    assert.ok(
      appConfig.demoSetupHooks.length >= 1,
      `${appConfig.slug} must define at least one demo setup hook`,
    );
  }
});

test('every demo setup hook has the required narrative and action fields', () => {
  for (const appConfig of ALL_APP_CONFIGS) {
    for (const setupHook of appConfig.demoSetupHooks) {
      const hookLabel = `${appConfig.slug} hook "${setupHook.id}"`;
      assertIsNonEmptyString(setupHook.id, `${hookLabel}.id`);
      assertIsNonEmptyString(setupHook.description, `${hookLabel}.description`);
      assertIsNonEmptyString(setupHook.mockDataApproach, `${hookLabel}.mockDataApproach`);
      assert.equal(
        typeof setupHook.playwrightAction,
        'function',
        `${hookLabel}.playwrightAction must be a function`,
      );
    }
  }
});

// ── Wow-moment captures ────────────────────────────────────────────────────

test('each app config defines exactly three wow-moment captures', () => {
  for (const appConfig of ALL_APP_CONFIGS) {
    assert.equal(
      appConfig.wowMomentCaptures.length,
      3,
      `${appConfig.name} must define exactly three wow-moment capture targets`,
    );
  }
});

test('every wow-moment capture has the required fields', () => {
  for (const appConfig of ALL_APP_CONFIGS) {
    for (const captureTarget of appConfig.wowMomentCaptures) {
      const captureLabel = `${appConfig.slug} capture "${captureTarget.id}"`;
      assertIsNonEmptyString(captureTarget.id, `${captureLabel}.id`);
      assertIsNonEmptyString(captureTarget.title, `${captureLabel}.title`);
      assertIsNonEmptyString(captureTarget.outputFileName, `${captureLabel}.outputFileName`);
      assertIsNonEmptyString(captureTarget.captureUrl, `${captureLabel}.captureUrl`);
      assert.equal(
        typeof captureTarget.captureAction,
        'function',
        `${captureLabel}.captureAction must be a function`,
      );
      assert.equal(typeof captureTarget.viewportWidth, 'number', `${captureLabel}.viewportWidth must be a number`);
      assert.equal(typeof captureTarget.viewportHeight, 'number', `${captureLabel}.viewportHeight must be a number`);
    }
  }
});

test('wow-moment capture ids match the slugs expected by portfolio-data apps.mjs', () => {
  const expectedEztestCaptureIds = ['onboarding', 'dashboard-actions', 'run-modal'];
  const expectedMbl2pcCaptureIds = ['chat-dashboard', 'personalization', 'clipboard-and-files'];

  const actualEztestCaptureIds = EZTEST_PORTFOLIO_CONFIG.wowMomentCaptures.map((captureTarget) => captureTarget.id);
  const actualMbl2pcCaptureIds = MBL2PC_PORTFOLIO_CONFIG.wowMomentCaptures.map((captureTarget) => captureTarget.id);

  assert.deepEqual(actualEztestCaptureIds, expectedEztestCaptureIds);
  assert.deepEqual(actualMbl2pcCaptureIds, expectedMbl2pcCaptureIds);
});

test('output file names match the generated-asset naming convention used by the build script', () => {
  // The build script writes files to assets/generated/{slug}-{featureId}.svg.
  // The capture runner should write PNG counterparts with the same base naming.
  for (const captureTarget of EZTEST_PORTFOLIO_CONFIG.wowMomentCaptures) {
    assert.ok(
      captureTarget.outputFileName.startsWith('eztest-'),
      `EZTest capture "${captureTarget.id}" fileName must start with "eztest-"`,
    );
  }
  for (const captureTarget of MBL2PC_PORTFOLIO_CONFIG.wowMomentCaptures) {
    assert.ok(
      captureTarget.outputFileName.startsWith('mbl2pc-'),
      `MBL2PC capture "${captureTarget.id}" fileName must start with "mbl2pc-"`,
    );
  }
});
