// App-specific portfolio display and capture definitions for NodeToolbox.

const LOCAL_REPO_PATH = 'C:\\ProjectsWin\\NodeToolbox';
const DEMO_SERVER_PORT = 5556;
const DEMO_BASE_URL = `http://localhost:${DEMO_SERVER_PORT}`;

export const NODE_TOOLBOX_APP = {
  slug: 'nodetoolbox',
  name: 'NodeToolbox',
  tagline:
    'Local-first enterprise delivery workspace that unifies Jira, ServiceNow, GitHub, and reporting.',
  summary:
    'NodeToolbox is the clearest story of product breadth: one application orchestrating planning, reporting, ITSM, and delivery operations behind a localhost proxy. It reads like a serious internal platform, not a toy side project.',
  accent: '#1cc88a',
  category: 'Enterprise operations workspace',
  launchSurface: 'node server.js',
  techStack: ['Node.js', 'Express', 'React', 'Playwright'],
  proofNote:
    'This section uses PNG source-derived replicas based on the implemented routes, module layout, and enterprise delivery workflows.',
  features: [
    {
      id: 'home-launcher',
      title: 'Product launcher that feels like an internal operating system',
      wowFactor: 'Quickly communicates product breadth and information architecture skill.',
      whatItShows:
        'A mocked launcher screen with delivery modules, connected workstreams, release trains, and open-risk counts organized as a single internal platform.',
      mockDataApproach:
        'The screen uses a fictional HSCS Enrollment Platform workspace with mock program, release-train, and workstream totals.',
      capturePlan:
        'Portfolio runner renders a source-derived home launcher PNG from the implemented Home route card catalog and safe workspace metrics.',
      imageKind: 'source-derived-replica',
      imagePath: './assets/nodetoolbox/nodetoolbox-home-launcher.png',
    },
    {
      id: 'sprint-dashboard',
      title: 'Sprint dashboard for execution, planning, and release readiness',
      wowFactor: 'Signals enterprise complexity handled through coherent UX.',
      whatItShows:
        'A mocked sprint dashboard with health metrics, priority Jira-style work items, team load, and blocker status visible together.',
      mockDataApproach:
        'The board uses fictional BEN issue keys, sample owners, and safe delivery metrics instead of live Jira or GitHub data.',
      capturePlan:
        'Portfolio runner renders a source-derived Team Dashboard PNG from the implemented dashboard tabs, Jira issue shape, and safe sprint metrics.',
      imageKind: 'source-derived-replica',
      imagePath: './assets/nodetoolbox/nodetoolbox-sprint-dashboard.png',
    },
    {
      id: 'snow-hub-art',
      title: 'Specialist workflow surface: ServiceNow Hub or ART View',
      wowFactor: 'Shows that the product scales from team execution to cross-program orchestration.',
      whatItShows:
        'A mocked ServiceNow and ART operations hub with incident queues, change windows, release risk, and PI confidence surfaced as product UI.',
      mockDataApproach:
        'The incident IDs, change records, and release-train metrics are fictional samples designed to show the workflow without exposing enterprise systems.',
      capturePlan:
        'Portfolio runner renders a source-derived SNow Hub and ART PNG from the implemented operations routes and safe incident/change data.',
      imageKind: 'source-derived-replica',
      imagePath: './assets/nodetoolbox/nodetoolbox-snow-hub-art.png',
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
      id: 'open-first-install-demo',
      description:
        'Open the first-install demo flow through /setup?demo=1 so all storage remains isolated to the demo tab.',
      mockDataApproach:
        'The demo query parameter routes localStorage reads into session-scoped demo storage without touching saved user settings.',
      runnerInstruction:
        'Navigate to /setup?demo=1 before any feature capture begins.',
    },
    {
      id: 'submit-safe-demo-setup',
      description:
        'POST the demo setup form with safe placeholder values so the app can redirect into the main shell without using real credentials.',
      mockDataApproach:
        'Use synthetic Jira, GitHub, and Confluence values like the repository integration tests already do.',
      runnerInstruction:
        'POST /api/setup?demo=1 with fake values such as jiraBaseUrl=https://demo.atlassian.net and githubPat=ghp_demo, then follow the redirect to /?demo=1.',
    },
  ],
  captureTargets: [
    {
      featureId: 'home-launcher',
      outputFileName: 'nodetoolbox-home-launcher.png',
      captureUrl: `${DEMO_BASE_URL}/?demo=1`,
      waitForText: 'Your personal utility belt',
      viewportWidth: 1440,
      viewportHeight: 900,
      mockSafetyNotes: [
        'The demo tab never reuses the user’s saved settings.',
        'Placeholder connectivity values come from the isolated demo setup flow.',
        'The capture focuses on static module cards rather than live service data.',
      ],
    },
    {
      featureId: 'sprint-dashboard',
      outputFileName: 'nodetoolbox-sprint-dashboard.png',
      captureUrl: `${DEMO_BASE_URL}/sprint-dashboard?demo=1`,
      waitForText: 'Team Dashboard',
      viewportWidth: 1440,
      viewportHeight: 900,
      mockSafetyNotes: [
        'The route is entered only after the safe demo setup flow completes.',
        'No production Jira issue keys or GitHub links are required for the shell capture.',
      ],
    },
    {
      featureId: 'snow-hub-art',
      outputFileName: 'nodetoolbox-specialist-workflow.png',
      captureUrl: `${DEMO_BASE_URL}/snow-hub?demo=1`,
      fallbackCaptureUrl: `${DEMO_BASE_URL}/art?demo=1`,
      waitForText: 'SNow Hub',
      fallbackWaitForText: 'ART View tabs',
      viewportWidth: 1440,
      viewportHeight: 900,
      mockSafetyNotes: [
        'The capture prefers SNow Hub but can fall back to ART View without changing the showcase narrative.',
        'Both routes stay in the isolated demo tab.',
      ],
    },
  ],
};
