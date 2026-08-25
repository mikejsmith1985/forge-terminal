// App-specific portfolio capture definition for Forge Terminal.
//
// This file is the single source of truth for how the portfolio runner
// discovers, captures, and presents Forge Terminal in the showcase.
//
// Consumed by web/portfolio/data/apps.mjs, which merges all per-app
// definitions into the shared PORTFOLIO_APPS array used by the portfolio
// UI and by scripts/portfolio/build-portfolio-assets.mjs.
//
// Every feature below is a surface that ships in the product today. The
// screens are rebuilt from screenshots of the running application in
// scripts/portfolio/screens/, with all workspace, project, and credential
// values replaced by the fictional workspace in forge-terminal-demo-data.mjs.

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

// Every Forge Terminal screen is captured at the same desktop size so the
// showcase cards line up and the side rail keeps its shipped proportions.
const FORGE_SCREEN_WIDTH = 1760;
const FORGE_SCREEN_HEIGHT = 990;

// The vault is a centred modal, so it is captured in a narrower frame.
const FORGE_VAULT_SCREEN_WIDTH = 980;
const FORGE_VAULT_SCREEN_HEIGHT = 790;

function createCaptureTarget(featureId, viewportWidth, viewportHeight) {
  return {
    featureId,
    outputFileName: `forge-terminal-${featureId}.png`,
    viewportWidth,
    viewportHeight,
  };
}

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
      id: 'generate-source-derived-png-screens',
      description:
        'Generate Forge Terminal screens as PNG assets from the shipped UI structure, using the ' +
        'fictional workspace defined in scripts/portfolio/screens/forge-terminal-demo-data.mjs.',
      mockDataApproach:
        'Every repository name, file path, project list, version number, and credential name on ' +
        'screen is invented. No secret value is rendered anywhere, in any screen.',
      runnerInstruction:
        'Run scripts/portfolio/build-portfolio-assets.mjs so the Forge Terminal cards use PNG assets from web/portfolio/assets/forge-terminal.',
    },
  ],
  captureTargets: [
    createCaptureTarget('multi-tab-terminal', FORGE_SCREEN_WIDTH, FORGE_SCREEN_HEIGHT),
    createCaptureTarget('context-engineering', FORGE_SCREEN_WIDTH, FORGE_SCREEN_HEIGHT),
    createCaptureTarget('mcp-integration', FORGE_SCREEN_WIDTH, FORGE_SCREEN_HEIGHT),
    createCaptureTarget('release-manager', FORGE_SCREEN_WIDTH, FORGE_SCREEN_HEIGHT),
    createCaptureTarget('web-app-debugger', FORGE_SCREEN_WIDTH, FORGE_SCREEN_HEIGHT),
    createCaptureTarget('secret-vault', FORGE_VAULT_SCREEN_WIDTH, FORGE_VAULT_SCREEN_HEIGHT),
  ],
};

// ── App definition ────────────────────────────────────────────────────────────
// Exported as a named const so apps.mjs can reference it directly without
// pulling in the launch-strategy or path constants above.
//
// imageKind values:
//   'source-derived-replica' — the portfolio page shows a PNG rendered from source-informed UI structure.
export const FORGE_TERMINAL_APP = {
  slug: 'forge-terminal',
  name: 'Forge Terminal',
  tagline:
    'An agentic development environment: real PTYs, a token-budgeted context engine, an MCP tool ' +
    'bridge, release automation, and a zero-knowledge secret vault in one desktop app.',
  summary:
    'Forge Terminal is where an engineer and a coding agent share one workspace. Real terminal ' +
    'tabs sit beside a rail that turns the hard parts of agent-assisted work into product ' +
    'surfaces: choosing what context to spend tokens on, exposing build tooling to the agent ' +
    'over MCP, cutting a release, recording a browser bug, and handing over credentials without ' +
    'ever revealing them. The process is enforced by a six-phase workflow bar pinned under every tab.',
  accent: '#22d3ee',
  category: 'Desktop + web hybrid',

  // Human-readable launch surface for the portfolio page footer note.
  launchSurface: FORGE_TERMINAL_LAUNCH_STRATEGY.command,

  techStack: ['Go', 'React', 'xterm.js', 'ConPTY', 'WebSocket', 'MCP', 'Playwright'],
  proofNote:
    'Every visual in this section is a PNG rebuilt from the shipped Forge Terminal interface, ' +
    'populated with a fictional workspace. No real repository, machine, or credential appears — ' +
    'and no secret value is rendered in any screen, including the vault.',

  // ── Six shipped surfaces ───────────────────────────────────────────────────
  // Each feature maps to one screen builder in
  // scripts/portfolio/screens/forge-terminal-screens.mjs.
  features: [
    {
      id: 'multi-tab-terminal',
      title: 'Real terminal tabs with a workflow the agent cannot skip',
      wowFactor:
        'This is not a chat window bolted onto a shell. Genuine PTY sessions run beside a ' +
        'command rail, and a six-phase workflow bar tracks the work — with a runtime hook that ' +
        'blocks a commit whose gates were never recorded.',
      whatItShows:
        'A workspace with two live terminal tabs, an agent mid-plan, a project switcher, saved ' +
        'command cards that launch a chosen assistant, and the Specify → Implement phase bar ' +
        'showing gate state under the session.',
      mockDataApproach:
        'The repository, branch, project list, and terminal output all come from a fictional ' +
        'quote-engine service. No real workspace path or project name is shown.',
      capturePlan:
        'Portfolio runner renders the Forge Terminal command rail and terminal surface from the shipped component structure with seeded demo output.',
      imageKind: 'source-derived-replica',
      imagePath: './assets/forge-terminal/forge-terminal-multi-tab-terminal.png',
    },
    {
      id: 'context-engineering',
      title: 'Context engineering with a visible token budget',
      wowFactor:
        'It treats the context window as a budget you spend deliberately. Every file carries its ' +
        'token cost, and a cart shows exactly what the agent will receive before you send it — ' +
        'the difference between directing an agent and hoping it guessed right.',
      whatItShows:
        'The file rail grouped by directory with per-file token counts and modified dates, a ' +
        'heatmap/graph/search switcher, and a Context Cart metering the selection against a ' +
        '128,000-token budget.',
      mockDataApproach:
        'The file tree belongs to the same fictional quote-engine service; filenames, token ' +
        'counts, and dates are invented.',
      capturePlan:
        'Portfolio runner renders the file rail and Context Cart from the shipped layout with a seeded fictional repository tree.',
      imageKind: 'source-derived-replica',
      imagePath: './assets/forge-terminal/forge-terminal-context-engineering.png',
    },
    {
      id: 'mcp-integration',
      title: 'MCP bridge that gives the agent real build environments',
      wowFactor:
        'Forge is an MCP server, not just an MCP client. It hands any connected assistant a set ' +
        'of tools that detect and drive the right build sandbox — native, WSL2, or Docker — so ' +
        'the agent can run a real build instead of guessing at one.',
      whatItShows:
        'Server discovery, the adaptive build-environment bridge reporting its registered tools, ' +
        'the per-repository MCP token, one-click connection for several assistant CLIs, and the ' +
        'live tool list with what each tool does.',
      mockDataApproach:
        'The token path points at a fictional home directory and the connected assistants are ' +
        'shown generically. No real token, host, or repository is displayed.',
      capturePlan:
        'Portfolio runner renders the MCP rail from the shipped panel structure with fictional token and server values.',
      imageKind: 'source-derived-replica',
      imagePath: './assets/forge-terminal/forge-terminal-mcp-integration.png',
    },
    {
      id: 'release-manager',
      title: 'Release manager that ships from inside the terminal',
      wowFactor:
        'Cutting a release is a product surface rather than a runbook: pick the semantic bump, ' +
        'see the resulting version before committing to it, and run the whole build-and-publish ' +
        'pipeline as a background job that survives the session.',
      whatItShows:
        'The release card with current → next version, major/minor/patch choices priced in real ' +
        'version numbers, an optional commit message, and the background release job that reports ' +
        'back by notification.',
      mockDataApproach:
        'A fictional internal service and its invented version history stand in for any real ' +
        'product release cadence.',
      capturePlan:
        'Portfolio runner renders the release manager rail from the shipped card structure with fictional version values.',
      imageKind: 'source-derived-replica',
      imagePath: './assets/forge-terminal/forge-terminal-release-manager.png',
    },
    {
      id: 'web-app-debugger',
      title: 'Follow-me debugger that turns a bug into evidence',
      wowFactor:
        'It closes the worst loop in agent-assisted work — describing a UI bug in prose. The ' +
        'recorder captures the interaction, console, and network traffic, and is explicit about ' +
        'what it cannot see, so the agent gets evidence instead of a description.',
      whatItShows:
        'The debugger panel listing exactly what it captures and what it does not, the optional ' +
        'target app path, external log hook-up, and the record control that starts a session.',
      mockDataApproach:
        'The panel shows only its own capability copy — no captured session, URL, or log content ' +
        'is displayed.',
      capturePlan:
        'Portfolio runner renders the web app debugger rail from the shipped panel structure.',
      imageKind: 'source-derived-replica',
      imagePath: './assets/forge-terminal/forge-terminal-web-app-debugger.png',
    },
    {
      id: 'secret-vault',
      title: 'Zero-knowledge vault the agent can use but never read',
      wowFactor:
        'The security model is the feature. Secrets live in the OS credential store; the agent ' +
        'names where a value should go and the vault injects it into the shell directly. The ' +
        'value never enters the conversation, a file, or a log — and the vault flags a secret ' +
        'that leaked into its own metadata.',
      whatItShows:
        'The vault with stored credentials shown by reference name and environment variable, ' +
        'per-secret auto-inject toggles, reveal and copy controls held behind an unlock, and a ' +
        'rotation warning on an entry whose description looks like it contains a secret.',
      mockDataApproach:
        'Every credential name and environment variable is invented, and no secret value is ' +
        'rendered anywhere on the screen — only the reference that points at one.',
      capturePlan:
        'Portfolio runner renders the vault modal from the shipped layout with fictional credential names and no values.',
      imageKind: 'source-derived-replica',
      imagePath: './assets/forge-terminal/forge-terminal-secret-vault.png',
    },
  ],
};
