// Validates the portfolio data contract so the showcase stays easy to maintain.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { PORTFOLIO_APP_DEFINITIONS } from './apps/index.mjs';
import { PORTFOLIO_APPS } from '../../web/portfolio/data/apps.mjs';

test('portfolio contains the expected five products', () => {
  assert.equal(PORTFOLIO_APPS.length, 5);
});

test('each product defines exactly three wow moments', () => {
  for (const portfolioApp of PORTFOLIO_APPS) {
    assert.equal(
      portfolioApp.features.length,
      3,
      `${portfolioApp.name} should define exactly three showcase features.`,
    );
  }
});

test('each showcase feature has the required narrative fields', () => {
  for (const portfolioApp of PORTFOLIO_APPS) {
    for (const portfolioFeature of portfolioApp.features) {
      assert.ok(portfolioFeature.id);
      assert.ok(portfolioFeature.title);
      assert.ok(portfolioFeature.wowFactor);
      assert.ok(portfolioFeature.whatItShows);
      assert.ok(portfolioFeature.mockDataApproach);
      assert.ok(portfolioFeature.capturePlan);
      assert.equal(portfolioFeature.imageKind, 'code-rendered');
    }
  }
});

test('runtime portfolio data stays aligned with the shared registry', () => {
  assert.deepEqual(PORTFOLIO_APPS, PORTFOLIO_APP_DEFINITIONS);
});

test('generated feature assets are screen-level mocked UI scenes', () => {
  for (const portfolioApp of PORTFOLIO_APPS) {
    for (const portfolioFeature of portfolioApp.features) {
      const generatedAssetPath = path.join(
        process.cwd(),
        'web',
        'portfolio',
        'assets',
        'generated',
        `${portfolioApp.slug}-${portfolioFeature.id}.svg`,
      );
      const generatedAssetContents = fs.readFileSync(generatedAssetPath, 'utf8');

      assert.match(generatedAssetContents, /mock-ui-frame/);
      assert.match(generatedAssetContents, /mock-ui-sample-data/);
      assert.match(generatedAssetContents, new RegExp(portfolioFeature.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.doesNotMatch(generatedAssetContents, /leadLabel|leadSummary|Portfolio visual/);
    }
  }
});
