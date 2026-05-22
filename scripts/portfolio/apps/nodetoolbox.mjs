// App-specific portfolio capture and configuration definition for NodeToolbox.
// This file describes how the portfolio runner should launch NodeToolbox, activate
// demo mode, and capture the three employer-facing wow moments. It is intentionally
// standalone so the shared runner can discover and execute it without knowing
// NodeToolbox internals.
//
// Safe for employer-facing demos: all data is mock-safe by default. No real Jira,
// ServiceNow, or GitHub credentials are needed — demo mode supplies deterministic
// fixture data for every capture target.

// ── Constants ──────────────────────────────────────────────────────────────────

/** Absolute path to the NodeToolbox repository on the developer machine. */
const LOCAL_REPO_PATH = 'C:\\ProjectsWin\\NodeToolbox';

/** Port NodeToolbox binds to when started in demo mode. */
const DEMO_SERVER_PORT = 3000;

/** Base URL the Playwright capture sessions connect to. */
const DEMO_BASE_URL = `http://localhost:${DEMO_SERVER_PORT}`;

/**
 * How long (in milliseconds) to wait after the server process starts before
 * Playwright attempts to connect. NodeToolbox compiles the React client on startup,
 * so the first launch is slower than subsequent runs.
 */
const SERVER_READINESS_TIMEOUT_MS = 45_000;

/** How long (in milliseconds) each Playwright page navigation may take. */
const PAGE_NAVIGATION_TIMEOUT_MS = 15_000;

// ── Launch strategy ────────────────────────────────────────────────────────────

/**
 * Describes how to bring NodeToolbox up in a reproducible demo-safe state.
 *
 * The two-step launch (build:client then start) matches the npm scripts that
 * ship with the repository. The DEMO_MODE environment variable activates the
 * in-app fixture layer so no real service credentials are required.
 *
 * @type {import('../types.d.mjs').LaunchStrategy}
 */
export const LAUNCH_STRATEGY = {
  repoDirPath: LOCAL_REPO_PATH,

  // Install dependencies before the first run if node_modules is absent.
  bootstrapCommand: 'npm install',

  // Build the React client bundle and then start the Express server. The
  // build step is required because NodeToolbox serves the compiled bundle —
  // it does not have a Vite dev server.
  launchCommand: 'npm run build:client && npm start',

  // DEMO_MODE=true instructs the NodeToolbox server to:
  //   1. Skip live Jira / ServiceNow / GitHub connections
  //   2. Load deterministic fixture data from the in-repo demo store
  //   3. Suppress any first-run setup wizard so the UI lands directly
  environment: {
    DEMO_MODE: 'true',
    PORT: String(DEMO_SERVER_PORT),
  },

  serverReadinessTimeoutMs: SERVER_READINESS_TIMEOUT_MS,
  readinessProbeUrl: `${DEMO_BASE_URL}/api/health`,
};

// ── Demo hooks ─────────────────────────────────────────────────────────────────

/**
 * Ordered sequence of actions the capture runner executes before taking
 * screenshots. Each hook brings the app into a deterministic, employer-safe state
 * so the captures look intentional rather than empty or half-loaded.
 *
 * @type {import('../types.d.mjs').DemoHook[]}
 */
export const DEMO_HOOKS = [
  {
    id: 'activate-demo-mode',
    description:
      'Confirm the demo fixture layer is active by checking the /api/health endpoint for the "demo":true flag. Abort if it is missing — running against a live account would expose real data.',
    route: '/api/health',
    // The runner reads this selector from the JSON response body.
    // A missing key causes a hard abort, not a silent screenshot.
    assertJsonPath: 'demo',
    assertValue: true,
    isBlockingGate: true,
  },
  {
    id: 'load-demo-sprint-data',
    description:
      'POST to the demo fixture endpoint so the sprint dashboard is pre-populated with a realistic but safe sprint. This is idempotent — posting again when data already exists is a no-op.',
    route: '/api/demo/seed',
    method: 'POST',
    body: { scenario: 'standard-sprint' },
    isBlockingGate: false,
  },
  {
    id: 'navigate-to-home',
    description:
      'Navigate to the root route and wait for the home launcher grid to paint. This step stabilises the browser state before any capture sequence begins.',
    route: '/',
    waitForSelector: '[data-testid="home-launcher-grid"]',
    isBlockingGate: true,
  },
];

// ── Wow-moment capture targets ─────────────────────────────────────────────────

/**
 * The three employer-facing showcase moments for NodeToolbox. Each entry maps
 * directly to a feature defined in web/portfolio/data/apps.mjs so the shared
 * runner can correlate capture output with the display metadata.
 *
 * All capture targets use Playwright and the DEMO_BASE_URL above. Playwright
 * already ships with the NodeToolbox repository, so no additional tooling is
 * needed.
 *
 * @type {import('../types.d.mjs').CaptureTarget[]}
 */
export const CAPTURE_TARGETS = [
  {
    // ── Wow moment 1: Home launcher ──────────────────────────────────────────
    featureId: 'home-launcher',
    outputFilename: 'nodetoolbox-home-launcher.png',
    route: '/',

    // Wait for the launcher grid rather than just DOMContentLoaded so every
    // module tile is rendered before the screenshot is taken.
    waitForSelector: '[data-testid="home-launcher-grid"]',

    // Capture the full above-the-fold home surface. A 1440×900 viewport shows
    // all module tiles without scrolling, which communicates product breadth
    // in a single frame.
    viewportWidth: 1440,
    viewportHeight: 900,

    // Demo-safety notes for this capture:
    //   - Module labels are static UI strings, not fetched from any live service
    //   - Connectivity badges come from the demo fixture store (all show "Demo")
    //   - No usernames, org names, or real account identifiers appear
    mockSafetyNotes: [
      'All module labels are hard-coded UI strings.',
      'Connectivity badges are set to "Demo" by the fixture layer.',
      'No real account information is rendered on the home route.',
    ],
  },

  {
    // ── Wow moment 2: Sprint dashboard ───────────────────────────────────────
    featureId: 'sprint-dashboard',
    outputFilename: 'nodetoolbox-sprint-dashboard.png',
    route: '/sprint',

    // Wait for the sprint health summary bar so the density of data signals
    // enterprise maturity rather than a loading skeleton.
    waitForSelector: '[data-testid="sprint-health-bar"]',

    viewportWidth: 1440,
    viewportHeight: 900,

    // The activate-demo-mode and load-demo-sprint-data hooks above seed all
    // the data this route needs. The runner must confirm those hooks ran before
    // attempting this capture.
    requiredHookIds: ['activate-demo-mode', 'load-demo-sprint-data'],

    mockSafetyNotes: [
      'Sprint name uses the fixture value "Demo Sprint Q1" — no real sprint names.',
      'Story counts and burn metrics are generated from the seed payload.',
      'Team member avatars are replaced with initials by the demo fixture layer.',
      'No GitHub repo links, PR numbers, or real issue keys appear.',
    ],
  },

  {
    // ── Wow moment 3: Specialist workflow — ServiceNow Hub or ART View ───────
    featureId: 'snow-hub-art',
    outputFilename: 'nodetoolbox-specialist-workflow.png',

    // The runner will attempt the ServiceNow Hub route first. If the page
    // renders a "not configured" placeholder, it falls back to the ART View.
    // Either surface communicates cross-program orchestration capability.
    route: '/snow-hub',
    fallbackRoute: '/art-view',

    // Waiting for the content panel ensures we capture the data surface rather
    // than a loading state.
    waitForSelector: '[data-testid="snow-hub-content"], [data-testid="art-view-content"]',

    viewportWidth: 1440,
    viewportHeight: 900,

    mockSafetyNotes: [
      'ServiceNow records are served from the demo fixture store with fake incident and change IDs.',
      'ART View uses seeded PI planning mock data — no real program increments appear.',
      'All user-facing identifiers are replaced with safe demo values by DEMO_MODE.',
    ],
  },
];

// ── Consolidated definition export ────────────────────────────────────────────

/**
 * The complete NodeToolbox portfolio capture definition consumed by the shared
 * portfolio runner.
 *
 * The runner expects a default export shaped like this object so it can iterate
 * all app definitions with a single dynamic import loop.
 *
 * Keeping the definition data-driven means the runner logic never needs to know
 * which app it is running — it just executes launch, hooks, and captures in
 * order for whatever definition it loaded.
 */
export default {
  // Must match the slug in web/portfolio/data/apps.mjs for asset correlation.
  slug: 'nodetoolbox',
  name: 'NodeToolbox',

  // Playwright is already installed in the NodeToolbox repository, so the
  // runner can invoke it directly without a separate install step.
  captureToolchain: 'playwright',
  captureToolchainNote:
    'Playwright ships with the NodeToolbox repo. The runner invokes npx playwright test --headed=false from the repo directory.',

  launchStrategy: LAUNCH_STRATEGY,
  demoHooks: DEMO_HOOKS,
  captureTargets: CAPTURE_TARGETS,

  // Output directory relative to the forge-terminal project root. Real captured
  // PNGs land here; the storyboard SVG generator skips features whose output
  // file already exists in this directory.
  outputDirPath: 'web/portfolio/assets/nodetoolbox',
};
