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

// Each screen gets its own terminal session and its own point in the workflow.
// Showing identical scrollback under every rail would read as one static
// mock-up rather than an application being used, and it would hide the thing
// the phase bar exists to show: that work advances through recorded stages.
//
// The six phases are the Spec-Driven Development pipeline the product enforces.
// Work moves Specify → Clarify → Plan → Tasks → Validate → Implement, and a
// phase cannot be marked done until its evidence has been recorded.
const WORKFLOW_PHASE_LABELS = ['Specify', 'Clarify', 'Plan', 'Tasks', 'Validate', 'Implement'];

/** Builds phase-bar state with everything before the active phase marked done. */
function createPhaseProgress(activePhaseLabel) {
  const activeIndex = WORKFLOW_PHASE_LABELS.indexOf(activePhaseLabel);

  return WORKFLOW_PHASE_LABELS.map((phaseLabel, phaseIndex) => {
    if (phaseIndex < activeIndex) {
      return { label: phaseLabel, state: 'Done' };
    }
    if (phaseIndex === activeIndex) {
      return { label: phaseLabel, state: 'Active' };
    }
    return { label: phaseLabel, state: 'Pending' };
  });
}

export const DEMO_TERMINAL_SESSIONS = {
  'multi-tab-terminal': {
    replayedLine: '> plan the cache layer for the quote engine',
    activePhase: 'Plan',
    hint: 'Run /speckit-plan to continue.',
    prompt: '> write the failing cache test first',
    lines: [
      { text: '● 🔍 Reading the quote engine', tone: 'heading' },
      { text: '', tone: 'plain' },
      { text: '  src/quotes/engine.ts        420 lines   pricing rules + rounding', tone: 'dim' },
      { text: '  src/quotes/repository.ts    198 lines   reads every quote per request', tone: 'dim' },
      { text: '  src/quotes/rate-table.ts    260 lines   published nightly, cached nowhere', tone: 'dim' },
      { text: '  src/quotes/engine.test.ts    96 lines   covers rounding, not caching', tone: 'dim' },
      { text: '', tone: 'plain' },
      { text: '  The engine calls repository.findQuotes() once per line item. A 40-line', tone: 'plain' },
      { text: '  quote issues 40 identical reads against the same rate table.', tone: 'plain' },
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
      { text: '  Wrapping the repository keeps the engine unaware of caching, so the', tone: 'plain' },
      { text: '  rounding rules stay the only thing engine.ts is responsible for.', tone: 'plain' },
      { text: '', tone: 'plain' },
      { text: '● ⚠ Decided against', tone: 'heading' },
      { text: '', tone: 'plain' },
      { text: '  Memoising inside the engine — faster to write, but it would cache', tone: 'dim' },
      { text: '  rounding results too, and those are correct to recompute.', tone: 'dim' },
      { text: '', tone: 'plain' },
      { text: '  [PASS] branch-created   feature/quote-engine-cache', tone: 'pass' },
      { text: '  [WAIT] tests-written    no failing test recorded yet', tone: 'wait' },
    ],
  },

  'context-engineering': {
    replayedLine: '> which files do you actually need for the cache work?',
    activePhase: 'Tasks',
    hint: 'Run /speckit-tasks to continue.',
    prompt: '> send those three and nothing else',
    lines: [
      { text: '● 🛒 Context selected from the file rail', tone: 'heading' },
      { text: '', tone: 'plain' },
      { text: '  engine.ts                 6,240 tokens   the read path being wrapped', tone: 'dim' },
      { text: '  repository.ts             2,905 tokens   where the caching seam goes', tone: 'dim' },
      { text: '  0007-cache-strategy.md    2,166 tokens   the decision this must follow', tone: 'dim' },
      { text: '                            ─────────', tone: 'box' },
      { text: '                           11,311 tokens   9% of a 128,000 window', tone: 'plain' },
      { text: '', tone: 'plain' },
      { text: '● 📝 Deliberately not sent', tone: 'heading' },
      { text: '', tone: 'plain' },
      { text: '  rate-table.ts   3,712 tokens   read by the seam, never modified by it', tone: 'dim' },
      { text: '  rounding.ts       844 tokens   unrelated to the read path', tone: 'dim' },
      { text: '  engine.test.ts  1,338 tokens   the new test replaces it, not extends it', tone: 'dim' },
      { text: '  README.md       1,480 tokens   no bearing on the change', tone: 'dim' },
      { text: '', tone: 'plain' },
      { text: '  Sending all seven would cost 19,685 tokens for 8,374 tokens of noise —', tone: 'plain' },
      { text: '  and noise is what makes an agent edit the wrong file.', tone: 'plain' },
      { text: '', tone: 'plain' },
      { text: '● 🧭 What the decision record says', tone: 'heading' },
      { text: '', tone: 'plain' },
      { text: '  0007: "Cache at the repository boundary. The engine must remain', tone: 'dim' },
      { text: '  pure so pricing changes never invalidate a cache entry."', tone: 'dim' },
      { text: '', tone: 'plain' },
      { text: '  That single paragraph is why engine.ts is context and not a target.', tone: 'plain' },
      { text: '', tone: 'plain' },
      { text: '  [PASS] branch-created   feature/quote-engine-cache', tone: 'pass' },
      { text: '  [PASS] tests-written    engine.cache.test.ts', tone: 'pass' },
      { text: '  [WAIT] tests-passed     awaiting first green run', tone: 'wait' },
    ],
  },

  'mcp-integration': {
    replayedLine: '> run the test suite in whatever sandbox this repo needs',
    activePhase: 'Validate',
    hint: 'Run /speckit-analyze to continue.',
    prompt: '> good — record that as the passing run',
    lines: [
      { text: '● ⚙ environment_detect', tone: 'heading' },
      { text: '', tone: 'plain' },
      { text: '  native      node 22 present, lockfile targets a different toolchain', tone: 'dim' },
      { text: '  wsl2        available, Ubuntu 24.04', tone: 'dim' },
      { text: '  docker      daemon not running', tone: 'dim' },
      { text: '  strategy    wsl2   chosen automatically, no configuration', tone: 'plain' },
      { text: '', tone: 'plain' },
      { text: '● ⚡ environment_run — npm test', tone: 'heading' },
      { text: '', tone: 'plain' },
      { text: '  engine.cache.test.ts   one read per quote batch          PASS', tone: 'pass' },
      { text: '  engine.cache.test.ts   evicts on rate-table publish      PASS', tone: 'pass' },
      { text: '  engine.cache.test.ts   cold read still hits the source   PASS', tone: 'pass' },
      { text: '  engine.cache.test.ts   concurrent batches share one read PASS', tone: 'pass' },
      { text: '  engine.test.ts         rounding unchanged                PASS', tone: 'pass' },
      { text: '  engine.test.ts         half-cent rounds toward the payer PASS', tone: 'pass' },
      { text: '  repository.test.ts     find-quotes contract unchanged    PASS', tone: 'pass' },
      { text: '  rate-table.test.ts     publish emits an evict event      PASS', tone: 'pass' },
      { text: '', tone: 'plain' },
      { text: '  204 passed · 0 failed · 11.4s in wsl2', tone: 'plain' },
      { text: '', tone: 'plain' },
      { text: '● 📊 Measured against the plan', tone: 'heading' },
      { text: '', tone: 'plain' },
      { text: '  reads per 40-line quote     40 → 1', tone: 'pass' },
      { text: '  p95 quote latency           412ms → 96ms', tone: 'pass' },
      { text: '  cache hit rate, warm        97.2%', tone: 'pass' },
      { text: '', tone: 'plain' },
      { text: '  [PASS] tests-passed     204 passed in wsl2', tone: 'pass' },
    ],
  },

  'release-manager': {
    replayedLine: '> cut the patch release now the gates are green',
    activePhase: 'Implement',
    hint: 'All gates recorded — the commit is allowed.',
    prompt: '> ship it',
    lines: [
      { text: '● ✅ Workflow ledger', tone: 'heading' },
      { text: '', tone: 'plain' },
      { text: '  [PASS] branch-created   feature/quote-engine-cache', tone: 'pass' },
      { text: '  [PASS] tests-written    engine.cache.test.ts', tone: 'pass' },
      { text: '  [PASS] tests-passed     204 passed in wsl2', tone: 'pass' },
      { text: '  [PASS] proof-recorded   latency measured before and after', tone: 'pass' },
      { text: '', tone: 'plain' },
      { text: '  pre-commit hook: every required gate present, commit allowed', tone: 'pass' },
      { text: '', tone: 'plain' },
      { text: '● 🏷 Background release job', tone: 'heading' },
      { text: '', tone: 'plain' },
      { text: '  changelog   entry written from the ledger        done', tone: 'dim' },
      { text: '  version     v4.12.3 → v4.12.4                    done', tone: 'dim' },
      { text: '  build       windows/amd64                        done', tone: 'dim' },
      { text: '  build       linux/amd64                          done', tone: 'dim' },
      { text: '  sign        artefacts signed                     done', tone: 'dim' },
      { text: '  publish     uploading 4 objects                   84%', tone: 'plain' },
      { text: '  tag         v4.12.4                            pending', tone: 'wait' },
      { text: '', tone: 'plain' },
      { text: '  The job runs detached — closing this tab does not cancel it, and', tone: 'plain' },
      { text: '  the result arrives as a notification whichever tab is focused.', tone: 'plain' },
      { text: '', tone: 'plain' },
      { text: '● 📈 What shipped', tone: 'heading' },
      { text: '', tone: 'plain' },
      { text: '  p95 quote latency  412ms → 96ms  after the cache seam', tone: 'pass' },
      { text: '  reads per quote    40 → 1', tone: 'pass' },
      { text: '  4 files changed · 1 new test file · no public API change', tone: 'dim' },
    ],
  },

  'web-app-debugger': {
    replayedLine: '> the quote total flickers when the cache warms — watch me do it',
    activePhase: 'Validate',
    hint: 'Recording — stop when the bug has happened once.',
    prompt: '> that flicker, right there',
    lines: [
      { text: '● 📹 Recording browser session', tone: 'heading' },
      { text: '', tone: 'plain' },
      { text: '  00:01  click     Quotes › open batch 4471', tone: 'dim' },
      { text: '  00:02  click     Quotes › Recalculate', tone: 'dim' },
      { text: '  00:03  xhr       GET /api/quotes/batch     200   412ms', tone: 'dim' },
      { text: '  00:04  xhr       GET /api/quotes/batch     200     8ms   cached', tone: 'dim' },
      { text: '  00:04  console   Warning: total rendered twice for batch 4471', tone: 'wait' },
      { text: '  00:04  console   Warning: QuoteTotal received a new key prop', tone: 'wait' },
      { text: '  00:05  render    QuoteTotal unmounted', tone: 'wait' },
      { text: '  00:05  render    QuoteTotal mounted, previous value flashed', tone: 'wait' },
      { text: '  00:06  click     user stops the recording', tone: 'dim' },
      { text: '', tone: 'plain' },
      { text: '● 🔎 What the recording settles', tone: 'heading' },
      { text: '', tone: 'plain' },
      { text: '  The second request is the cache hit, not a duplicate fetch —', tone: 'plain' },
      { text: '  8ms against 412ms, same URL, same batch.', tone: 'plain' },
      { text: '', tone: 'plain' },
      { text: '  The flicker is a re-mount on the cached path. The cache returns a', tone: 'plain' },
      { text: '  new object identity, the key prop changes, React discards the node.', tone: 'plain' },
      { text: '', tone: 'plain' },
      { text: '  Not a network race. Not a double fetch. Both were the first guess.', tone: 'wait' },
      { text: '', tone: 'plain' },
      { text: '● 📎 Handed to the agent', tone: 'heading' },
      { text: '', tone: 'plain' },
      { text: '  The fix is a stable cache key, not a re-fetch guard — which is the', tone: 'dim' },
      { text: '  change the first guess would have made, and it would not have worked.', tone: 'dim' },
      { text: '', tone: 'plain' },
      { text: '  evidence bundle written · events, console, network, screen capture', tone: 'pass' },
      { text: '  attached to the session — no reproduction steps to write up', tone: 'pass' },
    ],
  },
};

/** Returns the phase-bar state to show beneath one screen's terminal. */
export function getWorkflowPhases(screenFeatureId) {
  return createPhaseProgress(DEMO_TERMINAL_SESSIONS[screenFeatureId].activePhase);
}

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
