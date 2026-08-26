// Verifies the static portfolio renderer contract without requiring a browser test runner.
//
// The renderer is plain ES modules against the DOM, so these tests check the
// two things that can silently break the published page: that every section of
// the argument is actually rendered, and that no feature can reach the page
// without a real screenshot behind it.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');

const PORTFOLIO_DIRECTORY = __dirname;
const PORTFOLIO_RENDERER_PATH = path.join(PORTFOLIO_DIRECTORY, 'app.js');
const PORTFOLIO_MARKUP_PATH = path.join(PORTFOLIO_DIRECTORY, 'index.html');
const PORTFOLIO_DATA_PATH = path.join(PORTFOLIO_DIRECTORY, 'data', 'apps.mjs');
const PORTFOLIO_NARRATIVE_PATH = path.join(PORTFOLIO_DIRECTORY, 'data', 'narrative.mjs');

// Every section of the page's argument, and the renderer that fills it.
const REQUIRED_RENDER_STEPS = [
  'renderThesis',
  'renderProofStats',
  'renderFlagship',
  'renderDepth',
  'renderCaseStudies',
  'renderSupportingProducts',
  'renderColophon',
];

test('the renderer fills every section of the page', () => {
  const rendererSource = fs.readFileSync(PORTFOLIO_RENDERER_PATH, 'utf8');

  for (const renderStep of REQUIRED_RENDER_STEPS) {
    assert.match(
      rendererSource,
      new RegExp(`function ${renderStep}\\(`),
      `${renderStep} must be defined.`,
    );
    assert.match(
      rendererSource,
      new RegExp(`^${renderStep}\\(\\);`, 'm'),
      `${renderStep} must actually be called.`,
    );
  }
});

test('the renderer refuses a feature with no screenshot behind it', () => {
  const rendererSource = fs.readFileSync(PORTFOLIO_RENDERER_PATH, 'utf8');

  assert.match(rendererSource, /missing a PNG imagePath/);
  assert.doesNotMatch(rendererSource, /assets\/generated/);
});

test('the renderer escapes every value it injects into markup', () => {
  const rendererSource = fs.readFileSync(PORTFOLIO_RENDERER_PATH, 'utf8');

  assert.match(rendererSource, /function escapeHtml\(/);

  // innerHTML is unavoidable for a template-string renderer, so the guarantee is
  // that any value interpolated into a line of markup runs through the escaper.
  // Only lines carrying an HTML tag are markup; error messages and textContent
  // assignments interpolate freely and are not a rendering risk.
  const offendingLines = rendererSource
    .split('\n')
    .map((sourceLine, lineIndex) => ({ sourceLine, lineNumber: lineIndex + 1 }))
    .filter(({ sourceLine }) => /<\/?[a-z][^>]*>|<[a-z]+$/i.test(sourceLine))
    .filter(({ sourceLine }) => {
      const interpolations = sourceLine.match(/\$\{[^}]*\}/g) ?? [];
      return interpolations.some(
        (interpolation) => !/escapeHtml|Markup|create[A-Z]/.test(interpolation),
      );
    });

  assert.deepEqual(
    offendingLines.map(({ lineNumber }) => lineNumber),
    [],
    `unescaped values reach markup at line(s): ${offendingLines.map((entry) => `${entry.lineNumber} → ${entry.sourceLine.trim()}`).join(' | ')}`,
  );
});

test('the markup provides every mount point the renderer writes into', () => {
  const markupSource = fs.readFileSync(PORTFOLIO_MARKUP_PATH, 'utf8');
  const requiredMountPoints = [
    'id="thesis-heading"',
    'class="thesis__statement"',
    'class="thesis__pillars"',
    'class="proof-strip__grid"',
    'id="flagship"',
    'id="depth"',
    'class="case-studies__list"',
    'class="products__list"',
    'class="colophon__meta"',
  ];

  for (const mountPoint of requiredMountPoints) {
    assert.ok(markupSource.includes(mountPoint), `index.html is missing ${mountPoint}.`);
  }
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

test('the published narrative data carries the full argument', async () => {
  const narrativeModule = await import(pathToFileURL(PORTFOLIO_NARRATIVE_PATH).href);

  assert.ok(narrativeModule.PORTFOLIO_THESIS.headline);
  assert.ok(narrativeModule.PORTFOLIO_PROOF_STATS.length >= 4);
  assert.ok(narrativeModule.ENGINEERING_CASE_STUDIES.length >= 4);
});
