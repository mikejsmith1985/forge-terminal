// App-specific portfolio display and capture definitions for MBL2PC.

const LOCAL_REPO_PATH = 'C:\\ProjectsWin\\mbl2pc';
const LOCAL_SERVER_PORT = 8765;
const LOCAL_SERVER_BASE_URL = `http://localhost:${LOCAL_SERVER_PORT}`;

export const MBL2PC_APP = {
  slug: 'mbl2pc',
  name: 'MBL2PC',
  tagline:
    'Phone-to-PC messaging experience with uploads, snippets, and personalization in one lightweight app.',
  summary:
    'MBL2PC tells a strong story about end-user empathy: cross-device messaging, quick sharing, and personalization. The local test server makes it ideal for a demo-safe portfolio because the real UI already works with seeded messages.',
  accent: '#ff8a4c',
  category: 'Cross-device utility',
  launchSurface: 'python test_local.py',
  techStack: ['FastAPI', 'Python', 'HTML', 'Cypress'],
  proofNote:
    'All three visuals in this section are real screenshots captured from the shipped messaging UI with safe seeded demo data.',
  features: [
    {
      id: 'chat-dashboard',
      title: 'Rich chat dashboard with search, pinning, and timeline depth',
      wowFactor: 'Shows consumer-style UX polish with real utility features.',
      whatItShows:
        'A mocked message dashboard with seeded phone-to-PC messages, quick actions, pinned context, and a polished conversation layout.',
      mockDataApproach:
        'The thread uses a fictional Demo Phone and Product Review conversation with generic notes, links, and handoff actions.',
      capturePlan:
        'Open /send.html on the local test server and capture after the first .bubble element is rendered.',
      imageKind: 'real-ui',
      imagePath: './assets/mbl2pc/mbl2pc-chat-dashboard.png',
    },
    {
      id: 'dark-mode-theme',
      title: 'Theme system that supports light and dark use comfortably',
      wowFactor: 'Shows attention to visual polish, readability, and day-to-day usability.',
      whatItShows:
        'A mocked theme settings screen showing dark-mode controls, a live message preview, palette choices, and density settings.',
      mockDataApproach:
        'The theme values are safe portfolio settings such as Midnight Ocean, Coral accent, and Comfortable density.',
      capturePlan:
        'Switch the live page into dark theme, wait for the surface colors to settle, and capture the full messaging viewport.',
      imageKind: 'real-ui',
      imagePath: './assets/mbl2pc/mbl2pc-dark-mode-theme.png',
    },
    {
      id: 'search-and-theme',
      title: 'Search and personalization working together in the same flow',
      wowFactor: 'Highlights practical utility layered on top of a visually distinctive interface.',
      whatItShows:
        'A mocked search screen with a release-notes query, matching message threads, active palette context, snippets, and file handoff state.',
      mockDataApproach:
        'The search results are fictional product-review, dev-sync, and QA-thread records rather than real messages or device identifiers.',
      capturePlan:
        'Apply the ocean palette, enter a safe search term, and capture the filtered live view.',
      imageKind: 'real-ui',
      imagePath: './assets/mbl2pc/mbl2pc-search-and-theme.png',
    },
  ],
};

export const MBL2PC_PORTFOLIO_CONFIG = {
  slug: MBL2PC_APP.slug,
  name: MBL2PC_APP.name,
  localRepoPath: LOCAL_REPO_PATH,
  outputDirPath: 'web/portfolio/assets/mbl2pc',
  captureToolchain: 'playwright',
  launchStrategy: {
    localRepoPath: LOCAL_REPO_PATH,
    command: 'python test_local.py',
    readySignal: `http://localhost:${LOCAL_SERVER_PORT}/send.html`,
    environmentVariables: {},
  },
  demoSetupHooks: [
    {
      id: 'seed-safe-device-preferences',
      description:
        'Store a generic demo device name plus theme preferences in localStorage before the page reloads.',
      mockDataApproach:
        'Use safe strings such as "Demo Device" and palette values already supported by the app.',
      runnerInstruction:
        'Set localStorage keys for mbl2pc_theme, mbl2pc_palette_dark, and a generic device-name key before reloading the page.',
    },
    {
      id: 'expand-safe-productivity-panels',
      description:
        'Open the built-in clipboard and snippets panels so the productivity story is visible without creating a fake sidebar.',
      mockDataApproach:
        'Seed snippets with generic note, code, and file-reference text only.',
      runnerInstruction:
        'Write safe snippets into localStorage, remove the "collapsed" class from #clipboardPanel and #snippetsPanel, and then reload or re-render the page.',
    },
  ],
  captureTargets: [
    {
      featureId: 'chat-dashboard',
      outputFileName: 'mbl2pc-chat-dashboard.png',
      captureUrl: `${LOCAL_SERVER_BASE_URL}/send.html`,
      waitForSelector: '.bubble',
      viewportWidth: 1440,
      viewportHeight: 900,
    },
    {
      featureId: 'dark-mode-theme',
      outputFileName: 'mbl2pc-dark-mode-theme.png',
      captureUrl: `${LOCAL_SERVER_BASE_URL}/send.html`,
      waitForSelector: '#themePopover.open',
      viewportWidth: 1440,
      viewportHeight: 900,
    },
    {
      featureId: 'search-and-theme',
      outputFileName: 'mbl2pc-search-and-theme.png',
      captureUrl: `${LOCAL_SERVER_BASE_URL}/send.html`,
      waitForSelector: '#snippetsList',
      viewportWidth: 1440,
      viewportHeight: 900,
    },
  ],
};
