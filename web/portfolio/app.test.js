// Verifies the static portfolio renderer contract without requiring a browser test runner.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');

const PORTFOLIO_DIRECTORY = __dirname;
const PORTFOLIO_RENDERER_PATH = path.join(PORTFOLIO_DIRECTORY, 'app.js');
const PORTFOLIO_DATA_PATH = path.join(PORTFOLIO_DIRECTORY, 'data', 'apps.mjs');

test('portfolio renderer requires explicit PNG screenshots with employer-facing copy', () => {
  const rendererSource = fs.readFileSync(PORTFOLIO_RENDERER_PATH, 'utf8');

  assert.match(rendererSource, /missing a PNG imagePath/);
  assert.doesNotMatch(rendererSource, /assets\/generated/);
  assert.match(rendererSource, /Product workflow shown/);
  assert.match(rendererSource, /Sample data shown:/);
});

test('portfolio data resolves every feature to a PNG asset', async () => {
  const { PORTFOLIO_APPS } = await import(pathToFileURL(PORTFOLIO_DATA_PATH).href);

  for (const portfolioApp of PORTFOLIO_APPS) {
    for (const portfolioFeature of portfolioApp.features) {
      const featureAssetPath = path.join(
        PORTFOLIO_DIRECTORY,
        portfolioFeature.imagePath.replace(/^\.\//, ''),
      );

      assert.match(portfolioFeature.imagePath, /\.png$/);
      assert.ok(['real-ui', 'source-derived-replica'].includes(portfolioFeature.imageKind));
      assert.ok(fs.existsSync(featureAssetPath), `${featureAssetPath} should exist.`);
    }
  }
});
