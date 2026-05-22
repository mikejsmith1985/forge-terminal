// App-specific portfolio display and capture definitions for EZTest.

const LOCAL_REPO_PATH = 'C:\\ProjectsWin\\EZTest';
const WIZARD_PORT = 7433;
const WIZARD_BASE_URL = `http://localhost:${WIZARD_PORT}`;

export const EZTEST_APP = {
  slug: 'eztest',
  name: 'EZTest',
  tagline:
    'AI-assisted behavioral testing companion with a polished browser wizard and Playwright-native workflows.',
  summary:
    'EZTest stands out because it turns test generation, defect capture, and fix validation into a guided product experience. The UI reads more like a polished SaaS wizard than a developer utility.',
  accent: '#a66bff',
  category: 'Developer productivity',
  launchSurface: 'npm run dev -- ui -p 7433',
  techStack: ['TypeScript', 'Express', 'Socket.io', 'Playwright'],
  proofNote:
    'This section uses PNG source-derived replicas composed from the implemented wizard, dashboard, and run-feedback flows.',
  features: [
    {
      id: 'onboarding',
      title: 'Two-step onboarding that explains value without jargon',
      wowFactor: 'Proves the product is approachable to non-experts, not just power users.',
      whatItShows:
        'A mocked onboarding wizard with project folder, framework detection, provider setup, and ready-to-generate steps shown in plain language.',
      mockDataApproach:
        'The wizard uses a fictional Sample React Checkout project, local demo provider, and safe localhost target URL.',
      capturePlan:
        'Portfolio runner renders a source-derived onboarding PNG from the implemented wizard steps and safe project-detection data.',
      imageKind: 'source-derived-replica',
      imagePath: './assets/eztest/eztest-onboarding.png',
    },
    {
      id: 'dashboard-actions',
      title: 'Action dashboard that frames testing work as outcomes',
      wowFactor: 'Shows product strategy, not just command execution.',
      whatItShows:
        'A mocked action dashboard where Generate, Record, Fix, Run, MCP Setup, and API Settings are presented as clear testing jobs to be done.',
      mockDataApproach:
        'The summary metrics are seeded with safe fixture values: 12 behaviors, 8 specs, 1 flaky test, and 74% coverage.',
      capturePlan:
        'Portfolio runner renders a source-derived dashboard PNG from the implemented action grid and safe project summary data.',
      imageKind: 'source-derived-replica',
      imagePath: './assets/eztest/eztest-dashboard-actions.png',
    },
    {
      id: 'run-modal',
      title: 'Live run modal with progress, logs, and follow-up actions',
      wowFactor: 'Communicates end-to-end workflow maturity and actionable feedback loops.',
      whatItShows:
        'A mocked run modal with generation logs, created spec files, completion state, and follow-up actions such as opening the report.',
      mockDataApproach:
        'The run transcript references fictional fixture specs only, so the workflow reads realistically without using private project output.',
      capturePlan:
        'Portfolio runner renders a source-derived run-modal PNG from the implemented terminal feedback flow and safe generated-spec transcript.',
      imageKind: 'source-derived-replica',
      imagePath: './assets/eztest/eztest-run-modal.png',
    },
  ],
};

export const EZTEST_PORTFOLIO_CONFIG = {
  slug: EZTEST_APP.slug,
  name: EZTEST_APP.name,
  localRepoPath: LOCAL_REPO_PATH,
  outputDirPath: 'web/portfolio/assets/eztest',
  captureToolchain: 'playwright',
  launchStrategy: {
    localRepoPath: LOCAL_REPO_PATH,
    command: `npm run dev -- ui -p ${WIZARD_PORT}`,
    readySignal: `localhost:${WIZARD_PORT}`,
    environmentVariables: {},
  },
  demoSetupHooks: [
    {
      id: 'load-onboarding-root',
      description:
        'Open the EZTest wizard root so the onboarding overlay and app shell DOM are both available for safe state injection.',
      mockDataApproach:
        'Use the bundled wizard only; do not point at a real customer project or live provider key.',
      runnerInstruction:
        'Navigate to the wizard root and wait for #browse-folder-btn to appear.',
    },
    {
      id: 'seed-safe-dashboard-state',
      description:
        'Populate the dashboard shell with a fake fixture project name and summary bar so the product framing is visible without running a real scan.',
      mockDataApproach:
        'Use generic sample values like "Sample React App" and "12 behaviors mapped" instead of reading a live repository.',
      runnerInstruction:
        'Set #project-pill-name text, reveal #project-summary-bar, hide #onboarding, and show #app using page.evaluate before the dashboard capture.',
    },
    {
      id: 'seed-safe-run-modal',
      description:
        'Populate the run modal with a static safe transcript so the log viewer and completion actions can be captured deterministically.',
      mockDataApproach:
        'Use generic pass lines referencing a fixture app only, never a customer project or real secret.',
      runnerInstruction:
        'Write safe transcript lines into #run-terminal, reveal #run-modal and #run-done-bar, and show #open-report-btn before the run-modal capture.',
    },
  ],
  captureTargets: [
    {
      featureId: 'onboarding',
      outputFileName: 'eztest-onboarding.png',
      captureUrl: `${WIZARD_BASE_URL}/`,
      waitForSelector: '#browse-folder-btn',
      viewportWidth: 1440,
      viewportHeight: 900,
    },
    {
      featureId: 'dashboard-actions',
      outputFileName: 'eztest-dashboard-actions.png',
      captureUrl: `${WIZARD_BASE_URL}/`,
      waitForSelector: '#project-summary-bar',
      viewportWidth: 1440,
      viewportHeight: 900,
    },
    {
      featureId: 'run-modal',
      outputFileName: 'eztest-run-modal.png',
      captureUrl: `${WIZARD_BASE_URL}/`,
      waitForSelector: '#run-terminal',
      viewportWidth: 1440,
      viewportHeight: 900,
    },
  ],
};
