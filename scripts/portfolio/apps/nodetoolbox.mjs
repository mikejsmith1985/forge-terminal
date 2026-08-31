// App-specific portfolio display and capture definitions for NodeToolbox.
//
// The five features below are the app's most-developed surfaces as of v0.243.1.
// Their replicas are rebuilt in scripts/portfolio/screens/nodetoolbox-screens.mjs
// from live captures of a real employer workspace — so every project key, name,
// team, and initiative on screen is replaced by the invented program in
// nodetoolbox-demo-data.mjs. The source captures are reference material and are
// never published.

const LOCAL_REPO_PATH = 'C:\\ProjectsWin\\NodeToolbox';
const DEMO_SERVER_PORT = 5556;
const DEMO_BASE_URL = `http://localhost:${DEMO_SERVER_PORT}`;

// Every NodeToolbox surface is a dense, wide dashboard, so all five replicas are
// captured at the same generous size rather than a browser-default viewport.
const NODETOOLBOX_SCREEN_WIDTH = 1700;
const NODETOOLBOX_SCREEN_HEIGHT = 1000;

function createCaptureTarget(featureId, mockSafetyNotes) {
  return {
    featureId,
    outputFileName: `nodetoolbox-${featureId}.png`,
    viewportWidth: NODETOOLBOX_SCREEN_WIDTH,
    viewportHeight: NODETOOLBOX_SCREEN_HEIGHT,
    mockSafetyNotes,
  };
}

export const NODE_TOOLBOX_APP = {
  slug: 'nodetoolbox',
  name: 'NodeToolbox',
  tagline:
    'Local-first delivery workspace that reconstructs the truth about a program\'s work — and says '
    + 'so when it cannot.',
  summary:
    'NodeToolbox is the clearest story of product depth. One application reads Jira, Confluence, and '
    + 'the delivery toolchain behind a localhost proxy and answers the questions a delivery team '
    + 'actually argues about: what is late, who is overloaded, where did this release\'s scope go, '
    + 'and which of these figures can be trusted. Its distinguishing habit is refusing to guess — an '
    + 'unmeasurable figure is reported as unmeasurable, never as zero.',
  accent: '#4a9eff',
  category: 'Enterprise delivery workspace',
  launchSurface: 'node server.js',
  techStack: ['Node.js', 'Express', 'React', 'TypeScript', 'Vitest'],
  proofNote:
    'Every screen here is a source-derived replica built from the implemented routes, board '
    + 'vocabulary, and forecast engine, populated with an invented delivery program. The captures '
    + 'these were rebuilt from show a real employer workspace and are not published — no real '
    + 'project key, colleague, team, or initiative appears anywhere in this section.',

  // ── Five surfaces, ordered so the thesis leads ────────────────────────────
  // Roll-Up Board, forecast, and hygiene each demonstrate the refusal to guess.
  // Composition and search follow, showing authoring and reach.
  features: [
    {
      id: 'rollup-board',
      title: 'A board that shows where work is, and what that costs the Feature',
      wowFactor:
        'It reconstructs a Jira board in the team\'s own column vocabulary and puts a delivery '
        + 'verdict on every Feature lane. Two things a normal board cannot do: every issue sits in '
        + 'the column of its own status, never one inherited from a parent, and anything unmappable '
        + 'goes to a visible Unmapped column rather than being quietly dropped. The board never lies '
        + 'by omission.',
      whatItShows:
        'Thirteen columns carrying the team\'s status names with the Jira status pair each maps to, '
        + 'Feature lanes with separate Dev and Whole Feature progress bars showing their basis, a '
        + 'behind/on-track verdict per lane, and an empty lane carrying the note that it is '
        + 'committed to the increment with nothing underneath it.',
      mockDataApproach:
        'Every Feature key, summary, team name, and count belongs to an invented enrollment program. '
        + 'The column vocabulary is the shipped default, which contains no customer data.',
      capturePlan:
        'Portfolio runner renders the Roll-Up Board from the shipped lane and column structure with an invented Feature set.',
      imageKind: 'source-derived-replica',
      imagePath: './assets/nodetoolbox/nodetoolbox-rollup-board.png',
    },
    {
      id: 'daily-forecast',
      title: 'A daily forecast that names what must start today',
      wowFactor:
        'It turns story points into a date and a date into a verdict, per issue, with the arithmetic '
        + 'shown in plain language. The CANNOT FORECAST card is the point: most tools fold unsized '
        + 'work into "on track" and quietly overstate confidence. This one gives it its own number '
        + 'and excludes it from every total rather than guessing at it.',
      whatItShows:
        'Four counters — behind, start today, on track, cannot forecast — over a scan line, then '
        + 'issues grouped by urgency with hue-coded chips for team, owner, latest safe start date, '
        + 'and lateness, each row explaining its verdict in a sentence.',
      mockDataApproach:
        'Issue keys, owners, summaries, and dates are invented. The forecast wording is the shipped '
        + 'copy, which describes arithmetic rather than any customer.',
      capturePlan:
        'Portfolio runner renders the forecast panel from the shipped grouping and chip vocabulary with an invented issue set.',
      imageKind: 'source-derived-replica',
      imagePath: './assets/nodetoolbox/nodetoolbox-daily-forecast.png',
    },
    {
      id: 'hygiene-workspace',
      title: 'Data hygiene as a workspace, not a report',
      wowFactor:
        'It finds the broken planning data and fixes it in place — while refusing to auto-fix the '
        + 'cases where a fix would hide a true statement. Rewriting an overdue date would make the '
        + 'warning disappear and change nothing about the work, so the tool declines and says why. '
        + 'That refusal is the most opinionated thing on the screen.',
      whatItShows:
        'A grid of hygiene checks with counts and a score, a four-figure band splitting issues into '
        + 'broken, untidy, one-click fixable and clean, a bulk date-fix action with its refusal note '
        + 'beside it, and findings with three planning dates editable inline.',
      mockDataApproach:
        'Findings, keys, owners and counts are invented; the check names and refusal wording are the '
        + 'shipped copy.',
      capturePlan:
        'Portfolio runner renders the hygiene workspace from the shipped check grid and finding rows with invented findings.',
      imageKind: 'source-derived-replica',
      imagePath: './assets/nodetoolbox/nodetoolbox-hygiene-workspace.png',
    },
    {
      id: 'feature-composition',
      title: 'Compose a Feature from the material it actually came from',
      wowFactor:
        'Product thinking about authoring, not just reading: spreadsheets, pages, related issues and '
        + 'pasted notes on the left, the Feature being written on the right, and a readiness '
        + 'checklist gating the create. The stance that matters is on the components panel — applied '
        + 'deterministically by rule, never suggested. The deterministic parts stay deterministic '
        + 'and the assisted parts stay propose-only.',
      whatItShows:
        'The product-owner tab strip, the source panel with its drop zone and reference fields, the '
        + 'Feature draft with summary, description, acceptance criteria and the author\'s own words, '
        + 'a readiness checklist above the create action, and the app\'s own definition of what a '
        + 'ready Feature looks like.',
      mockDataApproach:
        'The drafted Feature is invented, written to the panel\'s own guidance. The readiness '
        + 'guidance is the shipped copy and contains no workspace data.',
      capturePlan:
        'Portfolio runner renders the composition surface from the shipped two-panel layout with an invented Feature draft.',
      imageKind: 'source-derived-replica',
      imagePath: './assets/nodetoolbox/nodetoolbox-feature-composition.png',
    },
    {
      id: 'simple-search',
      title: 'Plain-keyword search that writes the query for you',
      wowFactor:
        'One keyword answers a question across three levels of a Jira hierarchy at once — portfolio, '
        + 'train, and team — and every row shows which field matched. That Match column is why this '
        + 'is a product feature rather than a search box: it tells you why a row is in front of you.',
      whatItShows:
        'A single keyword box with sort and type controls, a result line counting matches across '
        + 'three levels, and three grouped tables carrying key, summary, match reason, type, status, '
        + 'assignee and last update.',
      mockDataApproach:
        'This surface needed the heaviest redaction: every key, summary and assignee is invented '
        + 'against a fictional enrollment consolidation program.',
      capturePlan:
        'Portfolio runner renders the search results from the shipped three-level grouping with an invented result set.',
      imageKind: 'source-derived-replica',
      imagePath: './assets/nodetoolbox/nodetoolbox-simple-search.png',
    },
  ],
};

export const NODE_TOOLBOX_PORTFOLIO_CONFIG = {
  slug: NODE_TOOLBOX_APP.slug,
  name: NODE_TOOLBOX_APP.name,
  localRepoPath: LOCAL_REPO_PATH,
  outputDirPath: 'web/portfolio/assets/nodetoolbox',
  captureToolchain: 'playwright',
  launchStrategy: {
    localRepoPath: LOCAL_REPO_PATH,
    command: 'node server.js',
    readySignal: `${DEMO_BASE_URL}/setup?demo=1`,
    environmentVariables: {
      TBX_PORT: String(DEMO_SERVER_PORT),
      TBX_JIRA_URL: 'https://jira.test.example.com',
      TBX_JIRA_PAT: 'portfolio-demo-token',
    },
  },
  demoSetupHooks: [
    {
      id: 'render-source-derived-replicas',
      description:
        'Render the five NodeToolbox surfaces from the shipped layout using the invented delivery '
        + 'program in scripts/portfolio/screens/nodetoolbox-demo-data.mjs.',
      mockDataApproach:
        'The source captures show a real employer workspace and are never published. Every project '
        + 'key, colleague, team, initiative, and host on the replicas is invented, and a guard test '
        + 'rejects any that are not.',
      runnerInstruction:
        'Run scripts/portfolio/build-portfolio-assets.mjs so the NodeToolbox cards use PNG assets from web/portfolio/assets/nodetoolbox.',
    },
  ],
  captureTargets: [
    createCaptureTarget('rollup-board', [
      'Feature keys, summaries, and counts are invented.',
      'The column vocabulary is the shipped default and carries no customer data.',
    ]),
    createCaptureTarget('daily-forecast', [
      'Issue keys, owners, and dates are invented.',
      'The forecast wording describes arithmetic, not any customer.',
    ]),
    createCaptureTarget('hygiene-workspace', [
      'Findings and owners are invented; check names are the shipped copy.',
    ]),
    createCaptureTarget('feature-composition', [
      'The drafted Feature is invented and written to the panel\'s own guidance.',
    ]),
    createCaptureTarget('simple-search', [
      'Every key, summary, and assignee is invented — this surface needed the heaviest redaction.',
    ]),
  ],
};
