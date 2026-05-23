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
    'MBL2PC tells a strong story about end-user empathy: move a link from phone to PC, send a resume file back to mobile, and save reusable snippets without context switching. The local test server makes it ideal for a demo-safe portfolio because the real UI works with seeded messages, files, and snippets.',
  accent: '#ff8a4c',
  category: 'Cross-device utility',
  launchSurface: 'python test_local.py',
  techStack: ['FastAPI', 'Python', 'HTML', 'Cypress'],
  proofNote:
    'All three visuals in this section are real screenshots captured from the shipped messaging UI with safe seeded demo data.',
  features: [
    {
      id: 'chat-dashboard',
      title: 'Phone-to-PC link and resume handoff',
      wowFactor: 'Shows practical cross-device utility instead of a basic chat demo.',
      whatItShows:
        'A real MBL2PC message thread where a phone sends a portfolio link that renders better on desktop, then the PC returns a downloadable resume PDF for mobile use.',
      mockDataApproach:
        'The thread uses safe portfolio values: a public GitHub Pages link, a fictional Work PC sender, and a renamed resume PDF file card rather than any private document.',
      capturePlan:
        'Open /send.html on the local test server and capture after the first .bubble element is rendered.',
      imageKind: 'real-ui',
      imagePath: './assets/mbl2pc/mbl2pc-chat-dashboard.png',
    },
    {
      id: 'dark-mode-theme',
      title: 'Dark-mode file handoff with saved outreach snippets',
      wowFactor: 'Shows the app is useful for real recruiting and field workflows, not just sending text bubbles.',
      whatItShows:
        'The same link-and-resume handoff in the shipped dark mobile UI, with saved snippets visible for resume notes, PC-friendly links, and follow-up language.',
      mockDataApproach:
        'The screenshot uses fictional snippet text and safe file names such as Michael_Smith_Resume_2026.pdf and Resume_Portfolio_Packet.zip.',
      capturePlan:
        'Switch the live page into dark theme, wait for the surface colors to settle, and capture the full messaging viewport.',
      imageKind: 'real-ui',
      imagePath: './assets/mbl2pc/mbl2pc-dark-mode-theme.png',
    },
    {
      id: 'search-and-theme',
      title: 'Searchable file history and reusable snippets',
      wowFactor: 'Highlights a productivity loop: find the file handoff later and reuse the exact outreach text.',
      whatItShows:
        'A real search result filtered to resume-related handoffs, showing the downloadable PDF, a zipped portfolio packet, and saved snippets ready to copy.',
      mockDataApproach:
        'The search term, file names, and snippet contents are seeded portfolio examples that demonstrate the workflow without exposing private messages.',
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
