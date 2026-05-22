// Portfolio data for the cross-product showcase page.
//
// Forge Terminal's definition lives in its own app-specific file so the launch
// strategy, asset paths, and wow-moment narratives can evolve independently of
// the other apps. All other app definitions remain inline here.

import { FORGE_TERMINAL_APP } from '../../../scripts/portfolio/apps/forge-terminal.mjs';

export const PORTFOLIO_APPS = [
  // Forge Terminal: imported from the dedicated per-app config file.
  // Edit scripts/portfolio/apps/forge-terminal.mjs to change its definition.
  FORGE_TERMINAL_APP,
  {
    slug: 'nodetoolbox',
    name: 'NodeToolbox',
    tagline: 'Local-first enterprise delivery workspace that unifies Jira, ServiceNow, GitHub, and reporting.',
    summary:
      'NodeToolbox is the clearest story of product breadth: one application orchestrating planning, reporting, ITSM, and delivery operations behind a localhost proxy. It reads like a serious internal platform, not a toy side project.',
    accent: '#1cc88a',
    category: 'Enterprise operations workspace',
    launchSurface: 'npm run build:client && npm start',
    techStack: ['Node.js', 'Express', 'React', 'Playwright'],
    proofNote: 'Demo mode already exists, which makes this a strong candidate for safe employer-facing walkthroughs.',
    features: [
      {
        id: 'home-launcher',
        title: 'Product launcher that feels like an internal operating system',
        wowFactor: 'Quickly communicates product breadth and information architecture skill.',
        whatItShows:
          'A clean home surface that routes into specialized tools without feeling like disconnected utilities.',
        mockDataApproach:
          'Enable demo mode so navigation, module labels, and connectivity affordances stay safe and deterministic.',
        capturePlan: 'Capture the home route with the app shell fully loaded in Playwright.',
      },
      {
        id: 'sprint-dashboard',
        title: 'Sprint dashboard for execution, planning, and release readiness',
        wowFactor: 'Signals enterprise complexity handled through coherent UX.',
        whatItShows:
          'A dense delivery workspace where sprint health, blockers, defects, planning, and release monitoring live together.',
        mockDataApproach:
          'Use the built-in demo-mode storage and fake service responses already supported by the app.',
        capturePlan: 'Capture the sprint dashboard route after preloading demo sprint data.',
      },
      {
        id: 'snow-hub-art',
        title: 'Specialist workflow surface: ServiceNow Hub or ART View',
        wowFactor: 'Shows that the product scales from team execution to cross-program orchestration.',
        whatItShows:
          'A specialized screen for release-train leadership or ITSM process work that still feels productized.',
        mockDataApproach:
          'Serve stable fake connectivity and route-specific mock records so the page looks real without exposing systems.',
        capturePlan: 'Capture the strongest of the two routes once the demo fixture set is finalized.',
      },
    ],
  },
  {
    slug: 'eztest',
    name: 'EZTest',
    tagline: 'AI-assisted behavioral testing companion with a polished browser wizard and Playwright-native workflows.',
    summary:
      'EZTest stands out because it turns test generation, defect capture, and fix validation into a guided product experience. The UI reads more like a polished SaaS wizard than a developer utility.',
    accent: '#a66bff',
    category: 'Developer productivity',
    launchSurface: 'npm run dev -- ui -p 7433',
    techStack: ['TypeScript', 'Express', 'Socket.io', 'Playwright'],
    proofNote: 'The repo already includes a sample fixture app and a browser-first wizard server.',
    features: [
      {
        id: 'onboarding',
        title: 'Two-step onboarding that explains value without jargon',
        wowFactor: 'Proves the product is approachable to non-experts, not just power users.',
        whatItShows:
          'A setup flow that asks for project context and AI provider details in plain language.',
        mockDataApproach:
          'Use a local sample app path and a safe provider configuration without storing real API credentials.',
        capturePlan: 'Capture the onboarding overlay in the wizard before app initialization finishes.',
      },
      {
        id: 'dashboard-actions',
        title: 'Action dashboard that frames testing work as outcomes',
        wowFactor: 'Shows product strategy, not just command execution.',
        whatItShows:
          'A six-card dashboard where the core jobs-to-be-done are obvious immediately: generate, record, fix, run, integrate, manage.',
        mockDataApproach:
          'Point the UI at the fixture app so project summary details and action states stay deterministic.',
        capturePlan: 'Capture the post-onboarding dashboard with the project summary bar populated.',
      },
      {
        id: 'run-modal',
        title: 'Live run modal with progress, logs, and follow-up actions',
        wowFactor: 'Communicates end-to-end workflow maturity and actionable feedback loops.',
        whatItShows:
          'A run experience where users can understand progress, outcomes, and next steps without reading a terminal transcript.',
        mockDataApproach:
          'Replay a safe, pre-recorded run transcript that ends with an open-report action.',
        capturePlan: 'Capture the run modal with a deterministic success state once the UI server fixture is seeded.',
      },
    ],
  },
  {
    slug: 'mbl2pc',
    name: 'MBL2PC',
    tagline: 'Phone-to-PC messaging experience with uploads, snippets, and personalization in one lightweight app.',
    summary:
      'MBL2PC tells a strong story about end-user empathy: cross-device messaging, quick sharing, and personalization. The local test server makes it ideal for a demo-safe portfolio because the real UI already works with seeded messages.',
    accent: '#ff8a4c',
    category: 'Cross-device utility',
    launchSurface: 'python test_local.py',
    techStack: ['FastAPI', 'Python', 'HTML', 'Cypress'],
    proofNote: 'The repository already includes a deterministic local demo server that serves the real UI.',
    features: [
      {
        id: 'chat-dashboard',
        title: 'Rich chat dashboard with search, pinning, and timeline depth',
        wowFactor: 'Shows consumer-style UX polish with real utility features.',
        whatItShows:
          'A message workspace that feels production-ready instead of a barebones chat feed.',
        mockDataApproach:
          'Reuse the seeded test_local.py messages so the chat looks busy, useful, and safe.',
        capturePlan: 'Capture the real send.html surface served by the local test server.',
      },
      {
        id: 'personalization',
        title: 'Theme, font, and identity customization',
        wowFactor: 'Shows attention to delight, accessibility, and personalization.',
        whatItShows:
          'UI controls that let the experience feel personal rather than generic.',
        mockDataApproach:
          'Preset a safe device name and visual settings so the screen reads as intentional and polished.',
        capturePlan: 'Capture the settings-rich state after applying a distinct demo theme.',
      },
      {
        id: 'clipboard-and-files',
        title: 'Clipboard sync, snippets, and file-sharing workflow',
        wowFactor: 'Highlights practical productivity value beyond plain text chat.',
        whatItShows:
          'A workflow where quick snippets, files, and images make the app useful during real work.',
        mockDataApproach:
          'Seed demo snippets and fake file cards so the UI tells a complete cross-device story.',
        capturePlan: 'Capture a demo conversation with attachment cards and clipboard interactions visible.',
      },
    ],
  },
  {
    slug: 'quikeys',
    name: 'QuiKeys',
    tagline: 'Secure keyboard automation and credential helper built as a native desktop experience.',
    summary:
      'QuiKeys is the strongest native-app story in the set. It demonstrates platform APIs, encrypted storage, and operator-focused UX in a compact product that feels genuinely useful.',
    accent: '#ff5fa2',
    category: 'Native desktop utility',
    launchSurface: 'python src\\main.py',
    techStack: ['Python', 'Tkinter', 'Pillow', 'cryptography'],
    proofNote: 'The portfolio plan uses seeded mock vault data so screenshots stay safe while still showing the real windows.',
    features: [
      {
        id: 'unlock-flow',
        title: 'First-run unlock and secure vault setup',
        wowFactor: 'Demonstrates security thinking without sacrificing clarity.',
        whatItShows:
          'A first-run or unlock path that communicates trust, validation, and a native feel.',
        mockDataApproach:
          'Use a disposable portfolio vault with fake secrets and a safe local-only password.',
        capturePlan: 'Capture the unlock window in a seeded first-run state.',
      },
      {
        id: 'macro-manager',
        title: 'Macro manager for operational shortcuts and guarded secrets',
        wowFactor: 'Shows a power-user table workflow with strong utility value.',
        whatItShows:
          'A management surface where macros, triggers, categories, and masked values feel organized and serious.',
        mockDataApproach:
          'Inject a seeded in-memory vault with representative fake macros and categories.',
        capturePlan: 'Capture the manager window with a full list of safe demo macros.',
      },
      {
        id: 'macro-dialog',
        title: 'Add and edit dialog for secure automation rules',
        wowFactor: 'Shows detail-oriented form design inside a desktop app.',
        whatItShows:
          'The form users rely on to define hotkeys, triggers, masking, and delivery behavior.',
        mockDataApproach:
          'Populate the dialog with example macro settings that look realistic but do not contain sensitive values.',
        capturePlan: 'Capture the add/edit dialog in a pre-filled demo state.',
      },
    ],
  },
];
