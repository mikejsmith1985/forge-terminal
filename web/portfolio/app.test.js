// Verifies the static portfolio renderer contract without requiring a browser test runner.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');

const PORTFOLIO_DIRECTORY = __dirname;
const PORTFOLIO_RENDERER_PATH = path.join(PORTFOLIO_DIRECTORY, 'app.js');
const PORTFOLIO_DATA_PATH = path.join(PORTFOLIO_DIRECTORY, 'data', 'apps.mjs');
const GENERATED_ASSET_DIRECTORY = path.join(PORTFOLIO_DIRECTORY, 'assets', 'generated');

test('portfolio renderer presents generated mock screens with in-action copy', () => {
  const rendererSource = fs.readFileSync(PORTFOLIO_RENDERER_PATH, 'utf8');

  assert.match(rendererSource, /assets\/generated\/\$\{app\.slug\}-\$\{feature\.id\}\.svg/);
  assert.match(rendererSource, /Mocked UI in action/);
  assert.match(rendererSource, /Sample data shown:/);
});

test('portfolio data resolves every feature to a generated screen asset', async () => {
  const { PORTFOLIO_APPS } = await import(pathToFileURL(PORTFOLIO_DATA_PATH).href);

  for (const portfolioApp of PORTFOLIO_APPS) {
    for (const portfolioFeature of portfolioApp.features) {
      const generatedAssetPath = path.join(
        GENERATED_ASSET_DIRECTORY,
        `${portfolioApp.slug}-${portfolioFeature.id}.svg`,
      );

      assert.equal(portfolioFeature.imageKind, 'code-rendered');
      assert.ok(fs.existsSync(generatedAssetPath), `${generatedAssetPath} should exist.`);
    }
  }
});
