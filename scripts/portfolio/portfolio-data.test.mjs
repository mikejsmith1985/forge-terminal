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
      assert.ok(['real-ui', 'source-derived-replica'].includes(portfolioFeature.imageKind));
      assert.ok(portfolioFeature.imagePath);
      assert.match(portfolioFeature.imagePath, /\.png$/);
    }
  }
});

test('runtime portfolio data stays aligned with the shared registry', () => {
  assert.deepEqual(PORTFOLIO_APPS, PORTFOLIO_APP_DEFINITIONS);
});

function readPngDimensions(assetPath) {
  const pngHeader = fs.readFileSync(assetPath);

  assert.equal(pngHeader.readUInt32BE(0), 0x89504e47, `${assetPath} must start with the PNG signature.`);
  assert.equal(pngHeader.toString('ascii', 12, 16), 'IHDR', `${assetPath} must contain an IHDR chunk.`);

  return {
    width: pngHeader.readUInt32BE(16),
    height: pngHeader.readUInt32BE(20),
  };
}

test('each showcase feature resolves to a committed PNG asset', () => {
  for (const portfolioApp of PORTFOLIO_APPS) {
    for (const portfolioFeature of portfolioApp.features) {
      const featureAssetPath = path.join(
        process.cwd(),
        'web',
        'portfolio',
        portfolioFeature.imagePath.replace(/^\.\//, ''),
      );
      const { width, height } = readPngDimensions(featureAssetPath);

      assert.ok(width >= 390, `${featureAssetPath} should be wide enough to show product UI.`);
      assert.ok(height >= 760, `${featureAssetPath} should be tall enough to show product UI.`);
      assert.doesNotMatch(portfolioFeature.imagePath, /assets\/generated/);
    }
  }
});

test('portfolio no longer ships generated SVG fallback assets', () => {
  const generatedSvgDirectory = path.join(process.cwd(), 'web', 'portfolio', 'assets', 'generated');

  assert.equal(fs.existsSync(generatedSvgDirectory), false);
});
