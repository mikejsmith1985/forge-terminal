// Fictional workspace used by every Forge Terminal portfolio screen.
//
// The portfolio screens are rebuilt from real screenshots of the shipped UI, so
// the layout is genuine but the content must not be. Keeping all display values
// in this one file means the anonymisation guarantee is reviewable in a single
// place: nothing here refers to a real repository, machine, person, or secret.

// The imaginary developer whose machine the screens depict.
export const DEMO_HOME_DIRECTORY = 'C:\\Users\\dev';
export const DEMO_PROJECTS_ROOT = 'C:/Projects';
export const DEMO_ACTIVE_REPOSITORY = 'atlas-api';
export const DEMO_BACKGROUND_REPOSITORY = 'beacon-ui';
export const DEMO_ACTIVE_BRANCH = 'feature/quote-engine-cache';

// Projects listed in the Commands rail. Invented product names only.
export const DEMO_PROJECT_NAMES = [
  'acme-checkout',
  'atlas-api',
  'beacon-ui',
  'cobalt-cli',
  'delta-sync',
  'ember-docs',
  'fleet-ops',
  'gateway-proxy',
  'harbor-web',
  'ionstack',
  'jetstream',
  'kestrel-etl',
  'lumen-admin',
  'meridian',
  'northwind-crm',
  'orbit-mobile',
  'pulsar-jobs',
  'quarry-search',
  'redwood-api',
  'sable-ui',
  'tidal-queue',
  'umbra-auth',
];

// Saved command cards. Each is a plausible everyday developer action.
export const DEMO_COMMAND_CARDS = [
  { icon: '🤖', title: 'Agent (Resume)', tag: 'Agent', note: 'Continue the last session' },
  { icon: '⚡', title: 'Agent (Enforced)', tag: 'Agent', note: 'Workflow gates required' },
  { icon: '🧪', title: 'Run test suite', tag: 'Tests', note: 'Unit + integration' },
  { icon: '📦', title: 'Build release candidate', tag: 'Build', note: 'Tagged artefact' },
  { icon: '🩺', title: 'Diagnose failing job', tag: 'Ops', note: 'Tail logs and retry' },
];

// The six-phase Spec-Driven Development bar pinned under every terminal.
export const DEMO_WORKFLOW_PHASES = [
  { label: 'Specify', state: 'Done' },
  { label: 'Clarify', state: 'Done' },
  { label: 'Plan', state: 'Active' },
  { label: 'Tasks', state: 'Pending' },
  { label: 'Validate', state: 'Pending' },
  { label: 'Implement', state: 'Pending' },
];

// Terminal scrollback for the workspace screen. Written as portfolio-safe
// output that still demonstrates the real workflow-gate ledger.
export const DEMO_TERMINAL_LINES = [
  { text: `> plan the cache layer for the quote engine`, tone: 'echo' },
  { text: '', tone: 'plain' },
  { text: '● 🔍 Reading the quote engine', tone: 'heading' },
  { text: '', tone: 'plain' },
  { text: `  src/quotes/engine.ts        420 lines   pricing rules + rounding`, tone: 'dim' },
  { text: `  src/quotes/repository.ts    198 lines   reads every quote per request`, tone: 'dim' },
  { text: `  src/quotes/engine.test.ts    96 lines   covers rounding, not caching`, tone: 'dim' },
  { text: '', tone: 'plain' },
  { text: '● 📋 Plan', tone: 'heading' },
  { text: '', tone: 'plain' },
  { text: '  ┌──────────────────────┬────────────────────────────────────────┐', tone: 'box' },
  { text: '  │ Step                 │ Detail                                 │', tone: 'box' },
  { text: '  ├──────────────────────┼────────────────────────────────────────┤', tone: 'box' },
  { text: '  │ 1  Cache seam        │ Wrap repository reads, not the engine  │', tone: 'box' },
  { text: '  │ 2  Invalidation      │ Evict on rate-table publish event      │', tone: 'box' },
  { text: '  │ 3  Failing test      │ Assert one read per quote batch        │', tone: 'box' },
  { text: '  │ 4  Measure           │ p95 latency before and after           │', tone: 'box' },
  { text: '  └──────────────────────┴────────────────────────────────────────┘', tone: 'box' },
  { text: '', tone: 'plain' },
  { text: '  [PASS] branch-created   feature/quote-engine-cache', tone: 'pass' },
  { text: '  [PASS] tests-written    engine.cache.test.ts', tone: 'pass' },
  { text: '  [WAIT] tests-passed     awaiting first green run', tone: 'wait' },
];

export const DEMO_TERMINAL_PROMPT = '> write the failing cache test first';

// The in-app updater banner that sits above the prompt in the shipped UI.
export const DEMO_UPDATE_BANNER = {
  currentVersion: '2.1.245',
  availableVersion: '2.1.246',
  message: 'Update installed · Restart to apply',
};

// Context-engineering screen: files grouped by directory with token weights.
export const DEMO_FILE_GROUPS = [
  {
    directory: '.',
    files: [
      { name: '.editorconfig', tokens: '112 tokens', modified: '5/30/2026' },
      { name: 'README.md', tokens: '1,480 tokens', modified: '6/02/2026' },
    ],
  },
  {
    directory: 'SRC/QUOTES',
    files: [
      { name: 'engine.ts', tokens: '6,240 tokens', modified: '6/24/2026' },
      { name: 'repository.ts', tokens: '2,905 tokens', modified: '6/24/2026' },
      { name: 'engine.test.ts', tokens: '1,338 tokens', modified: '6/21/2026' },
    ],
  },
  {
    directory: 'SRC/PRICING',
    files: [
      { name: 'rate-table.ts', tokens: '3,712 tokens', modified: '6/18/2026' },
      { name: 'rounding.ts', tokens: '844 tokens', modified: '6/11/2026' },
    ],
  },
  {
    directory: 'DOCS/DECISIONS',
    files: [
      { name: '0007-cache-strategy.md', tokens: '2,166 tokens', modified: '6/24/2026' },
      { name: '0006-rate-publishing.md', tokens: '1,902 tokens', modified: '6/09/2026' },
    ],
  },
];

export const DEMO_CONTEXT_CART = {
  selectedFileNames: ['engine.ts', 'repository.ts', '0007-cache-strategy.md'],
  usedTokenLabel: '11,311',
  budgetTokenLabel: '128,000',
  usedPercent: 9,
};

// MCP screen: server discovery plus the adaptive build-environment bridge.
export const DEMO_MCP_PANEL = {
  discoveredServerCount: 9,
  environmentToolCount: 17,
  tokenPathLabel: `${DEMO_HOME_DIRECTORY}\\.forge\\mc…`,
  connectTargets: ['Copilot CLI', 'VS Code', 'Agent CLI'],
  activeConnectTarget: 'Agent CLI',
  activeTools: [
    { name: 'environment_detect', note: 'Probe WSL2 and Docker availability before choosing a strategy' },
    { name: 'environment_run', note: 'Run a build natively, in WSL2, or in Docker — chosen automatically' },
    { name: 'environment_jobs', note: 'List detached builds that can be recovered after a session resume' },
    { name: 'environment_read_job', note: 'Read a detached build job and its persisted log output' },
    { name: 'file_list', note: 'Browse repository files without leaving the assistant' },
    { name: 'file_read', note: 'Read a file into context with its token cost attached' },
  ],
};

// Release Manager screen: semantic version choices for a fictional service.
export const DEMO_RELEASE_MANAGER = {
  productLabel: 'Atlas API (internal)',
  currentVersion: 'v4.12.3',
  nextVersion: 'v4.12.4',
  majorVersion: 'v5.0.0',
  minorVersion: 'v4.13.0',
  patchVersion: 'v4.12.4',
  changeKind: 'BUG FIXES',
  commitMessage: 'chore: release v4.12.4',
};

// Web App Debugger screen: what the recorder can and cannot capture.
export const DEMO_DEBUGGER_CAPABILITIES = {
  supported: ['React/Vue/Angular apps', 'JavaScript UI bugs', 'API call failures'],
  unsupported: ['Terminal output', 'Backend errors', 'Native desktop apps'],
};

// Vault screen: invented credential names. No value is ever rendered — the
// screens show the reference name and its environment variable only.
export const DEMO_VAULT_SECRETS = [
  { name: 'CDN API Token', environmentVariable: '$CDN_API_TOKEN' },
  { name: 'Staging Database Password', environmentVariable: '$STAGING_DB_PASSWORD' },
  { name: 'Payments Sandbox Key', environmentVariable: '$PAYMENTS_SANDBOX_KEY' },
  { name: 'Build Service Token', environmentVariable: '$BUILD_SERVICE_TOKEN' },
  { name: 'Transactional Email Key', environmentVariable: '$EMAIL_SERVICE_KEY' },
  { name: 'CI Signing Certificate', environmentVariable: '$CI_SIGNING_CERT' },
  {
    name: 'Release Bot Credentials',
    environmentVariable: '$RELEASE_BOT_CREDENTIALS',
    warning: 'Possible secret in description — rotate & remove',
  },
  { name: 'Chat Webhook Secret', environmentVariable: '$CHAT_WEBHOOK_SECRET' },
];

export const DEMO_VAULT_SECRET_COUNT = 18;
