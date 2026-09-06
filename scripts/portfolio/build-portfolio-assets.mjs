// Builds PNG-only portfolio visuals and standalone data for the employer-facing showcase.

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import {
  PORTFOLIO_APP_DEFINITIONS,
  PORTFOLIO_CAPTURE_CONFIGS,
} from './apps/index.mjs';
import { FORGE_TERMINAL_SCREEN_BUILDERS } from './screens/forge-terminal-screens.mjs';
import { NODETOOLBOX_SCREEN_BUILDERS } from './screens/nodetoolbox-screens.mjs';
import { LGBUILDER_SCREEN_BUILDERS } from './screens/lgbuilder-screens.mjs';
import { MBL2PC_SCREEN_BUILDERS } from './screens/mbl2pc-screens.mjs';
import { U2_COUNTER_SCREEN_BUILDERS } from './screens/u2-counter-screens.mjs';
import {
  ARCHITECTURE_CONTROL_PLANE,
  ARCHITECTURE_FLOW,
  ARCHITECTURE_NODE_KINDS,
  ARCHITECTURE_OBSERVABILITY,
  ARCHITECTURE_ROUTES,
  ARCHITECTURE_STATE_OBJECT,
} from './architecture.mjs';
import {
  ENGINEERING_CASE_STUDIES,
  PORTFOLIO_PROOF_STATS,
  PORTFOLIO_THESIS,
  UPSTREAM_CONTRIBUTIONS,
} from './narrative.mjs';

const require = createRequire(import.meta.url);

const PROJECT_ROOT = process.cwd();
const PORTFOLIO_ASSET_DIRECTORY = path.join(PROJECT_ROOT, 'web', 'portfolio', 'assets');
const GENERATED_SVG_DIRECTORY = path.join(PORTFOLIO_ASSET_DIRECTORY, 'generated');
const PORTFOLIO_DATA_DIRECTORY = path.join(PROJECT_ROOT, 'web', 'portfolio', 'data');
const PORTFOLIO_DATA_FILE_PATH = path.join(PORTFOLIO_DATA_DIRECTORY, 'apps.mjs');
const PORTFOLIO_NARRATIVE_FILE_PATH = path.join(PORTFOLIO_DATA_DIRECTORY, 'narrative.mjs');
const NODE_TOOLBOX_PLAYWRIGHT_PATH = 'C:\\ProjectsWin\\NodeToolbox\\node_modules\\playwright';
// A capture is trimmed to the height its content actually occupies, so a short
// screen does not ship with a band of dead space beneath it. The floor keeps
// every asset large enough to read; the ceiling stops one long screen from
// dominating its card.
const MINIMUM_CAPTURE_HEIGHT = 780;
const MAXIMUM_CAPTURE_HEIGHT = 1600;
const DESKTOP_SCREEN_WIDTH = 1600;
const DESKTOP_SCREEN_HEIGHT = 1000;

/** Namespaces an app's screen builders by slug for the shared registry. */
function createScreenRegistry(appSlug, screenBuilders) {
  return Object.fromEntries(
    Object.entries(screenBuilders).map(
      ([featureId, screenBuilder]) => [`${appSlug}:${featureId}`, screenBuilder],
    ),
  );
}

const SOURCE_DERIVED_SCREEN_BUILDERS = {
  // Forge Terminal screens live in their own module because they replicate the
  // shipped product chrome pixel-for-pixel rather than using the generic
  // portfolio shell the other four products share.
  ...createScreenRegistry('forge-terminal', FORGE_TERMINAL_SCREEN_BUILDERS),
  // NodeToolbox screens likewise replicate their own product chrome, and carry
  // the heaviest anonymisation burden on the site.
  ...createScreenRegistry('nodetoolbox', NODETOOLBOX_SCREEN_BUILDERS),
  // LG-Builder runs in two places, so its screens replicate both the chat
  // integration and the admin console.
  ...createScreenRegistry('lgbuilder', LGBUILDER_SCREEN_BUILDERS),
  ...createScreenRegistry('mbl2pc', MBL2PC_SCREEN_BUILDERS),
  // U2 Counter replicates a workstation application over a MultiValue store,
  // so its screens carry the real attribute and value marks rather than a
  // table standing in for them.
  ...createScreenRegistry('u2-counter', U2_COUNTER_SCREEN_BUILDERS),
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function createPngImagePath(portfolioApp, portfolioFeature) {
  return `./assets/${portfolioApp.slug}/${portfolioApp.slug}-${portfolioFeature.id}.png`;
}

function createBrowser() {
  if (!fsSync.existsSync(path.join(NODE_TOOLBOX_PLAYWRIGHT_PATH, 'package.json'))) {
    throw new Error(
      `Playwright is required at ${NODE_TOOLBOX_PLAYWRIGHT_PATH}. Run npm install in C:\\ProjectsWin\\NodeToolbox first.`,
    );
  }

  const { chromium } = require(NODE_TOOLBOX_PLAYWRIGHT_PATH);
  return chromium.launch({ headless: true });
}

function getCaptureConfig(portfolioAppSlug) {
  const captureConfig = PORTFOLIO_CAPTURE_CONFIGS.find(
    (candidateConfig) => candidateConfig.slug === portfolioAppSlug,
  );

  if (!captureConfig) {
    throw new Error(`No capture config exists for ${portfolioAppSlug}.`);
  }

  return captureConfig;
}

function getCaptureTarget(portfolioApp, portfolioFeature) {
  const captureConfig = getCaptureConfig(portfolioApp.slug);
  const captureTarget = captureConfig.captureTargets.find(
    (candidateTarget) => candidateTarget.featureId === portfolioFeature.id,
  );

  if (!captureTarget) {
    throw new Error(`${portfolioApp.slug}.${portfolioFeature.id} has no capture target.`);
  }

  return captureTarget;
}

function createWindowChrome(title, bodyMarkup, options = {}) {
  const {
    appSlug = '',
    activeNav = '',
    navigationItems = [],
    sidebarTitle = 'Portfolio demo',
    footerMarkup = '',
  } = options;
  const navMarkup = navigationItems.map((navigationItem) => {
    const activeClassName = navigationItem === activeNav ? ' active' : '';
    return `<div class="nav-item${activeClassName}">${escapeHtml(navigationItem)}</div>`;
  }).join('');

  return `
    <div class="desktop-frame ${escapeHtml(appSlug)}">
      <div class="window-shell">
        <div class="titlebar">
          <span class="dot red"></span><span class="dot yellow"></span><span class="dot green"></span>
          <strong>${escapeHtml(title)}</strong>
        </div>
        <div class="app-shell">
          <aside class="sidebar">
            <div class="sidebar-title">${escapeHtml(sidebarTitle)}</div>
            ${navMarkup}
          </aside>
          <main class="content-area">${bodyMarkup}</main>
        </div>
        ${footerMarkup}
      </div>
    </div>
  `;
}

function createMetricCards(metrics) {
  return `<div class="metric-grid">${metrics.map(([label, value, detail]) => `
    <div class="metric-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </div>
  `).join('')}</div>`;
}

function createDataTable(columns, rows, extraClassName = '') {
  return `
    <div class="data-table ${escapeHtml(extraClassName)}">
      <div class="table-row table-head">${columns.map((column) => `<span>${escapeHtml(column)}</span>`).join('')}</div>
      ${rows.map((row) => `<div class="table-row">${row.map((cell) => `<span>${escapeHtml(cell)}</span>`).join('')}</div>`).join('')}
    </div>
  `;
}

function createTerminalBlock(lines) {
  return `<div class="terminal-block">${lines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>`;
}

function createBoardColumns(columns) {
  return `<div class="board-columns">${columns.map(([title, cards]) => `
    <section class="board-column">
      <h3>${escapeHtml(title)}</h3>
      ${cards.map((card) => `<article>${escapeHtml(card)}</article>`).join('')}
    </section>
  `).join('')}</div>`;
}

function createSourceScreenDocument(title, accentColor, bodyMarkup) {
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(title)}</title>
      <style>
        :root { --accent: ${accentColor}; --bg: #07101d; --panel: rgba(255,255,255,.075); --line: rgba(255,255,255,.11); --text: #f4f8ff; --muted: #9fb1d1; }
        * { box-sizing: border-box; }
        body { margin: 0; width: 100vw; min-height: 100vh; overflow: hidden; background: radial-gradient(circle at top left, color-mix(in srgb, var(--accent) 28%, transparent), transparent 34%), #060b14; color: var(--text); font-family: Inter, "Segoe UI", Arial, sans-serif; }
        .desktop-frame { width: 100vw; height: 100vh; padding: 30px; background: linear-gradient(135deg, rgba(15,27,47,.96), rgba(5,8,16,.98)); }
        .window-shell { height: 100%; overflow: hidden; border: 1px solid var(--line); border-radius: 26px; background: #0a1324; box-shadow: 0 30px 90px rgba(0,0,0,.46); }
        .titlebar { height: 54px; display: flex; align-items: center; gap: 12px; padding: 0 20px; border-bottom: 1px solid var(--line); background: rgba(255,255,255,.045); color: #dce8ff; }
        .dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; } .red { background: #ff5f57; } .yellow { background: #ffbd2e; } .green { background: #28c840; }
        .titlebar strong { margin-left: 8px; font-weight: 650; }
        .app-shell { height: calc(100% - 54px); display: grid; grid-template-columns: 235px minmax(0, 1fr); }
        .sidebar { padding: 24px 16px; border-right: 1px solid var(--line); background: rgba(255,255,255,.035); }
        .sidebar-title { margin-bottom: 18px; color: var(--accent); font-weight: 800; letter-spacing: .05em; text-transform: uppercase; font-size: 13px; }
        .nav-item { margin-bottom: 9px; padding: 12px 14px; border-radius: 14px; color: #b9c8e8; font-weight: 650; }
        .nav-item.active { background: linear-gradient(135deg, var(--accent), rgba(255,255,255,.18)); color: #07101d; }
        .content-area { padding: 26px; overflow: hidden; }
        .screen-heading { display: flex; justify-content: space-between; gap: 22px; align-items: flex-start; margin-bottom: 20px; }
        .screen-heading h1 { margin: 0 0 7px; font-size: 34px; line-height: 1.08; letter-spacing: -.02em; }
        .screen-heading p { margin: 0; max-width: 850px; color: #b9c8e8; font-size: 18px; line-height: 1.42; }
        .pill-row, .toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
        .pill, .toolbar span, .badge { padding: 8px 12px; border-radius: 999px; background: rgba(255,255,255,.075); border: 1px solid var(--line); color: #dbe7ff; font-weight: 700; font-size: 13px; }
        .metric-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 18px; }
        .metric-card, .panel, .feature-tile, .dialog-card { border: 1px solid var(--line); border-radius: 19px; background: var(--panel); box-shadow: inset 0 1px 0 rgba(255,255,255,.045); }
        .metric-card { padding: 16px; } .metric-card span { color: var(--muted); font-size: 13px; display: block; } .metric-card strong { display: block; margin: 5px 0; font-size: 30px; } .metric-card small { color: #c2d2ef; }
        .two-column { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(350px, .75fr); gap: 18px; }
        .three-column { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
        .panel { padding: 18px; } .panel h2, .panel h3 { margin: 0 0 14px; }
        .data-table { display: grid; gap: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 15px; }
        .table-row { display: grid; grid-template-columns: .85fr 1.7fr 1fr .9fr; gap: 12px; padding: 12px 14px; border-bottom: 1px solid var(--line); color: #eef4ff; align-items: center; }
        .table-row:last-child { border-bottom: 0; } .table-head { color: var(--muted); text-transform: uppercase; letter-spacing: .08em; font-size: 12px; font-weight: 800; background: rgba(255,255,255,.045); }
        .terminal-block { padding: 18px; border-radius: 18px; background: #030712; border: 1px solid rgba(130,180,255,.22); color: #d8e5ff; font: 17px/1.58 Consolas, "Cascadia Mono", monospace; box-shadow: inset 0 0 40px rgba(53,116,255,.08); }
        .terminal-block div { border-bottom: 1px solid rgba(255,255,255,.06); padding: 3px 0; } .terminal-block div:last-child { border-bottom: 0; }
        .feature-tile { padding: 16px; min-height: 125px; } .feature-tile strong { display: block; font-size: 18px; margin-bottom: 8px; } .feature-tile p { margin: 0; color: #b9c8e8; line-height: 1.38; }
        .board-columns { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
        .board-column { padding: 14px; border-radius: 17px; background: rgba(255,255,255,.055); border: 1px solid var(--line); } .board-column h3 { margin: 0 0 12px; color: var(--accent); }
        .board-column article { padding: 11px; margin-bottom: 10px; border-radius: 13px; background: rgba(0,0,0,.22); border: 1px solid rgba(255,255,255,.08); color: #e9f1ff; }
        .progress-track { height: 10px; border-radius: 999px; background: rgba(255,255,255,.09); overflow: hidden; } .progress-track span { display: block; height: 100%; background: var(--accent); border-radius: inherit; }
        .phone-frame { width: 310px; margin: 0 auto; padding: 18px; border-radius: 38px; background: #050914; border: 1px solid rgba(255,255,255,.18); box-shadow: 0 18px 40px rgba(0,0,0,.35); }
        .phone-screen { min-height: 540px; border-radius: 28px; padding: 18px; background: linear-gradient(180deg,#101d31,#07101d); }
        .qr-box { width: 168px; height: 168px; margin: 20px auto; background: repeating-linear-gradient(45deg,#f5f8ff 0 8px,#07101d 8px 16px); border: 12px solid #f5f8ff; border-radius: 14px; }
        .wizard-steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; } .wizard-step { padding: 14px; border-radius: 15px; background: rgba(255,255,255,.065); border: 1px solid var(--line); color: #dbe8ff; } .wizard-step.active { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
        .form-row { display: grid; grid-template-columns: 180px 1fr; gap: 14px; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--line); color: #dce8ff; } .form-row span { color: var(--muted); }
        .native-window { margin: 0 auto; border: 1px solid #b8c0cc; border-radius: 10px; background: #f1f3f7; color: #1d2430; box-shadow: 0 24px 70px rgba(0,0,0,.42); overflow: hidden; font-family: "Segoe UI", Arial, sans-serif; }
        .native-title { height: 42px; padding: 10px 14px; background: #ffffff; border-bottom: 1px solid #d5dbe5; font-weight: 700; }
        .native-body { padding: 20px; } .native-body label { display: block; color: #4d5868; margin-bottom: 6px; font-size: 13px; }
        .native-input, .native-select, .native-textarea { width: 100%; padding: 10px 12px; border: 1px solid #c6ceda; border-radius: 7px; background: white; color: #1f2937; font: inherit; }
        .native-textarea { min-height: 122px; }
        .native-buttons { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; } .native-button { padding: 9px 16px; border-radius: 7px; border: 1px solid #b5bfcc; background: #fff; font-weight: 700; } .native-button.primary { background: #2563eb; color: white; border-color: #2563eb; }
        .native-table .table-row { color: #1f2937; grid-template-columns: 1.3fr .9fr 1fr 1fr 1.7fr .8fr; border-color: #d7dde7; } .native-table .table-head { background: #e8edf5; color: #4b5563; }
      </style>
    </head>
    <body>${bodyMarkup}</body>
  </html>`;
}

async function renderSourceDerivedReplica(browser, portfolioApp, portfolioFeature, outputPath) {
  const screenKey = `${portfolioApp.slug}:${portfolioFeature.id}`;
  const screenBuilder = SOURCE_DERIVED_SCREEN_BUILDERS[screenKey];

  if (!screenBuilder) {
    throw new Error(`No source-derived screen builder exists for ${screenKey}.`);
  }

  const captureTarget = getCaptureTarget(portfolioApp, portfolioFeature);
  const page = await browser.newPage({
    viewport: {
      width: captureTarget.viewportWidth ?? DESKTOP_SCREEN_WIDTH,
      height: captureTarget.viewportHeight ?? DESKTOP_SCREEN_HEIGHT,
    },
    deviceScaleFactor: 1,
  });

  await page.setContent(screenBuilder(), { waitUntil: 'networkidle' });

  // Screens built to fill the viewport report exactly the viewport height, so
  // they are unaffected; screens that size to their content get trimmed.
  // scrollHeight never reports less than the viewport, so it cannot detect a
  // short screen. The bottom edge of the last top-level element can.
  const contentHeight = await page.evaluate(() => {
    const childBottoms = [...document.body.children]
      .map((element) => element.getBoundingClientRect().bottom);
    return Math.ceil(Math.max(0, ...childBottoms));
  });
  const captureHeight = Math.min(
    MAXIMUM_CAPTURE_HEIGHT,
    Math.max(MINIMUM_CAPTURE_HEIGHT, contentHeight),
  );
  await page.setViewportSize({
    width: captureTarget.viewportWidth ?? DESKTOP_SCREEN_WIDTH,
    height: captureHeight,
  });

  await page.screenshot({ path: outputPath, type: 'png' });
  await page.close();
}

async function buildPngAssets() {
  const browser = await createBrowser();

  try {
    await fs.rm(GENERATED_SVG_DIRECTORY, { recursive: true, force: true });

    for (const portfolioApp of PORTFOLIO_APP_DEFINITIONS) {
      const appAssetDirectory = path.join(PORTFOLIO_ASSET_DIRECTORY, portfolioApp.slug);
      await fs.mkdir(appAssetDirectory, { recursive: true });

      for (const portfolioFeature of portfolioApp.features) {
        const outputPath = path.join(
          appAssetDirectory,
          `${portfolioApp.slug}-${portfolioFeature.id}.png`,
        );

        await renderSourceDerivedReplica(browser, portfolioApp, portfolioFeature, outputPath);
      }
    }
  } finally {
    await browser.close();
  }
}

/**
 * Emits the page's argument — thesis, headline numbers, case studies — as a
 * standalone module so the published site never imports from scripts/.
 */
async function writeNarrativeData() {
  // One blank line between exports keeps the generated module readable.
  const EXPORT_SEPARATOR = '\n\n';
  const narrativeExports = [
    ['ARCHITECTURE_STATE_OBJECT', ARCHITECTURE_STATE_OBJECT],
    ['ARCHITECTURE_NODE_KINDS', ARCHITECTURE_NODE_KINDS],
    ['ARCHITECTURE_FLOW', ARCHITECTURE_FLOW],
    ['ARCHITECTURE_ROUTES', ARCHITECTURE_ROUTES],
    ['ARCHITECTURE_CONTROL_PLANE', ARCHITECTURE_CONTROL_PLANE],
    ['ARCHITECTURE_OBSERVABILITY', ARCHITECTURE_OBSERVABILITY],
    ['PORTFOLIO_THESIS', PORTFOLIO_THESIS],
    ['PORTFOLIO_PROOF_STATS', PORTFOLIO_PROOF_STATS],
    ['ENGINEERING_CASE_STUDIES', ENGINEERING_CASE_STUDIES],
    ['UPSTREAM_CONTRIBUTIONS', UPSTREAM_CONTRIBUTIONS],
  ];

  const narrativeSource = narrativeExports
    .map(([exportName, exportValue]) => `export const ${exportName} = ${JSON.stringify(exportValue, null, 2)};`)
    .join(EXPORT_SEPARATOR);

  await fs.mkdir(PORTFOLIO_DATA_DIRECTORY, { recursive: true });
  await fs.writeFile(
    PORTFOLIO_NARRATIVE_FILE_PATH,
    `// Auto-generated by scripts/portfolio/build-portfolio-assets.mjs.

${narrativeSource}
`,
    'utf8',
  );
}

async function writePortfolioData() {
  const standaloneData = `// Auto-generated by scripts/portfolio/build-portfolio-assets.mjs.\n\nexport const PORTFOLIO_APPS = ${JSON.stringify(PORTFOLIO_APP_DEFINITIONS, null, 2)};\n`;

  await fs.mkdir(PORTFOLIO_DATA_DIRECTORY, { recursive: true });
  await fs.writeFile(PORTFOLIO_DATA_FILE_PATH, standaloneData, 'utf8');
}

async function main() {
  await buildPngAssets();
  await writePortfolioData();
  await writeNarrativeData();
}

await main();
