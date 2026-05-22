// Portfolio capture and config definition for EZTest.
//
// This file is the single operational source of truth for how the EZTest
// portfolio screenshots are captured. It encodes the launch strategy, the
// demo-state setup hooks, and the three wow-moment capture targets so a
// portfolio runner can reproduce the same showcase output deterministically.
//
// The matching narrative data (title, wowFactor, etc.) lives in
// web/portfolio/data/apps.mjs under slug "eztest".

// ── Constants ─────────────────────────────────────────────────────────────

/** Absolute path to the EZTest repository on the portfolio capture machine. */
const LOCAL_REPO_PATH = 'C:\\ProjectsWin\\EZTest';

/**
 * Port on which the EZTest wizard UI server listens during a demo capture.
 * Kept as a named constant so every URL below derives from one place.
 */
const WIZARD_PORT = 7433;

/** Base URL of the running wizard UI server. */
const WIZARD_BASE_URL = `http://localhost:${WIZARD_PORT}`;

// ── Launch strategy ────────────────────────────────────────────────────────

/**
 * Instructions for starting EZTest in a state suitable for portfolio capture.
 *
 * The `command` field is run from `localRepoPath`. The `readySignal` string
 * must appear in stdout before the capture runner proceeds — this avoids
 * timing-based sleeps.
 */
const LAUNCH_STRATEGY = {
  localRepoPath: LOCAL_REPO_PATH,
  command: `npm run dev -- ui -p ${WIZARD_PORT}`,
  readySignal: `localhost:${WIZARD_PORT}`,
  // Point at the sample fixture app bundled with the repo so no real project
  // paths or credentials are required during demo capture.
  environmentVariables: {
    EZTEST_PROJECT_PATH: `${LOCAL_REPO_PATH}\\fixture-app`,
    EZTEST_DEMO_MODE: 'true',
  },
};

// ── Demo setup hooks ───────────────────────────────────────────────────────

/**
 * Ordered list of setup steps a capture runner executes after the server is
 * ready but before any screenshot is taken.
 *
 * Each step is intentionally small and named so failures are easy to diagnose.
 * "mockDataApproach" mirrors the field name used in the narrative data so the
 * two sources stay aligned.
 */
const DEMO_SETUP_HOOKS = [
  {
    id: 'seed-project-context',
    description:
      'Configure the wizard with a safe local project path and a placeholder AI provider key so the onboarding overlay renders its second step.',
    mockDataApproach:
      'Use the bundled fixture-app directory and a non-functional placeholder key string so no real secrets are present.',
    playwrightAction: async (page) => {
      // Navigate to the wizard root — the onboarding overlay appears automatically
      // on first load when no project config exists in session storage.
      await page.goto(`${WIZARD_BASE_URL}/`);
    },
  },
  {
    id: 'complete-onboarding',
    description:
      'Fill in the onboarding form with the demo project path and a placeholder key, then submit to land on the dashboard.',
    mockDataApproach:
      'The fixture app path never exposes real test files. The AI provider key is a safe non-functional placeholder.',
    playwrightAction: async (page) => {
      await page.getByLabel('Project directory').fill(`${LOCAL_REPO_PATH}\\fixture-app`);
      await page.getByLabel('AI provider key').fill('demo-key-portfolio-safe');
      await page.getByRole('button', { name: 'Continue' }).click();
    },
  },
  {
    id: 'seed-run-transcript',
    description:
      'Inject a pre-recorded success transcript into session storage so the run modal can be opened to a deterministic completed state.',
    mockDataApproach:
      'The transcript contains only safe fixture-app test names and generic pass/fail lines — no customer data.',
    playwrightAction: async (page) => {
      await page.evaluate(() => {
        // The EZTest wizard reads this key to pre-populate the run modal viewer.
        sessionStorage.setItem(
          'eztest_demo_run_transcript',
          JSON.stringify({
            status: 'passed',
            totalTests: 12,
            passedTests: 12,
            failedTests: 0,
            logLines: [
              '[PASS] fixture-app: homepage loads',
              '[PASS] fixture-app: button click emits event',
              '[PASS] fixture-app: form validation rejects empty fields',
              '✓  12 tests completed (safe demo state)',
            ],
          }),
        );
      });
    },
  },
];

// ── Wow-moment capture targets ─────────────────────────────────────────────

/**
 * The three portfolio showcase captures for EZTest.
 *
 * Each entry maps to a feature in web/portfolio/data/apps.mjs (same `id`).
 * The `captureAction` field describes what the runner does immediately before
 * calling page.screenshot(), allowing precise framing without arbitrary waits.
 */
const WOW_MOMENT_CAPTURES = [
  {
    id: 'onboarding',
    title: 'Two-step onboarding that explains value without jargon',
    outputFileName: 'eztest-onboarding.png',
    // Navigate fresh so the onboarding overlay is guaranteed to be visible.
    captureUrl: `${WIZARD_BASE_URL}/`,
    captureAction: async (page) => {
      // Clear any existing session so the onboarding overlay is on step one.
      await page.evaluate(() => sessionStorage.clear());
      await page.reload();
      // Wait for the overlay to become interactive before shooting.
      await page.getByRole('dialog', { name: /set up your project/i }).waitFor();
    },
    viewportWidth: 1440,
    viewportHeight: 900,
  },
  {
    id: 'dashboard-actions',
    title: 'Action dashboard that frames testing work as outcomes',
    outputFileName: 'eztest-dashboard-actions.png',
    captureUrl: `${WIZARD_BASE_URL}/`,
    captureAction: async (page) => {
      // The dashboard is visible after onboarding completes. The setup hook
      // already completed onboarding, so wait for the six action cards.
      await page.getByTestId('action-card-grid').waitFor();
    },
    viewportWidth: 1440,
    viewportHeight: 900,
  },
  {
    id: 'run-modal',
    title: 'Live run modal with progress, logs, and follow-up actions',
    outputFileName: 'eztest-run-modal.png',
    captureUrl: `${WIZARD_BASE_URL}/`,
    captureAction: async (page) => {
      // Open the run modal via the "Run tests" action card.
      await page.getByRole('button', { name: /run tests/i }).click();
      // Wait for the transcript log panel to be populated with the seeded data.
      await page.getByTestId('run-log-panel').waitFor();
    },
    viewportWidth: 1440,
    viewportHeight: 900,
  },
];

// ── Exported definition ────────────────────────────────────────────────────

/**
 * Full portfolio capture and config definition for EZTest.
 *
 * A portfolio runner imports this object and uses it to launch the app,
 * apply demo state, capture each wow moment, and generate storyboard SVGs
 * as fallbacks when the real UI is not available.
 */
export const EZTEST_PORTFOLIO_CONFIG = {
  slug: 'eztest',
  name: 'EZTest',
  localRepoPath: LOCAL_REPO_PATH,
  launchStrategy: LAUNCH_STRATEGY,
  demoSetupHooks: DEMO_SETUP_HOOKS,
  wowMomentCaptures: WOW_MOMENT_CAPTURES,
};
