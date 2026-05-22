// Portfolio capture and config definition for MBL2PC.
//
// This file is the single operational source of truth for how the MBL2PC
// portfolio screenshots are captured. It encodes the launch strategy, the
// demo-state setup hooks, and the three wow-moment capture targets so a
// portfolio runner can reproduce the same showcase output deterministically.
//
// The matching narrative data (title, wowFactor, etc.) lives in
// web/portfolio/data/apps.mjs under slug "mbl2pc".

// ── Constants ─────────────────────────────────────────────────────────────

/** Absolute path to the MBL2PC repository on the portfolio capture machine. */
const LOCAL_REPO_PATH = 'C:\\ProjectsWin\\mbl2pc';

/**
 * Port on which the MBL2PC local test server listens during a demo capture.
 * The test_local.py script defaults to this port, kept here as a single
 * source of truth so every URL in this file derives from one value.
 */
const LOCAL_SERVER_PORT = 5000;

/** Base URL of the running MBL2PC local test server. */
const LOCAL_SERVER_BASE_URL = `http://localhost:${LOCAL_SERVER_PORT}`;

// ── Launch strategy ────────────────────────────────────────────────────────

/**
 * Instructions for starting MBL2PC in a state suitable for portfolio capture.
 *
 * The `command` field is run from `localRepoPath`. The `readySignal` string
 * must appear in stdout before the capture runner proceeds — this avoids
 * timing-based sleeps.
 */
const LAUNCH_STRATEGY = {
  localRepoPath: LOCAL_REPO_PATH,
  command: 'python test_local.py',
  readySignal: `Running on http://127.0.0.1:${LOCAL_SERVER_PORT}`,
  // No environment overrides needed: test_local.py already seeds safe demo
  // messages and serves the real send.html UI locally.
  environmentVariables: {},
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
    id: 'set-demo-device-name',
    description:
      'Inject a safe demo device name into localStorage so the personalization header shows a recognisable but non-personal label.',
    mockDataApproach:
      'Use the string "Demo Device" — generic enough to communicate the feature without revealing the capturist\'s machine name.',
    playwrightAction: async (page) => {
      await page.goto(`${LOCAL_SERVER_BASE_URL}/send.html`);
      await page.evaluate(() => {
        localStorage.setItem('mbl2pc_device_name', 'Demo Device');
        localStorage.setItem('mbl2pc_theme', 'dark-ocean');
        localStorage.setItem('mbl2pc_font_size', '15');
      });
      // Reload so the injected values are picked up by app initialisation.
      await page.reload();
    },
  },
  {
    id: 'seed-demo-messages',
    description:
      'Verify the seeded message list from test_local.py is visible so the chat dashboard looks active rather than empty.',
    mockDataApproach:
      'The test_local.py script already seeds deterministic fake messages. This hook only confirms they rendered correctly.',
    playwrightAction: async (page) => {
      // Wait for at least one message bubble to be present before proceeding.
      await page.locator('.message-bubble').first().waitFor();
    },
  },
  {
    id: 'seed-demo-snippets',
    description:
      'Inject sample clipboard snippet cards into the app state so the clipboard-and-files view tells a complete story.',
    mockDataApproach:
      'Snippets contain only generic demo text (code samples, a short note, a file reference) with no personal data.',
    playwrightAction: async (page) => {
      await page.evaluate(() => {
        localStorage.setItem(
          'mbl2pc_snippets',
          JSON.stringify([
            { id: 'snp-1', label: 'Quick note', text: 'Pick up the demo build from the CI link above.' },
            { id: 'snp-2', label: 'Code snippet', text: 'console.log("portfolio demo — safe state");' },
            {
              id: 'snp-3',
              label: 'File reference',
              text: 'design/showcase-v2.fig — shared via MBL2PC on 2025-01-10',
            },
          ]),
        );
      });
    },
  },
];

// ── Wow-moment capture targets ─────────────────────────────────────────────

/**
 * The three portfolio showcase captures for MBL2PC.
 *
 * Each entry maps to a feature in web/portfolio/data/apps.mjs (same `id`).
 * The `captureAction` field describes what the runner does immediately before
 * calling page.screenshot(), allowing precise framing without arbitrary waits.
 */
const WOW_MOMENT_CAPTURES = [
  {
    id: 'chat-dashboard',
    title: 'Rich chat dashboard with search, pinning, and timeline depth',
    outputFileName: 'mbl2pc-chat-dashboard.png',
    captureUrl: `${LOCAL_SERVER_BASE_URL}/send.html`,
    captureAction: async (page) => {
      // Confirm the message list is rendered — the seeded messages make the
      // timeline look busy and real without exposing personal content.
      await page.locator('.message-bubble').first().waitFor();
    },
    viewportWidth: 1440,
    viewportHeight: 900,
  },
  {
    id: 'personalization',
    title: 'Theme, font, and identity customization',
    outputFileName: 'mbl2pc-personalization.png',
    captureUrl: `${LOCAL_SERVER_BASE_URL}/send.html`,
    captureAction: async (page) => {
      // Open the settings or personalization panel so theme, font, and device
      // name controls are all visible in the same frame.
      const settingsButton = page.getByRole('button', { name: /settings|personalise|theme/i });
      await settingsButton.click();
      await page.locator('.settings-panel, .theme-panel').first().waitFor();
    },
    viewportWidth: 1440,
    viewportHeight: 900,
  },
  {
    id: 'clipboard-and-files',
    title: 'Clipboard sync, snippets, and file-sharing workflow',
    outputFileName: 'mbl2pc-clipboard-and-files.png',
    captureUrl: `${LOCAL_SERVER_BASE_URL}/send.html`,
    captureAction: async (page) => {
      // Open the snippets or clipboard tab so the injected demo snippet cards
      // are visible alongside the active conversation.
      const snippetsButton = page.getByRole('button', { name: /snippets|clipboard/i });
      await snippetsButton.click();
      await page.locator('.snippets-panel, .clipboard-panel').first().waitFor();
    },
    viewportWidth: 1440,
    viewportHeight: 900,
  },
];

// ── Exported definition ────────────────────────────────────────────────────

/**
 * Full portfolio capture and config definition for MBL2PC.
 *
 * A portfolio runner imports this object and uses it to launch the app,
 * apply demo state, capture each wow moment, and generate storyboard SVGs
 * as fallbacks when the real UI is not available.
 */
export const MBL2PC_PORTFOLIO_CONFIG = {
  slug: 'mbl2pc',
  name: 'MBL2PC',
  localRepoPath: LOCAL_REPO_PATH,
  launchStrategy: LAUNCH_STRATEGY,
  demoSetupHooks: DEMO_SETUP_HOOKS,
  wowMomentCaptures: WOW_MOMENT_CAPTURES,
};
