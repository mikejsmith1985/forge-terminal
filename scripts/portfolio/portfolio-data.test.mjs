// Validates the portfolio data contract so the showcase stays easy to maintain.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { PORTFOLIO_APP_DEFINITIONS } from './apps/index.mjs';
import { PORTFOLIO_APPS } from '../../web/portfolio/data/apps.mjs';

test('portfolio carries a reviewable number of products', () => {
  // A hard count went stale every time a product was added or retired; the
  // meaningful invariant is that the page stays scannable.
  assert.ok(PORTFOLIO_APPS.length >= 4 && PORTFOLIO_APPS.length <= 8);
});

// Three features is the floor that keeps a card substantial. The flagship
// product carries more because it ships more distinct surfaces; the cap stops
// any card from turning into an unreviewable feature dump.
const MINIMUM_SHOWCASE_FEATURES = 3;
const MAXIMUM_SHOWCASE_FEATURES = 6;

test('each product defines between three and six wow moments', () => {
  for (const portfolioApp of PORTFOLIO_APPS) {
    assert.ok(
      portfolioApp.features.length >= MINIMUM_SHOWCASE_FEATURES
        && portfolioApp.features.length <= MAXIMUM_SHOWCASE_FEATURES,
      `${portfolioApp.name} has ${portfolioApp.features.length} showcase features.`,
    );
  }
});

test('every showcase feature id is unique within its product', () => {
  for (const portfolioApp of PORTFOLIO_APPS) {
    const featureIdSet = new Set(portfolioApp.features.map((feature) => feature.id));
    assert.equal(
      featureIdSet.size,
      portfolioApp.features.length,
      `${portfolioApp.name} repeats a showcase feature id.`,
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
      assert.ok(portfolioFeature.imageKind === 'source-derived-replica');
      assert.ok(portfolioFeature.imagePath);
      assert.match(portfolioFeature.imagePath, /\.png$/);
    }
  }
});

test('runtime portfolio data stays aligned with the shared registry', () => {
  assert.deepEqual(PORTFOLIO_APPS, PORTFOLIO_APP_DEFINITIONS);
});

test('MBL2PC portfolio copy uses the concise PC device label', () => {
  const mbl2pcPortfolioApp = PORTFOLIO_APPS.find((portfolioApp) => portfolioApp.slug === 'mbl2pc');

  assert.ok(mbl2pcPortfolioApp, 'MBL2PC should be present in the public portfolio data.');
  assert.doesNotMatch(JSON.stringify(mbl2pcPortfolioApp), /Work PC/);
  assert.match(JSON.stringify(mbl2pcPortfolioApp), /\bPC\b/);
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

// The per-app screen suites scan rendered markup, which cannot see a private
// string sitting in a narrative or safety-note field. This closes that gap: it
// scans everything the site actually publishes. A real filename survived here
// once, in a field describing how the data had been anonymised.
const FORBIDDEN_PUBLISHED_STRINGS = [
  'Michael_Smith', 'Michael Smith', 'mikejsmith1985', 'mikej',
  'ProjectsWin', 'SmithWorksApps', 'smithbros',
  'ENCUC', 'ENFCT', 'DENP-', 'MAPD', 'Transformers', 'Somagutta', 'Kasuganti',
  'hcsc', 'EGWP', 'Facets', 'FiServ',
  'SBRO-', 'INC0010', 'sim-hitl', 'poc-chat', 'poc-escalation',
  'CLOUDFLARE_API_TOKEN', 'SUPABASE_ACCESS_TOKEN', 'CODEMAGIC', 'SLACK_CLIENT_SECRET',
];

test('nothing the site publishes contains a private string', () => {
  const publishedText = [
    fs.readFileSync(path.join(process.cwd(), 'web', 'portfolio', 'data', 'apps.mjs'), 'utf8'),
    fs.readFileSync(path.join(process.cwd(), 'web', 'portfolio', 'data', 'narrative.mjs'), 'utf8'),
    fs.readFileSync(path.join(process.cwd(), 'web', 'portfolio', 'index.html'), 'utf8'),
  ].join(' ').toLowerCase();

  const leaks = FORBIDDEN_PUBLISHED_STRINGS.filter(
    (forbiddenString) => publishedText.includes(forbiddenString.toLowerCase()),
  );

  assert.deepEqual(leaks, [], `published data leaks: ${leaks.join(', ')}`);
});
