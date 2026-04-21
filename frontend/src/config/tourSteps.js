/**
 * tourSteps.js
 *
 * Defines the 7-step guided feature tour shown to new users of Forge Terminal.
 * Each step is displayed by the TourOverlay component and targets a specific UI
 * element using a CSS selector. TOUR_VERSION is checked against localStorage so
 * users who completed an older tour will see the updated tour on next launch.
 */

// ── Tour Step Definitions ──────────────────────────────────────────────────

const TOUR_STEPS = [
  // ── Step 1: Welcome ──────────────────────────────────────────────────────
  {
    title: 'Welcome to Forge Terminal 🔥',
    content:
      'Forge is an AI-enhanced terminal built for developers who want more than a plain command line. ' +
      'It brings smart tooling, saved commands, secure secrets management, and live git insights — all in one place.\n\n' +
      'This short tour walks you through the key features so you can hit the ground running. ' +
      'It only takes a minute, and you can replay it any time from Settings.',
  },

  // ── Step 2: Command Cards ─────────────────────────────────────────────────
  {
    title: 'Command Cards',
    selector: '.cards-list',
    fallbackSelector: '.command-cards-panel, [class*="command-card"]',
    spotlight: true,
    arrow: 'right',
    content:
      '**Command Cards** are saved shortcuts for the commands you run most often. ' +
      'Each card displays a friendly name and an icon so you can find what you need at a glance.\n\n' +
      '• **Paste** — inserts the command into your terminal so you can review or edit it first\n' +
      '• **Run** — sends the command directly and executes it immediately\n' +
      '• **Keyboard shortcut** — assign a hotkey to any card for one-keystroke access\n' +
      '• **Drag to reorder** — rearrange cards by dragging them into the order that suits your workflow',
  },

  // ── Step 3: Release Manager ───────────────────────────────────────────────
  {
    title: 'Release Manager',
    selector: '.release-card, [class*="release"]',
    fallbackSelector: '.sidebar-panel',
    spotlight: true,
    arrow: 'right',
    content:
      'The **Release Manager** lets you publish a new version of your project without leaving the terminal. ' +
      'Choose a bump type — **patch**, **minor**, or **major** — and Forge handles the rest.\n\n' +
      'It runs the local release pipeline: bumps the version number, builds the project, ' +
      'creates a Git tag, and publishes the release — all from a single card. ' +
      'No manual steps, no copy-pasting version strings.',
  },

  // ── Step 4: Vault — Secure Secrets ───────────────────────────────────────
  {
    title: 'Vault — Secure Secrets',
    selector: '.vault-panel, [class*="vault"]',
    fallbackSelector: '.sidebar-panel',
    spotlight: true,
    arrow: 'right',
    content:
      'The **Vault** is a secure store for API keys, tokens, and other secrets. ' +
      'Everything is encrypted on your local machine — nothing is ever sent to a server.\n\n' +
      '• **Reveal** — view the secret value when you need it\n' +
      '• **Copy** — copy it to your clipboard without displaying it on screen\n' +
      '• **Inject** — insert the secret directly into your active terminal session ' +
      'so it never appears in your shell history or command output\n\n' +
      'Your credentials stay private even when sharing your screen.',
  },

  // ── Step 5: Multi-Tab Themes ──────────────────────────────────────────────
  {
    title: 'Multi-Tab Themes',
    selector: '.tab-bar, [class*="tab-bar"]',
    fallbackSelector: '.tabs-container',
    spotlight: true,
    arrow: 'up',
    content:
      'Forge supports multiple terminal tabs — each with its own color accent. ' +
      'When you have several projects running at once, the distinct glow on each tab makes it easy to ' +
      'tell them apart without reading the name.\n\n' +
      '• **Open a new tab** using the + button or a keyboard shortcut\n' +
      '• **Double-click a tab** to rename it to something meaningful\n' +
      '• Each tab keeps its own terminal history and working directory',
  },

  // ── Step 6: Dev Dashboard ─────────────────────────────────────────────────
  {
    title: 'Dev Dashboard',
    selector: '.dashboard-panel, [data-panel="dashboard"]',
    fallbackSelector: '.sidebar-panel',
    spotlight: true,
    arrow: 'right',
    content:
      'The **Dev Dashboard** gives you a live overview of your repository and system health — ' +
      'no need to run separate commands to check what\'s going on.\n\n' +
      '• **Git activity** — commits made today, files changed, and your last commit message\n' +
      '• **Weekly bar chart** — a visual summary of your commit frequency over the past 7 days\n' +
      '• **System stats** — memory usage, process uptime, and active terminal sessions\n\n' +
      'Keep it open in the sidebar to stay aware of your repo\'s state at all times.',
  },

  // ── Step 7: Final — You're all set ───────────────────────────────────────
  {
    title: "You're all set! 🚀",
    isFinal: true,
    content:
      'You now know the essentials of Forge Terminal. The best way to learn the rest is to explore — ' +
      'every panel has tooltips, and most actions have keyboard shortcuts you\'ll discover along the way.\n\n' +
      'If you ever want to revisit this tour, go to **Settings → Replay Tour** and it will start again from the beginning.\n\n' +
      'For advanced power users, check out the **MCP Integration** for connecting AI agents to your terminal, ' +
      'and the **Enterprise Workflow** system for enforcing team-wide coding standards automatically.',
  },
];

// ── Exports ────────────────────────────────────────────────────────────────

const TOUR_STORAGE_KEY = 'forge_tour_completed';

// Bump this version string whenever the tour content changes significantly.
// Users who completed a lower-versioned tour will be shown the updated tour
// on their next launch (checked in useGuidedTour.js).
const TOUR_VERSION = '7.6.2';

export { TOUR_STEPS, TOUR_STORAGE_KEY, TOUR_VERSION };
