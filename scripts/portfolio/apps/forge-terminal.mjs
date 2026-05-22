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

export const FORGE_TERMINAL_PORTFOLIO_CONFIG = {
  slug: 'forge-terminal',
  name: 'Forge Terminal',
  localRepoPath: 'C:\\ProjectsWin\\forge-terminal',
  outputDirPath: 'web/portfolio/assets/forge-terminal',
  captureToolchain: 'playwright',
  launchStrategy: {
    localRepoPath: 'C:\\ProjectsWin\\forge-terminal',
    command: FORGE_TERMINAL_LAUNCH_STRATEGY.command,
    readySignal: FORGE_TERMINAL_LAUNCH_STRATEGY.baseUrl,
    environmentVariables: {
      FORGE_DEV_MODE: 'true',
      FORGE_PORT: '9999',
    },
  },
  demoSetupHooks: [
    {
      id: 'generate-code-rendered-mock-screens',
      description:
        'Generate code-rendered mocked Forge Terminal screens from the shared portfolio scene definitions.',
      mockDataApproach:
        'Use fictional repository names, safe workflow output, demo tunnel values, and generic assistant text so no private terminal state is published.',
      runnerInstruction:
        'Run scripts/portfolio/build-portfolio-assets.mjs so the Forge Terminal cards use generated SVG screen mockups from web/portfolio/assets/generated.',
    },
  ],
  captureTargets: [
    {
      featureId: 'multi-tab-terminal',
      outputFileName: 'forge-terminal-multi-tab-terminal.svg',
      viewportWidth: 1440,
      viewportHeight: 900,
    },
    {
      featureId: 'instruction-workflow',
      outputFileName: 'forge-terminal-instruction-workflow.svg',
      viewportWidth: 1440,
      viewportHeight: 900,
    },
    {
      featureId: 'tunnel-mobile',
      outputFileName: 'forge-terminal-tunnel-mobile.svg',
      viewportWidth: 1440,
      viewportHeight: 900,
    },
  ],
};

// ── App definition ────────────────────────────────────────────────────────────
// Exported as a named const so apps.mjs can reference it directly without
// pulling in the launch-strategy or path constants above.
//
// imageKind values:
//   'code-rendered' — the portfolio page shows a generated mocked app screen
export const FORGE_TERMINAL_APP = {
  slug: 'forge-terminal',
  name: 'Forge Terminal',
  tagline:
    'Agentic terminal UX with real PTYs, workflow enforcement, and remote access in one product.',
  summary:
    'Forge Terminal combines a full terminal, AI-assisted workflows, command cards, and secure remote ' +
    'access. The strongest product story is the way product design, local tooling, and developer ' +
    'ergonomics converge into one desktop experience.',
  accent: '#5d8cff',
  category: 'Desktop + web hybrid',

  // Human-readable launch surface for the portfolio page footer note.
  launchSurface: FORGE_TERMINAL_LAUNCH_STRATEGY.command,

  techStack: ['Go', 'React', 'xterm.js', 'Cypress'],
  proofNote:
    'All three visuals in this section are polished code-rendered mock interfaces built from the ' +
    'implemented product structure and seeded demo content.',

  // ── Three wow moments ──────────────────────────────────────────────────────
  // Each feature maps to one code-rendered mocked UI screen with safe sample
  // data. This keeps the portfolio presentation polished without repeating
  // local development screenshots.
  features: [
    {
      id: 'multi-tab-terminal',
      title: 'Multi-tab terminal with command-card acceleration',
      wowFactor:
        'Shows product depth beyond a normal shell wrapper: tabs, saved commands, and quick ' +
        'actions work together as one developer cockpit.',
      whatItShows:
        'A mocked Forge Terminal workspace with four terminal tabs, a workflow-status command ' +
        'running, pinned command cards, and repo health signals visible in one screen.',
      mockDataApproach:
        'The screen uses a fictional benefits-enrollment demo repository, safe workflow-gate ' +
        'output, and generic command cards instead of a real customer workspace.',
      capturePlan:
        'Portfolio Playwright run: navigate to localhost:9999, wait for the app shell to fully ' +
        'render, then screenshot the loaded state.',
      imageKind: 'code-rendered',
    },
    {
      id: 'instruction-workflow',
      title: 'Persistent instruction workflow for AI-driven development',
      wowFactor:
        'Shows opinionated UX for repeatable, high-signal AI collaboration — the assistant ' +
        'workflow feels controllable rather than magical.',
      whatItShows:
        'A mocked assistant workflow screen with the user request, Copilot response, workflow ' +
        'gates, and task state presented together so the AI process feels controlled.',
      mockDataApproach:
        'The conversation text, task name, and workflow checklist are portfolio-safe examples ' +
        'that describe this visual rebuild rather than a private development session.',
      capturePlan:
        'Portfolio Playwright run: type a representative safe command into the active terminal ' +
        'tab, then screenshot the typed state.',
      imageKind: 'code-rendered',
    },
    {
      id: 'tunnel-mobile',
      title: 'Remote and mobile access setup',
      wowFactor:
        'Demonstrates platform thinking, networking knowledge, and user-centric onboarding — ' +
        'shows the app is designed for real work, not just localhost demos.',
      whatItShows:
        'A mocked remote-access setup screen with a named tunnel, companion PWA handoff, one-time ' +
        'access code, and safety controls displayed in the same flow.',
      mockDataApproach:
        'The hostname, access code, and connection settings are fictional portfolio values that ' +
        'show the intended UX without exposing real network topology.',
      capturePlan:
        'Portfolio Playwright run: paste a safe demo string into the active tab, then screenshot ' +
        'the post-paste state.',
      imageKind: 'code-rendered',
    },
  ],
};
