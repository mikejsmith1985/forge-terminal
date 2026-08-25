// Validates the shared portfolio app and capture registries for all five products.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PORTFOLIO_APP_DEFINITIONS,
  PORTFOLIO_CAPTURE_CONFIGS,
} from './apps/index.mjs';

function assertHasNonEmptyString(value, fieldLabel) {
  assert.equal(typeof value, 'string', `${fieldLabel} must be a string`);
  assert.ok(value.length > 0, `${fieldLabel} must not be empty`);
}

test('portfolio registry exports five display app definitions', () => {
  assert.equal(PORTFOLIO_APP_DEFINITIONS.length, 5);
});

test('portfolio registry exports five capture configs', () => {
  assert.equal(PORTFOLIO_CAPTURE_CONFIGS.length, 5);
});

test('every display app definition uses a unique slug and enough showcase features', () => {
  const slugSet = new Set(PORTFOLIO_APP_DEFINITIONS.map((appDefinition) => appDefinition.slug));
  assert.equal(slugSet.size, PORTFOLIO_APP_DEFINITIONS.length);

  for (const appDefinition of PORTFOLIO_APP_DEFINITIONS) {
    assertHasNonEmptyString(appDefinition.slug, `${appDefinition.name}.slug`);
    assert.ok(appDefinition.features.length >= 3, `${appDefinition.name} must define at least three showcase features`);
  }
});

test('every capture config maps to a display app with the same slug', () => {
  const appSlugSet = new Set(PORTFOLIO_APP_DEFINITIONS.map((appDefinition) => appDefinition.slug));

  for (const captureConfig of PORTFOLIO_CAPTURE_CONFIGS) {
    assert.ok(appSlugSet.has(captureConfig.slug), `${captureConfig.slug} must have a matching display app definition`);
  }
});

test('every capture config defines the shared runner fields', () => {
  for (const captureConfig of PORTFOLIO_CAPTURE_CONFIGS) {
    assertHasNonEmptyString(captureConfig.slug, `${captureConfig.name}.slug`);
    assertHasNonEmptyString(captureConfig.name, `${captureConfig.slug}.name`);
    assertHasNonEmptyString(captureConfig.localRepoPath, `${captureConfig.slug}.localRepoPath`);
    assertHasNonEmptyString(captureConfig.outputDirPath, `${captureConfig.slug}.outputDirPath`);
    assertHasNonEmptyString(captureConfig.captureToolchain, `${captureConfig.slug}.captureToolchain`);

    assert.ok(captureConfig.launchStrategy, `${captureConfig.slug}.launchStrategy must be defined`);
    assertHasNonEmptyString(captureConfig.launchStrategy.localRepoPath, `${captureConfig.slug}.launchStrategy.localRepoPath`);
    assertHasNonEmptyString(captureConfig.launchStrategy.command, `${captureConfig.slug}.launchStrategy.command`);
    assertHasNonEmptyString(captureConfig.launchStrategy.readySignal, `${captureConfig.slug}.launchStrategy.readySignal`);
    assert.equal(
      typeof captureConfig.launchStrategy.environmentVariables,
      'object',
      `${captureConfig.slug}.launchStrategy.environmentVariables must be an object`,
    );

    assert.ok(Array.isArray(captureConfig.demoSetupHooks), `${captureConfig.slug}.demoSetupHooks must be an array`);
    assert.ok(captureConfig.demoSetupHooks.length >= 1, `${captureConfig.slug} must define at least one demo hook`);

    assert.ok(Array.isArray(captureConfig.captureTargets), `${captureConfig.slug}.captureTargets must be an array`);
    // A capture target per showcase feature — anything else means a card would
    // point at an image the runner never produces, or the runner would render
    // an image no card displays.
    const displayApp = PORTFOLIO_APP_DEFINITIONS.find(
      (appDefinition) => appDefinition.slug === captureConfig.slug,
    );
    assert.equal(
      captureConfig.captureTargets.length,
      displayApp.features.length,
      `${captureConfig.slug} must define one capture target per showcase feature`,
    );
  }
});

test('every demo setup hook describes how the runner should seed a safe state', () => {
  for (const captureConfig of PORTFOLIO_CAPTURE_CONFIGS) {
    for (const demoSetupHook of captureConfig.demoSetupHooks) {
      assertHasNonEmptyString(demoSetupHook.id, `${captureConfig.slug}.demoHook.id`);
      assertHasNonEmptyString(demoSetupHook.description, `${captureConfig.slug}.${demoSetupHook.id}.description`);
      assertHasNonEmptyString(demoSetupHook.mockDataApproach, `${captureConfig.slug}.${demoSetupHook.id}.mockDataApproach`);
      assertHasNonEmptyString(demoSetupHook.runnerInstruction, `${captureConfig.slug}.${demoSetupHook.id}.runnerInstruction`);
    }
  }
});

test('every capture target maps to one display feature id', () => {
  const featureIdMap = new Map(
    PORTFOLIO_APP_DEFINITIONS.map((appDefinition) => [
      appDefinition.slug,
      new Set(appDefinition.features.map((featureDefinition) => featureDefinition.id)),
    ]),
  );

  for (const captureConfig of PORTFOLIO_CAPTURE_CONFIGS) {
    const expectedFeatureIds = featureIdMap.get(captureConfig.slug);
    assert.ok(expectedFeatureIds, `${captureConfig.slug} must have a matching feature set`);

    for (const captureTarget of captureConfig.captureTargets) {
      assertHasNonEmptyString(captureTarget.featureId, `${captureConfig.slug}.captureTarget.featureId`);
      assertHasNonEmptyString(captureTarget.outputFileName, `${captureConfig.slug}.${captureTarget.featureId}.outputFileName`);
      assert.equal(typeof captureTarget.viewportWidth, 'number', `${captureConfig.slug}.${captureTarget.featureId}.viewportWidth must be a number`);
      assert.equal(typeof captureTarget.viewportHeight, 'number', `${captureConfig.slug}.${captureTarget.featureId}.viewportHeight must be a number`);
      assert.ok(expectedFeatureIds.has(captureTarget.featureId), `${captureConfig.slug}.${captureTarget.featureId} must exist in the display app definition`);
    }
  }
});
