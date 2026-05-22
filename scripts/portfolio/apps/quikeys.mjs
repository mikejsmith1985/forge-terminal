// App-specific portfolio capture and configuration definition for QuiKeys.
//
// This file is the single source of truth for everything the portfolio pipeline
// needs to capture, seed, and narrate for the QuiKeys showcase. It intentionally
// stays isolated from shared runner files and from other app definitions so that
// QuiKeys-specific choices (native desktop screenshots, vault seeding, unlock flow)
// never bleed into the generic capture helpers.
//
// Relevant repository: C:\ProjectsWin\QuiKeys
// Launch surface:      python src\main.py   (starts the Tkinter GUI directly)
// Screenshot strategy: native desktop — see SCREENSHOT_STRATEGY below.

// ── Constants ──────────────────────────────────────────────────────────────────

// Local path to the QuiKeys source repository on this machine.
// The portfolio runner uses this to derive the Python interpreter, asset paths,
// and any temporary vault files it needs to create before a capture session.
export const QUIKEYS_REPO_PATH = 'C:\\ProjectsWin\\QuiKeys';

// Relative path inside the repository where the application entry point lives.
export const QUIKEYS_ENTRY_POINT = 'src\\main.py';

// Name used as the unique key throughout the shared portfolio data file.
export const QUIKEYS_SLUG = 'quikeys';

// Accent colour that must match the value in web/portfolio/data/apps.mjs so
// source-derived PNG replicas produced from this config stay visually consistent.
export const QUIKEYS_ACCENT_COLOUR = '#ff5fa2';

// ── Screenshot Strategy ────────────────────────────────────────────────────────

// QuiKeys renders native Tkinter windows. Playwright and Cypress cannot reach
// those windows, so the capture pipeline uses a SOURCE-DERIVED REPLICA strategy instead:
//
//   1. The capture helper launches `python src\main.py` with the PORTFOLIO_VAULT
//      environment variable pointing at the seeded demo vault file.
//   2. It waits for the target Tkinter window to become visible by polling the
//      OS window list (win32gui on Windows, wmctrl/xdotool on Linux/macOS).
//   3. Once the correct window title is confirmed, it calls the OS screenshot
//      API (mss or PIL.ImageGrab) cropped to that window's bounding rectangle.
//   4. The resulting PNG is saved under web/portfolio/assets/quikeys/ so the
//      shared build-portfolio-assets.mjs runner can publish it directly.
//
// IMPORTANT: do not attempt Cypress automation against QuiKeys. The portfolio
// capture runner renders a browser PNG replica from the Tkinter layouts and
// seeded macro data below so no native desktop automation is required.
export const SCREENSHOT_STRATEGY = {
  // Signals to the runner that this app needs the native-desktop path, not
  // the browser-based Playwright/Cypress path used by other portfolio apps.
  captureMethod: 'source-derived-replica',

  // Python-based screen capture library preferred by the capture helper.
  // Pillow (PIL.ImageGrab) is already a QuiKeys dependency, so no extra
  // install is required.
  captureLibrary: 'pillow-imagegrab',

  // How many milliseconds to wait after spawning the Python process before
  // the first window-visible poll attempt. Tkinter startup is fast but the
  // OS compositor needs a moment to compose the window.
  startupDelayMs: 2000,

  // Maximum number of poll attempts before the capture is considered failed.
  maxWindowPollAttempts: 20,

  // Milliseconds between each poll attempt.
  windowPollIntervalMs: 500,

  // Output directory for captured PNGs, relative to the forge-terminal root.
  outputDirectory: 'web\\portfolio\\assets\\quikeys',
};

// ── Demo-Safe Seeded Vault State ───────────────────────────────────────────────

// QuiKeys stores its data in an encrypted local vault. To keep screenshots safe
// for employer-facing demos, the portfolio capture session uses a purpose-built
// DEMO VAULT — a pre-seeded file that contains only fictional, safe values and
// that can be freely committed to this repository or shared without risk.
//
// The demo vault is never the user's real vault. It is created fresh from the
// seed data below every time the capture helper runs, which guarantees that
// screenshots are deterministic and do not accidentally expose real credentials.
//
// Seeding mechanics:
//   - The capture helper writes SEEDED_VAULT_STATE to a temporary .vault file
//     before launching QuiKeys.
//   - QuiKeys is started with the PORTFOLIO_VAULT environment variable pointing
//     at that temporary file so the app loads the demo state instead of the
//     default user vault.
//   - The master password used to open the demo vault is DEMO_VAULT_PASSWORD
//     (a plain, safe string with no real-world value).
//   - After the capture session ends, the temporary vault file is deleted.

// The master password for the demo vault. Safe to store here because this
// vault contains no real secrets — only the fictional macro data below.
export const DEMO_VAULT_PASSWORD = 'PortfolioDemo2024!';

// The complete seeded state that the capture helper writes into the demo vault
// before each capture session. All values are fictional and employer-safe.
export const SEEDED_VAULT_STATE = {
  // Version tag so the capture helper can detect schema drift if QuiKeys
  // changes its storage format between development sessions.
  schemaVersion: '1',

  // Whether the vault should appear as "unlocked" when the main window opens.
  // Set to false for the unlock-flow capture (so the password prompt shows),
  // and overridden to true for the macro-manager and macro-dialog captures.
  isVaultUnlocked: false,

  // Seeded macros. All hotkeys, labels, and values are fictional demo entries.
  // No real passwords, tokens, API keys, or personal data appear here.
  macros: [
    {
      id: 'demo-macro-git-push',
      label: 'Git Push Origin',
      category: 'Development',
      hotkey: 'Ctrl+Shift+G',
      // The `value` field is what QuiKeys types when the macro fires.
      // Using a generic safe command that looks plausible on screen.
      value: 'git push origin main --follow-tags',
      isMasked: false,
      isEnabled: true,
    },
    {
      id: 'demo-macro-deploy-staging',
      label: 'Deploy to Staging',
      category: 'DevOps',
      hotkey: 'Ctrl+Shift+D',
      value: 'npm run deploy:staging',
      isMasked: false,
      isEnabled: true,
    },
    {
      id: 'demo-macro-api-token',
      label: 'API Token (demo)',
      category: 'Credentials',
      hotkey: 'Ctrl+Shift+T',
      // A clearly fictional token value. The masked flag means QuiKeys
      // displays asterisks in the manager table — exactly the UX moment
      // the screenshot is designed to show.
      value: 'tok_demo_0000000000000000000000000000',
      isMasked: true,
      isEnabled: true,
    },
    {
      id: 'demo-macro-standup-template',
      label: 'Daily Standup',
      category: 'Communication',
      hotkey: 'Ctrl+Shift+S',
      value: 'Yesterday: completed feature work.\nToday: code review and testing.\nBlockers: none.',
      isMasked: false,
      isEnabled: true,
    },
    {
      id: 'demo-macro-ssh-demo',
      label: 'SSH Demo Server',
      category: 'Infrastructure',
      hotkey: 'Ctrl+Shift+H',
      value: 'ssh demo@192.0.2.42',
      isMasked: false,
      isEnabled: false, // Disabled macro demonstrates the enabled/disabled toggle.
    },
    {
      id: 'demo-macro-docker-up',
      label: 'Docker Compose Up',
      category: 'DevOps',
      hotkey: 'Ctrl+Shift+U',
      value: 'docker compose up --build -d',
      isMasked: false,
      isEnabled: true,
    },
  ],

  // Category list used by the macro manager dropdown. Must include every
  // category referenced in the macros array above.
  categories: ['Development', 'DevOps', 'Credentials', 'Communication', 'Infrastructure'],
};

// ── Unlock-Flow Demo State ─────────────────────────────────────────────────────

// The unlock-flow capture needs the vault to appear locked so the password
// prompt is visible. This object is the per-capture override that the capture
// helper merges on top of SEEDED_VAULT_STATE before that specific screenshot.
//
// The helper applies it like:
//   const unlockVaultState = { ...SEEDED_VAULT_STATE, ...UNLOCK_FLOW_OVERRIDES };
export const UNLOCK_FLOW_OVERRIDES = {
  // Force the locked state so QuiKeys shows the unlock/password prompt window.
  isVaultUnlocked: false,

  // Show a hint message in the unlock window that looks intentional and branded
  // rather than a blank prompt. Some builds of QuiKeys support a hint field.
  unlockHint: 'Enter your portfolio demo password to continue.',
};

// ── Macro Manager Demo State ───────────────────────────────────────────────────

// The macro-manager capture needs the vault to be already unlocked and the
// full macro list visible. This override puts the app in that state.
export const MACRO_MANAGER_OVERRIDES = {
  isVaultUnlocked: true,
};

// ── Macro Dialog Demo State ────────────────────────────────────────────────────

// The macro-dialog capture shows the add/edit form pre-filled with a realistic
// but safe example. The capture helper passes these values to QuiKeys via the
// PORTFOLIO_PREFILL_MACRO environment variable so the dialog opens populated.
export const MACRO_DIALOG_PREFILL = {
  label: 'Build and Test',
  category: 'Development',
  hotkey: 'Ctrl+Shift+B',
  value: 'npm run build && npm test',
  isMasked: false,
  isEnabled: true,
};

// ── Wow Moments ───────────────────────────────────────────────────────────────

// Three showcase features, each designed to tell a distinct employer story.
// These entries mirror the shape used in web/portfolio/data/apps.mjs so the
// capture helper can cross-reference them without importing the shared file.
//
// Rule: never modify the shared apps.mjs to make this file work. If a field
// here diverges from apps.mjs, this file wins for capture-pipeline purposes.
export const WOW_MOMENTS = [
  {
    id: 'unlock-flow',
    title: 'First-run unlock and secure vault setup',

    // The primary signal this screenshot sends to an interviewer or hiring manager.
    wowFactor: 'Demonstrates security thinking without sacrificing clarity.',

    // What a viewer should take away when they see the screenshot.
    whatItShows:
      'A mocked native unlock dialog with masked password input, vault location, encryption ' +
      'context, and the trust cues a user needs before opening sensitive macros.',

    // How the demo state is kept safe (no real credentials in the screenshot).
    mockDataApproach:
      'The vault path, masked password, and encryption state are fictional portfolio values; ' +
      'no real master password or credential value is shown.',

    // Exact steps the capture helper must follow to produce a good screenshot.
    capturePlan:
      'Start QuiKeys via python src\\main.py with PORTFOLIO_VAULT pointing at the ' +
      'seeded demo vault and isVaultUnlocked=false. Wait for the unlock window to appear ' +
      '(poll window title for "QuiKeys" or "Unlock"). Capture the full window bounds. ' +
      'Do not enter the password — the locked state is the story.',

    // Target window title prefix as reported by the OS window manager.
    expectedWindowTitle: 'QuiKeys',

    // Vault override to apply before this specific capture.
    vaultOverride: 'UNLOCK_FLOW_OVERRIDES',

    // Output filename for this capture, relative to SCREENSHOT_STRATEGY.outputDirectory.
    outputFilename: 'quikeys-unlock-flow.png',
  },

  {
    id: 'macro-manager',
    title: 'Macro manager for operational shortcuts and guarded secrets',

    wowFactor: 'Shows a power-user table workflow with strong utility value.',

    whatItShows:
      'A mocked macro table with names, hotkeys, triggers, categories, actions, and a masked ' +
      'token row so the desktop workflow reads like a real power-user manager.',

    mockDataApproach:
      'The table uses fictional Development, Communication, DevOps, and Credentials rows; ' +
      'the token-like value is deliberately masked with bullets.',

    capturePlan:
      'Start QuiKeys with isVaultUnlocked=true and the full seeded macro list. ' +
      'Wait for the main manager window to appear. Ensure the macro table is scrolled ' +
      'to the top so all six rows are visible (or as many as fit without scrolling). ' +
      'Capture the full window bounds.',

    expectedWindowTitle: 'QuiKeys',

    vaultOverride: 'MACRO_MANAGER_OVERRIDES',

    outputFilename: 'quikeys-macro-manager.png',
  },

  {
    id: 'macro-dialog',
    title: 'Add and edit dialog for secure automation rules',

    wowFactor: 'Shows detail-oriented form design inside a desktop app.',

    whatItShows:
      'A mocked add/edit dialog with name, safe command text, hotkey, text trigger, category, ' +
      'and masking choice visible before the user saves the automation.',

    mockDataApproach:
      'The dialog is prefilled with a fictional Build and Test macro using a safe npm command, ' +
      'not a password, token, or private shortcut.',

    capturePlan:
      'Start QuiKeys with the vault unlocked and open the add/edit dialog ' +
      'programmatically (via PORTFOLIO_OPEN_DIALOG=add environment variable if ' +
      'the build supports it, otherwise trigger the "Add" button via the OS ' +
      'accessibility API). Wait for the dialog window to appear. Let the ' +
      'PORTFOLIO_PREFILL_MACRO values populate. Capture the dialog window bounds.',

    expectedWindowTitle: 'Add Macro',

    vaultOverride: 'MACRO_MANAGER_OVERRIDES',

    outputFilename: 'quikeys-macro-dialog.png',
  },
];

// ── Capture Session Configuration (assembled) ─────────────────────────────────

// A single exported object that the portfolio runner can import to drive the
// entire QuiKeys capture session without needing to know the individual pieces.
//
// The runner iterates over captureSteps in order, applying vaultOverride and
// dialogPrefill for each step before spawning the Python process.
export const QUIKEYS_CAPTURE_CONFIG = {
  slug: QUIKEYS_SLUG,
  repoPath: QUIKEYS_REPO_PATH,
  entryPoint: QUIKEYS_ENTRY_POINT,
  accentColour: QUIKEYS_ACCENT_COLOUR,
  screenshotStrategy: SCREENSHOT_STRATEGY,
  demoVaultPassword: DEMO_VAULT_PASSWORD,
  seededVaultState: SEEDED_VAULT_STATE,

  captureSteps: [
    {
      wowMoment: WOW_MOMENTS[0], // unlock-flow
      vaultState: { ...SEEDED_VAULT_STATE, ...UNLOCK_FLOW_OVERRIDES },
      dialogPrefill: null,
    },
    {
      wowMoment: WOW_MOMENTS[1], // macro-manager
      vaultState: { ...SEEDED_VAULT_STATE, ...MACRO_MANAGER_OVERRIDES },
      dialogPrefill: null,
    },
    {
      wowMoment: WOW_MOMENTS[2], // macro-dialog
      vaultState: { ...SEEDED_VAULT_STATE, ...MACRO_MANAGER_OVERRIDES },
      dialogPrefill: MACRO_DIALOG_PREFILL,
    },
  ],
};

export const QUIKEYS_APP = {
  slug: 'quikeys',
  name: 'QuiKeys',
  tagline:
    'Secure keyboard automation and credential helper built as a native desktop experience.',
  summary:
    'QuiKeys is the strongest native-app story in the set. It demonstrates platform APIs, encrypted storage, and operator-focused UX in a compact product that feels genuinely useful.',
  accent: QUIKEYS_ACCENT_COLOUR,
  category: 'Native desktop utility',
  launchSurface: 'python src\\main.py',
  techStack: ['Python', 'Tkinter', 'Pillow', 'cryptography'],
  proofNote:
    'All three visuals in this section are PNG source-derived replicas based on the shipped desktop flows and safe seeded macro data.',
  features: WOW_MOMENTS.map((wowMoment) => ({
    id: wowMoment.id,
    title: wowMoment.title,
    wowFactor: wowMoment.wowFactor,
    whatItShows: wowMoment.whatItShows,
    mockDataApproach: wowMoment.mockDataApproach,
    capturePlan: wowMoment.capturePlan,
    imageKind: 'source-derived-replica',
    imagePath: `./assets/quikeys/quikeys-${wowMoment.id}.png`,
  })),
};

export const QUIKEYS_PORTFOLIO_CONFIG = {
  slug: QUIKEYS_SLUG,
  name: 'QuiKeys',
  localRepoPath: QUIKEYS_REPO_PATH,
  outputDirPath: 'web/portfolio/assets/quikeys',
  captureToolchain: 'playwright-source-derived',
  launchStrategy: {
    localRepoPath: QUIKEYS_REPO_PATH,
    command: `python ${QUIKEYS_ENTRY_POINT}`,
    readySignal: 'QuiKeys',
    environmentVariables: {
      PORTFOLIO_VAULT: '%TEMP%\\quikeys-portfolio-demo.vault',
    },
  },
  demoSetupHooks: [
    {
      id: 'seed-demo-vault',
      description:
        'Create a temporary encrypted demo vault from the fictional seeded macro state before launching the native window.',
      mockDataApproach:
        'The seeded vault contains only fictional macro values and uses a disposable demo password.',
      runnerInstruction:
        'Write SEEDED_VAULT_STATE to a temporary vault file, point PORTFOLIO_VAULT at that file, and delete it after the capture session ends.',
    },
  ],
  captureTargets: QUIKEYS_CAPTURE_CONFIG.captureSteps.map((captureStep) => ({
    featureId: captureStep.wowMoment.id,
    outputFileName: captureStep.wowMoment.outputFilename,
    waitForWindowTitle: captureStep.wowMoment.expectedWindowTitle,
    viewportWidth: 1200,
    viewportHeight: 760,
  })),
};
