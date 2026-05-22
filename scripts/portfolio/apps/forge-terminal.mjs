// App-specific portfolio capture definition for Forge Terminal.
//
// This file is the single source of truth for how the portfolio runner
// discovers, captures, and presents Forge Terminal in the showcase.
//
// Consumed by web/portfolio/data/apps.mjs, which merges all per-app
// definitions into the shared PORTFOLIO_APPS array used by the portfolio
// UI and by scripts/portfolio/build-portfolio-assets.mjs.

// ── Launch strategy ──────────────────────────────────────────────────────────
// Forge Terminal is a Go + React hybrid. The portfolio runner MUST start both
// layers together via run-dev-clean.ps1 rather than running fterm.exe directly.
// The script wipes stale session state, starts the PTY server on a dedicated
// port, and brings up the Vite dev server so screenshots reflect a clean boot.
const FORGE_TERMINAL_LAUNCH_STRATEGY = {
  // Full command the portfolio capture runner should execute before navigating.
  // -Port 9999 is used deliberately to avoid collisions with other services.
  command: '.\\run-dev-clean.ps1 -Port 9999',

  // URL the Playwright capture session should navigate to once the stack is up.
  baseUrl: 'http://localhost:9999',

  // How many seconds to wait after launch before the UI is considered ready.
  // The Go server + Vite dev server both need warm-up time.
  warmupSeconds: 8,

  // The dev script always starts from a clean state, so no pre-capture teardown
  // of leftover processes is needed.
  isCleanLaunch: true,
};

// ── Real screenshot asset paths ───────────────────────────────────────────────
// All three Forge Terminal showcase screenshots are REAL UI captured from the
// live dev build — not generated SVG storyboards. Their source copies live
// at tests/playwright/test-results/ and are produced by the Playwright suite.
// build-portfolio-assets.mjs copies them into the public asset folder below.
const REAL_UI_ASSET_BASE_PATH = './assets/forge-terminal';

// Keyed by descriptive label so features below stay readable without raw paths.
const FORGE_TERMINAL_SCREENSHOT_PATHS = {
  appLoaded:    `${REAL_UI_ASSET_BASE_PATH}/01-app-loaded.png`,
  typedCommand: `${REAL_UI_ASSET_BASE_PATH}/03-typed-command.png`,
  afterPaste:   `${REAL_UI_ASSET_BASE_PATH}/05-after-paste.png`,
};

// ── App definition ────────────────────────────────────────────────────────────
// Exported as a named const so apps.mjs can reference it directly without
// pulling in the launch-strategy or path constants above.
//
// imageKind values:
//   'real-ui'    — the portfolio page shows the actual captured screenshot
//   'storyboard' — the page shows a generated SVG placeholder (none here)
export const FORGE_TERMINAL_APP = {
  slug: 'forge-terminal',
  name: 'Forge Terminal',
  tagline:
    'Agentic terminal UX with real PTYs, workflow enforcement, and remote access in one product.',
  summary:
    'Forge Terminal combines a full terminal, AI-assisted workflows, command cards, and secure remote ' +
    'access. The strongest employer story is the way product design, local tooling, and developer ' +
    'ergonomics converge into one desktop experience.',
  accent: '#5d8cff',
  category: 'Desktop + web hybrid',

  // Human-readable launch surface for the portfolio page footer note.
  launchSurface: FORGE_TERMINAL_LAUNCH_STRATEGY.command,

  // Full strategy object consumed by the portfolio capture runner.
  launchStrategy: FORGE_TERMINAL_LAUNCH_STRATEGY,

  techStack: ['Go', 'React', 'xterm.js', 'Cypress'],
  proofNote:
    'All three showcase screenshots are real UI captured from the Forge Terminal dev build. ' +
    'No storyboard SVGs are needed unless a new feature without a captured screenshot is added.',

  // ── Three wow moments ──────────────────────────────────────────────────────
  // Each feature maps to exactly one real-ui screenshot. The imageKind field
  // makes the asset type explicit so the portfolio renderer and reviewers can
  // tell at a glance whether a screen is production-captured or a placeholder.
  features: [
    {
      id: 'multi-tab-terminal',
      title: 'Multi-tab terminal with command-card acceleration',
      wowFactor:
        'Shows product depth beyond a normal shell wrapper: tabs, saved commands, and quick ' +
        'actions work together as one developer cockpit.',
      whatItShows:
        'A polished terminal workspace with the app shell fully loaded and the first tab active ' +
        'with the prompt ready, demonstrating the clean initial UX at boot.',
      mockDataApproach:
        'Use safe terminal commands and demo-friendly command cards so no customer repositories ' +
        'or secrets appear in the captured state.',
      capturePlan:
        'Portfolio Playwright run: navigate to localhost:9999, wait for the app shell to fully ' +
        'render, then screenshot the loaded state.',
      // Source: tests/playwright/test-results/01-app-loaded.png  →  real UI
      imagePath: FORGE_TERMINAL_SCREENSHOT_PATHS.appLoaded,
      imageKind: 'real-ui',
    },
    {
      id: 'instruction-workflow',
      title: 'Persistent instruction workflow for AI-driven development',
      wowFactor:
        'Shows opinionated UX for repeatable, high-signal AI collaboration — the assistant ' +
        'workflow feels controllable rather than magical.',
      whatItShows:
        'A terminal session mid-flight with a typed command visible, illustrating the direct-input ' +
        'flow that feeds the instruction surface and assistant panel.',
      mockDataApproach:
        'Seed a harmless sample repository context and safe instruction templates so the captured ' +
        'text contains no private identifiers or credentials.',
      capturePlan:
        'Portfolio Playwright run: type a representative safe command into the active terminal ' +
        'tab, then screenshot the typed state.',
      // Source: tests/playwright/test-results/03-typed-command.png  →  real UI
      imagePath: FORGE_TERMINAL_SCREENSHOT_PATHS.typedCommand,
      imageKind: 'real-ui',
    },
    {
      id: 'tunnel-mobile',
      title: 'Remote and mobile access setup',
      wowFactor:
        'Demonstrates platform thinking, networking knowledge, and user-centric onboarding — ' +
        'shows the app is designed for real work, not just localhost demos.',
      whatItShows:
        'A terminal state after a paste action, representing the remote-access and clipboard ' +
        'integration story that makes Forge Terminal useful across devices.',
      mockDataApproach:
        'Use safe hostnames, fake tunnel identifiers, and local-only demo states so no real ' +
        'network topology or credentials appear in the capture.',
      capturePlan:
        'Portfolio Playwright run: paste a safe demo string into the active tab, then screenshot ' +
        'the post-paste state.',
      // Source: tests/playwright/test-results/05-after-paste.png  →  real UI
      imagePath: FORGE_TERMINAL_SCREENSHOT_PATHS.afterPaste,
      imageKind: 'real-ui',
    },
  ],
};
