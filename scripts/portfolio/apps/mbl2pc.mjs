// App-specific portfolio display and capture definitions for MBL2PC.

const LOCAL_REPO_PATH = 'C:\\ProjectsWin\\mbl2pc';
const LOCAL_SERVER_PORT = 8765;
const LOCAL_SERVER_BASE_URL = `http://localhost:${LOCAL_SERVER_PORT}`;

export const MBL2PC_APP = {
  slug: 'mbl2pc',
  name: 'MBL2PC',
  tagline:
    'Phone-to-PC file handoff, link sharing, snippets, and messaging in one lightweight app.',
  summary:
    'MBL2PC is the small one, and it earns its place by solving a problem everybody has and nobody writes down: the thing you need is on the wrong device. A link that reads badly on a phone goes to the desktop, the file the desktop produces comes straight back, and the sentence you keep retyping is saved once. Pinning, search, and clipboard sync are there because the handoff you need again is always the one from yesterday.',
  accent: '#ff8a4c',
  category: 'Cross-device utility',
  launchSurface: 'python test_local.py',
  techStack: ['FastAPI', 'Python', 'HTML', 'Cypress'],
  proofNote:
    'These screens are source-derived replicas of the shipped interface, populated with an '
    + 'invented handoff session. The originals were genuine screenshots of personal devices and '
    + 'are no longer published — one of them carried a file named after a real person.'
    + '',
  features: [
    {
      id: 'chat-dashboard',
      title: 'The handoff, in both directions',
      wowFactor: 'Shows practical cross-device utility instead of a basic chat demo.',
      whatItShows:
        'A thread where the phone sends a link that reads better on a desktop, the desktop sends the resulting file straight back, and both ends of the exchange are pinned so they stay reachable.',
      mockDataApproach:
        'Every message, filename, link, and device label belongs to an invented session. The originals were genuine screenshots of personal devices and are no longer published.',
      capturePlan:
        'Open /send.html on the local test server and capture after the first .bubble element is rendered.',
      imageKind: 'source-derived-replica',
      imagePath: './assets/mbl2pc/mbl2pc-chat-dashboard.png',
    },
    {
      id: 'dark-mode-theme',
      title: 'The same thread, in the theme you actually use',
      wowFactor: 'Theming is the tell that this was built to be lived in rather than demonstrated: the whole chrome, the pinned bar, the bubbles, and the composer all move together, on a phone-sized layout that stays legible in either theme.',
      whatItShows:
        'The identical exchange rendered in the shipped dark theme, with the pinned bar, snippet drawer, and composer carrying the theme through rather than being left light.',
      mockDataApproach:
        'Snippet text, filenames, and links are all invented; the attachments read as work '
        + 'artefacts rather than anything named after a person.',
      capturePlan:
        'Switch the live page into dark theme, wait for the surface colors to settle, and capture the full messaging viewport.',
      imageKind: 'source-derived-replica',
      imagePath: './assets/mbl2pc/mbl2pc-dark-mode-theme.png',
    },
    {
      id: 'search-and-theme',
      title: 'Searchable file history and reusable snippets',
      wowFactor: 'This is the part that makes it a tool rather than a chat window: the handoff you need again is always the one from yesterday, so it is searchable, and the sentence you keep retyping is saved once and reused.',
      whatItShows:
        'A search narrowing the thread to the file handoffs it matched, in a third theme, with the snippet drawer open and each saved snippet one tap from the clipboard.',
      mockDataApproach:
        'The search term, file names, and snippet contents are seeded portfolio examples that demonstrate the workflow without exposing private messages.',
      capturePlan:
        'Apply the ocean palette, enter a safe search term, and capture the filtered live view.',
      imageKind: 'source-derived-replica',
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
      viewportWidth: 620,
      viewportHeight: 1150,
    },
    {
      featureId: 'dark-mode-theme',
      outputFileName: 'mbl2pc-dark-mode-theme.png',
      captureUrl: `${LOCAL_SERVER_BASE_URL}/send.html`,
      waitForSelector: '#themePopover.open',
      viewportWidth: 620,
      viewportHeight: 1150,
    },
    {
      featureId: 'search-and-theme',
      outputFileName: 'mbl2pc-search-and-theme.png',
      captureUrl: `${LOCAL_SERVER_BASE_URL}/send.html`,
      waitForSelector: '#snippetsList',
      viewportWidth: 620,
      viewportHeight: 1150,
    },
  ],
};
