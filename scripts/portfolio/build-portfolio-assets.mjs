// Builds screen-level mocked UI assets and standalone data for the portfolio site.

import fs from 'node:fs/promises';
import path from 'node:path';

import { PORTFOLIO_APP_DEFINITIONS } from './apps/index.mjs';

const PROJECT_ROOT = process.cwd();
const GENERATED_ASSET_DIRECTORY = path.join(PROJECT_ROOT, 'web', 'portfolio', 'assets', 'generated');
const PORTFOLIO_DATA_DIRECTORY = path.join(PROJECT_ROOT, 'web', 'portfolio', 'data');
const PORTFOLIO_DATA_FILE_PATH = path.join(PORTFOLIO_DATA_DIRECTORY, 'apps.mjs');
const MOCK_SCREEN_WIDTH = 1600;
const MOCK_SCREEN_HEIGHT = 1040;

const MOCK_UI_SCENES = {
  'forge-terminal:multi-tab-terminal': {
    shellKind: 'terminal',
    windowTitle: 'Forge Terminal - C:\\ProjectsWin\\forge-terminal',
    activeNavigationItem: 'Terminal',
    navigationItems: ['Terminal', 'Command Cards', 'Agents', 'Git', 'Workflow'],
    screenTitle: 'Multi-tab terminal workspace',
    screenSubtitle: 'A seeded development session with multiple tabs, command cards, and repo health visible together.',
    sampleDataNote: 'Mock repo: rootlevellabs/benefits-enrollment-demo · Branch: feature/portfolio-showcase',
    components: [
      { type: 'tabs', title: 'Open terminal tabs', items: ['PowerShell - API', 'Node UI', 'Test Runner', 'Release Notes'] },
      {
        type: 'terminal',
        title: 'PowerShell - API',
        lines: [
          'PS C:\\ProjectsWin\\benefits-enrollment-demo> forge workflow status',
          '[OK] branch-created     feature/portfolio-showcase',
          '[OK] tests-written      portfolio-data.test.mjs',
          '[RUNNING] tests-passed  go test ./... && npx vitest run',
          'Next: publish static portfolio preview',
        ],
      },
      {
        type: 'commandCards',
        title: 'Pinned command cards',
        items: [
          ['Run regression pack', 'go test ./... + vitest'],
          ['Open PR checklist', 'Branch, tests, changelog'],
          ['Publish GitHub Pages', 'portfolio static deploy'],
        ],
      },
      { type: 'metrics', title: 'Session signals', items: [['Open PTYs', '4'], ['Command cards', '12'], ['Workflow gates', '3/3'], ['Repo health', 'Green']] },
    ],
  },
  'forge-terminal:instruction-workflow': {
    shellKind: 'browser',
    windowTitle: 'Forge Terminal - AI workflow',
    activeNavigationItem: 'Assistant',
    navigationItems: ['Terminal', 'Assistant', 'Plan', 'Review', 'Tutor'],
    screenTitle: 'Persistent instruction workflow',
    screenSubtitle: 'The mocked screen shows how instructions, task state, and terminal output stay connected during agentic development.',
    sampleDataNote: 'Mock task: rebuild portfolio visuals · Agent mode: workflow-enforced',
    components: [
      {
        type: 'conversation',
        title: 'Assistant thread',
        items: [
          ['User', 'Build portfolio cards that show mocked app UI with seeded data.'],
          ['Copilot', 'Creating screen-level mockups for each feature card.'],
          ['Copilot', 'Portfolio tests will confirm every asset is generated and unique.'],
        ],
      },
      { type: 'checklist', title: 'Workflow gates', items: ['Feature branch confirmed', 'Screen mockup generator updated', 'Portfolio data tests queued', 'Pages publish pending'] },
      { type: 'callout', title: 'In action', body: 'A reviewer can see the AI workflow being controlled by explicit gates rather than a loose chat transcript.' },
    ],
  },
  'forge-terminal:tunnel-mobile': {
    shellKind: 'browser',
    windowTitle: 'Forge Terminal - Remote access setup',
    activeNavigationItem: 'Remote Access',
    navigationItems: ['Terminal', 'Remote Access', 'Vault', 'Mobile', 'Settings'],
    screenTitle: 'Remote and mobile access setup',
    screenSubtitle: 'A safe tunnel setup screen with a companion handoff, connection method, and security controls.',
    sampleDataNote: 'Mock tunnel: portfolio-demo.trycloudflare.com · One-time code: FT-2048',
    components: [
      { type: 'statusSteps', title: 'Connection method', items: ['Named tunnel selected', 'Companion PWA enabled', 'QR token generated', 'Clipboard sanitizer active'] },
      { type: 'phone', title: 'Mobile companion preview', messages: ['Scan QR', 'Join Portfolio Demo', 'Terminal session ready', 'Clipboard handoff enabled'] },
      { type: 'settings', title: 'Safety controls', items: [['Hostname', 'portfolio-demo.trycloudflare.com'], ['Token lifetime', '10 minutes'], ['Access mode', 'Read/write PTY'], ['Vault injection', 'Disabled']] },
    ],
  },
  'nodetoolbox:home-launcher': {
    shellKind: 'browser',
    windowTitle: 'NodeToolbox - Home',
    activeNavigationItem: 'Home',
    navigationItems: ['Home', 'Sprint', 'Reports', 'ServiceNow', 'ART View'],
    screenTitle: 'Internal platform launcher',
    screenSubtitle: 'A realistic landing page that organizes delivery modules like a cohesive internal operating system.',
    sampleDataNote: 'Mock workspace: HSCS Enrollment Platform · PI: 2026-Q2',
    components: [
      {
        type: 'launcher',
        title: 'Utility belt modules',
        items: [
          ['Sprint Dashboard', 'Plan and inspect active sprint health'],
          ['Reports Hub', 'Create executive delivery summaries'],
          ['ServiceNow Hub', 'Track incidents, changes, and hygiene'],
          ['ART View', 'Roll up release-train commitments'],
          ['GitHub Insights', 'Review PR and defect flow'],
          ['My Issues', 'Focus the individual operator view'],
        ],
      },
      { type: 'metrics', title: 'Mock team snapshot', items: [['Programs', '3'], ['Workstreams', '11'], ['Release trains', '2'], ['Open risks', '5']] },
    ],
  },
  'nodetoolbox:sprint-dashboard': {
    shellKind: 'browser',
    windowTitle: 'NodeToolbox - Sprint Dashboard',
    activeNavigationItem: 'Sprint',
    navigationItems: ['Home', 'Sprint', 'Capacity', 'Risks', 'Defects'],
    screenTitle: 'Sprint execution dashboard',
    screenSubtitle: 'Sprint health, capacity, blockers, and delivery risks are mocked as one high-signal operating view.',
    sampleDataNote: 'Mock board: Enrollment API Team · Sprint 24.6 · 86% sprint goal confidence',
    components: [
      { type: 'metrics', title: 'Sprint health', items: [['Goal confidence', '86%'], ['Blocked stories', '4'], ['Open defects', '7'], ['Carryover risk', 'Medium']] },
      {
        type: 'table',
        title: 'Priority work',
        columns: ['Key', 'Summary', 'Owner', 'Status'],
        rows: [
          ['BEN-1421', 'Eligibility rule sync', 'A. Rivera', 'In review'],
          ['BEN-1440', 'Enrollment retry audit', 'M. Chen', 'Blocked'],
          ['BEN-1452', 'API latency dashboard', 'J. Patel', 'Ready QA'],
        ],
      },
      { type: 'progressList', title: 'Team load', items: [['Backend', '72'], ['Frontend', '64'], ['QA', '58'], ['DevOps', '41']] },
    ],
  },
  'nodetoolbox:snow-hub-art': {
    shellKind: 'browser',
    windowTitle: 'NodeToolbox - ServiceNow Hub',
    activeNavigationItem: 'ServiceNow',
    navigationItems: ['Home', 'ServiceNow', 'ART View', 'Change Windows', 'Reports'],
    screenTitle: 'ServiceNow and ART operating hub',
    screenSubtitle: 'Cross-program work is shown as queues, change windows, and release-train signals instead of scattered status links.',
    sampleDataNote: 'Mock data: 2 Sev-2 incidents · 7 change windows · PI confidence 4.6/5',
    components: [
      {
        type: 'kanban',
        title: 'Operational queue',
        columns: [
          ['Triage', ['INC-4021 Enrollment timeout', 'INC-4035 Batch warning']],
          ['In progress', ['CHG-1182 Policy sync', 'TASK-552 Data cleanup']],
          ['Ready for CAB', ['CHG-1201 Release approval']],
        ],
      },
      { type: 'metrics', title: 'Program signals', items: [['Sev-2 items', '2'], ['Change windows', '7'], ['PI confidence', '4.6/5'], ['Release risk', 'Low']] },
    ],
  },
  'eztest:onboarding': {
    shellKind: 'browser',
    windowTitle: 'EZTest - Onboarding',
    activeNavigationItem: 'Setup',
    navigationItems: ['Setup', 'Generate', 'Record', 'Run', 'Reports'],
    screenTitle: 'Guided testing onboarding',
    screenSubtitle: 'A first-run wizard with plain-language setup, framework detection, and provider configuration.',
    sampleDataNote: 'Mock project: Sample React Checkout · Provider: Local demo model',
    components: [
      { type: 'wizard', title: 'Project setup', steps: ['Project folder', 'Framework detected', 'AI provider', 'Ready to generate'], activeStep: 'Framework detected' },
      { type: 'form', title: 'Detected project details', rows: [['Project folder', 'C:\\Repos\\sample-checkout'], ['Framework', 'React + Vite'], ['Test runner', 'Playwright'], ['Target URL', 'http://localhost:5173']] },
      { type: 'callout', title: 'In action', body: 'The mocked screen shows a non-expert path from folder selection to a runnable test plan without exposing a real repository.' },
    ],
  },
  'eztest:dashboard-actions': {
    shellKind: 'browser',
    windowTitle: 'EZTest - Dashboard',
    activeNavigationItem: 'Dashboard',
    navigationItems: ['Dashboard', 'Generate', 'Record', 'Fix', 'Runs'],
    screenTitle: 'Outcome-oriented test dashboard',
    screenSubtitle: 'The mocked UI frames testing work as product actions rather than raw command-line operations.',
    sampleDataNote: 'Mock scan: 12 behaviors mapped · 8 existing specs · Last run 2 minutes ago',
    components: [
      {
        type: 'launcher',
        title: 'Testing jobs to be done',
        items: [
          ['Generate Tests', 'Create specs from discovered behavior'],
          ['Record Flow', 'Capture a user journey'],
          ['Fix Failures', 'Convert errors into repair tasks'],
          ['Run Suite', 'Execute and report'],
          ['MCP Setup', 'Connect automation tools'],
          ['API Settings', 'Manage provider settings'],
        ],
      },
      { type: 'metrics', title: 'Project summary', items: [['Behaviors', '12'], ['Specs', '8'], ['Flaky tests', '1'], ['Coverage', '74%']] },
    ],
  },
  'eztest:run-modal': {
    shellKind: 'browser',
    windowTitle: 'EZTest - Run Modal',
    activeNavigationItem: 'Run',
    navigationItems: ['Dashboard', 'Generate', 'Run', 'Reports', 'Settings'],
    screenTitle: 'Live generation and run feedback',
    screenSubtitle: 'A modal run state shows progress, logs, generated files, and follow-up actions in one place.',
    sampleDataNote: 'Mock run: generated 3 Playwright specs from a fixture checkout app',
    components: [
      { type: 'modalLog', title: 'Playwright generation run', lines: ['Analyzing interaction graph...', 'Mapped 8 components with event coverage', 'Created sign-in.spec.ts', 'Created cart-checkout.spec.ts', 'Created profile-update.spec.ts', 'Generation complete - 3 tests ready'] },
      { type: 'statusSteps', title: 'Follow-up actions', items: ['Open HTML report', 'Review generated specs', 'Run changed tests only', 'Create fix task'] },
    ],
  },
  'mbl2pc:chat-dashboard': {
    shellKind: 'mobile',
    windowTitle: 'MBL2PC - Messages',
    activeNavigationItem: 'Messages',
    navigationItems: ['Messages', 'Clipboard', 'Snippets', 'Files', 'Themes'],
    screenTitle: 'Cross-device messaging dashboard',
    screenSubtitle: 'Seeded messages, quick actions, and pinned items make the utility feel ready for daily use.',
    sampleDataNote: 'Mock device: Demo Phone · Thread: Product Review',
    components: [
      { type: 'chat', title: 'Product Review', messages: [['received', 'Design review starts in 10 minutes.'], ['sent', 'Sending the updated deck now.'], ['received', 'Include the companion notes too.'], ['sent', 'Done - pinned for the team.']] },
      { type: 'statusSteps', title: 'Quick actions', items: ['Send clipboard', 'Upload file', 'Pin thread', 'Search messages'] },
    ],
  },
  'mbl2pc:dark-mode-theme': {
    shellKind: 'mobile',
    windowTitle: 'MBL2PC - Theme Settings',
    activeNavigationItem: 'Themes',
    navigationItems: ['Messages', 'Clipboard', 'Snippets', 'Files', 'Themes'],
    screenTitle: 'Theme system and personalization',
    screenSubtitle: 'The mocked settings panel shows dark-mode choices while preserving the message preview.',
    sampleDataNote: 'Mock theme: Midnight Ocean · Accent: Coral · Density: Comfortable',
    components: [
      { type: 'settings', title: 'Theme controls', items: [['Mode', 'Dark'], ['Palette', 'Midnight Ocean'], ['Bubble style', 'Rounded'], ['Density', 'Comfortable']] },
      { type: 'chat', title: 'Live preview', messages: [['received', 'Dark mode looks sharp.'], ['sent', 'Contrast passes the review checklist.']] },
      { type: 'palette', title: 'Available palettes', items: ['Midnight', 'Ocean', 'Forest', 'Rose'] },
    ],
  },
  'mbl2pc:search-and-theme': {
    shellKind: 'mobile',
    windowTitle: 'MBL2PC - Search',
    activeNavigationItem: 'Search',
    navigationItems: ['Messages', 'Search', 'Snippets', 'Files', 'Themes'],
    screenTitle: 'Search and personalization flow',
    screenSubtitle: 'Search results, snippets, and theme context are visible in the same mocked workflow.',
    sampleDataNote: 'Mock search: "release notes" · 3 matching threads',
    components: [
      { type: 'searchResults', title: 'Search: release notes', rows: ['Product Review - release notes pinned', 'Dev Sync - release package checklist', 'QA Thread - notes sent to laptop'] },
      { type: 'settings', title: 'Active context', items: [['Palette', 'Ocean'], ['Snippets', '5 saved'], ['Clipboard', 'Ready'], ['File handoff', 'Enabled']] },
    ],
  },
  'quikeys:unlock-flow': {
    shellKind: 'desktop',
    windowTitle: 'QuiKeys - Unlock',
    activeNavigationItem: 'Vault',
    navigationItems: ['Vault', 'Macros', 'Security', 'Settings'],
    screenTitle: 'Secure first-run unlock',
    screenSubtitle: 'A native-style unlock dialog communicates local encryption and a clear path into the app.',
    sampleDataNote: 'Mock vault: portfolio-demo.vault · No real credentials displayed',
    components: [
      { type: 'form', title: 'Unlock encrypted vault', rows: [['Master password', '••••••••••'], ['Remember session', 'Off'], ['Vault location', '%TEMP%\\portfolio-demo.vault'], ['Encryption', 'AES-256 local vault']] },
      { type: 'callout', title: 'Security cue', body: 'The mocked screen demonstrates that sensitive macro data starts behind an intentional unlock step.' },
    ],
  },
  'quikeys:macro-manager': {
    shellKind: 'desktop',
    windowTitle: 'QuiKeys - Macro Manager',
    activeNavigationItem: 'Macros',
    navigationItems: ['Vault', 'Macros', 'Categories', 'Hotkeys', 'Audit'],
    screenTitle: 'Macro manager with guarded values',
    screenSubtitle: 'A management screen with hotkeys, triggers, categories, and masked secret rows.',
    sampleDataNote: 'Mock vault rows: 6 fictional macros · API token row is masked',
    components: [
      {
        type: 'table',
        title: 'Saved macros',
        columns: ['Name', 'Hotkey', 'Trigger', 'Category', 'Value'],
        rows: [
          ['Build Check', 'Ctrl+Shift+B', ':build:', 'Development', 'npm run build && npm test'],
          ['Work Email', 'Ctrl+Shift+2', ':work:', 'Communication', 'm.smith@example.com'],
          ['Demo API Token', 'Ctrl+Shift+9', ':token:', 'Credentials', '••••••••••••'],
          ['Release Note', 'Ctrl+Shift+R', ':release:', 'DevOps', 'Draft release summary'],
        ],
      },
      { type: 'statusSteps', title: 'Available actions', items: ['Add macro', 'Edit selected', 'Delete selected', 'Lock vault'] },
    ],
  },
  'quikeys:macro-dialog': {
    shellKind: 'desktop',
    windowTitle: 'QuiKeys - Add Macro',
    activeNavigationItem: 'Editor',
    navigationItems: ['Vault', 'Macros', 'Editor', 'Hotkeys'],
    screenTitle: 'Add/edit automation rule',
    screenSubtitle: 'The mocked dialog shows how a user defines shortcut text, trigger, hotkey, masking, and category.',
    sampleDataNote: 'Mock macro: Build and Test · Value: npm run build && npm test',
    components: [
      { type: 'form', title: 'Macro details', rows: [['Name', 'Build and Test'], ['Text / secret', 'npm run build && npm test'], ['Hotkey', 'Ctrl+Shift+B'], ['Text trigger', ':build:'], ['Category', 'Development'], ['Mask value', 'No']] },
      { type: 'callout', title: 'In action', body: 'The screen makes the automation rule visible before saving, which is what a hiring manager needs to understand the product flow quickly.' },
    ],
  },
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ensureSceneExists(portfolioApp, portfolioFeature) {
  const sceneKey = `${portfolioApp.slug}:${portfolioFeature.id}`;
  const mockUiScene = MOCK_UI_SCENES[sceneKey];

  if (!mockUiScene) {
    throw new Error(`No mocked UI screen is defined for ${sceneKey}.`);
  }

  return mockUiScene;
}

function createNavigationMarkup(mockUiScene) {
  return mockUiScene.navigationItems.map((navigationItem) => {
    const activeClassName = navigationItem === mockUiScene.activeNavigationItem ? ' mock-ui-navigation-item--active' : '';
    return `<div class="mock-ui-navigation-item${activeClassName}">${escapeHtml(navigationItem)}</div>`;
  }).join('');
}

function createMetricMarkup(componentDefinition) {
  const metricsMarkup = componentDefinition.items.map(([metricLabel, metricValue]) => `
    <div class="mock-ui-metric">
      <span>${escapeHtml(metricLabel)}</span>
      <strong>${escapeHtml(metricValue)}</strong>
    </div>
  `).join('');

  return `<section class="mock-ui-panel mock-ui-panel--wide"><h3>${escapeHtml(componentDefinition.title)}</h3><div class="mock-ui-metrics">${metricsMarkup}</div></section>`;
}

function createTerminalMarkup(componentDefinition) {
  const terminalLineMarkup = componentDefinition.lines.map((terminalLine) => `<div class="mock-ui-terminal-line">${escapeHtml(terminalLine)}</div>`).join('');
  return `<section class="mock-ui-panel mock-ui-panel--wide mock-ui-terminal"><h3>${escapeHtml(componentDefinition.title)}</h3>${terminalLineMarkup}</section>`;
}

function createLauncherMarkup(componentDefinition) {
  const launcherMarkup = componentDefinition.items.map(([launcherTitle, launcherDescription]) => `
    <div class="mock-ui-launch-card">
      <strong>${escapeHtml(launcherTitle)}</strong>
      <span>${escapeHtml(launcherDescription)}</span>
    </div>
  `).join('');

  return `<section class="mock-ui-panel mock-ui-panel--wide"><h3>${escapeHtml(componentDefinition.title)}</h3><div class="mock-ui-launch-grid">${launcherMarkup}</div></section>`;
}

function createCommandCardMarkup(componentDefinition) {
  const commandCardMarkup = componentDefinition.items.map(([commandTitle, commandDescription]) => `
    <div class="mock-ui-command-card">
      <strong>${escapeHtml(commandTitle)}</strong>
      <span>${escapeHtml(commandDescription)}</span>
    </div>
  `).join('');

  return `<section class="mock-ui-panel"><h3>${escapeHtml(componentDefinition.title)}</h3>${commandCardMarkup}</section>`;
}

function createSimpleListMarkup(componentDefinition, className) {
  const listMarkup = componentDefinition.items.map((listItem) => `<li>${escapeHtml(listItem)}</li>`).join('');
  return `<section class="mock-ui-panel ${className}"><h3>${escapeHtml(componentDefinition.title)}</h3><ul>${listMarkup}</ul></section>`;
}

function createSettingsMarkup(componentDefinition) {
  const settingsRowsMarkup = componentDefinition.items.map(([settingLabel, settingValue]) => `
    <div class="mock-ui-setting-row">
      <span>${escapeHtml(settingLabel)}</span>
      <strong>${escapeHtml(settingValue)}</strong>
    </div>
  `).join('');

  return `<section class="mock-ui-panel"><h3>${escapeHtml(componentDefinition.title)}</h3>${settingsRowsMarkup}</section>`;
}

function createTableMarkup(componentDefinition) {
  const tableHeaderMarkup = componentDefinition.columns.map((tableColumn) => `<span>${escapeHtml(tableColumn)}</span>`).join('');
  const tableRowMarkup = componentDefinition.rows.map((tableRow) => `
    <div class="mock-ui-table-row">${tableRow.map((tableCell) => `<span>${escapeHtml(tableCell)}</span>`).join('')}</div>
  `).join('');

  return `<section class="mock-ui-panel mock-ui-panel--wide"><h3>${escapeHtml(componentDefinition.title)}</h3><div class="mock-ui-table mock-ui-table--${componentDefinition.columns.length}"><div class="mock-ui-table-header">${tableHeaderMarkup}</div>${tableRowMarkup}</div></section>`;
}

function createProgressMarkup(componentDefinition) {
  const progressRowsMarkup = componentDefinition.items.map(([progressLabel, progressValue]) => `
    <div class="mock-ui-progress-row">
      <div><span>${escapeHtml(progressLabel)}</span><strong>${escapeHtml(progressValue)}%</strong></div>
      <div class="mock-ui-progress-track"><span style="width:${escapeHtml(progressValue)}%"></span></div>
    </div>
  `).join('');

  return `<section class="mock-ui-panel"><h3>${escapeHtml(componentDefinition.title)}</h3>${progressRowsMarkup}</section>`;
}

function createKanbanMarkup(componentDefinition) {
  const kanbanColumnMarkup = componentDefinition.columns.map(([columnTitle, columnItems]) => `
    <div class="mock-ui-kanban-column">
      <strong>${escapeHtml(columnTitle)}</strong>
      ${columnItems.map((columnItem) => `<span>${escapeHtml(columnItem)}</span>`).join('')}
    </div>
  `).join('');

  return `<section class="mock-ui-panel mock-ui-panel--wide"><h3>${escapeHtml(componentDefinition.title)}</h3><div class="mock-ui-kanban">${kanbanColumnMarkup}</div></section>`;
}

function createWizardMarkup(componentDefinition) {
  const stepMarkup = componentDefinition.steps.map((stepTitle) => {
    const activeClassName = stepTitle === componentDefinition.activeStep ? ' mock-ui-step--active' : '';
    return `<div class="mock-ui-step${activeClassName}">${escapeHtml(stepTitle)}</div>`;
  }).join('');

  return `<section class="mock-ui-panel mock-ui-panel--wide"><h3>${escapeHtml(componentDefinition.title)}</h3><div class="mock-ui-steps">${stepMarkup}</div></section>`;
}

function createFormMarkup(componentDefinition) {
  const formRowsMarkup = componentDefinition.rows.map(([fieldLabel, fieldValue]) => `
    <label class="mock-ui-form-row">
      <span>${escapeHtml(fieldLabel)}</span>
      <strong>${escapeHtml(fieldValue)}</strong>
    </label>
  `).join('');

  return `<section class="mock-ui-panel"><h3>${escapeHtml(componentDefinition.title)}</h3>${formRowsMarkup}</section>`;
}

function createConversationMarkup(componentDefinition) {
  const conversationMarkup = componentDefinition.items.map(([speakerName, messageText]) => `
    <div class="mock-ui-conversation-row">
      <span>${escapeHtml(speakerName)}</span>
      <p>${escapeHtml(messageText)}</p>
    </div>
  `).join('');

  return `<section class="mock-ui-panel mock-ui-panel--wide"><h3>${escapeHtml(componentDefinition.title)}</h3>${conversationMarkup}</section>`;
}

function createPhoneMarkup(componentDefinition) {
  const phoneRowsMarkup = componentDefinition.messages.map((phoneMessage) => `<div class="mock-ui-phone-row">${escapeHtml(phoneMessage)}</div>`).join('');
  return `<section class="mock-ui-panel"><h3>${escapeHtml(componentDefinition.title)}</h3><div class="mock-ui-phone">${phoneRowsMarkup}</div></section>`;
}

function createChatMarkup(componentDefinition) {
  const chatMarkup = componentDefinition.messages.map(([messageType, messageText]) => `
    <div class="mock-ui-chat-bubble mock-ui-chat-bubble--${escapeHtml(messageType)}">${escapeHtml(messageText)}</div>
  `).join('');

  return `<section class="mock-ui-panel mock-ui-phone-panel"><h3>${escapeHtml(componentDefinition.title)}</h3>${chatMarkup}</section>`;
}

function createModalLogMarkup(componentDefinition) {
  const modalLogMarkup = componentDefinition.lines.map((modalLine) => `<div class="mock-ui-terminal-line">${escapeHtml(modalLine)}</div>`).join('');
  return `<section class="mock-ui-panel mock-ui-panel--wide"><div class="mock-ui-modal"><h3>${escapeHtml(componentDefinition.title)}</h3>${modalLogMarkup}<button>Open report</button></div></section>`;
}

function createSearchResultsMarkup(componentDefinition) {
  const searchRowsMarkup = componentDefinition.rows.map((searchRow) => `<div class="mock-ui-search-row">${escapeHtml(searchRow)}</div>`).join('');
  return `<section class="mock-ui-panel mock-ui-panel--wide"><h3>${escapeHtml(componentDefinition.title)}</h3><div class="mock-ui-search-box">release notes</div>${searchRowsMarkup}</section>`;
}

function createPaletteMarkup(componentDefinition) {
  const paletteMarkup = componentDefinition.items.map((paletteItem) => `<div class="mock-ui-palette-card">${escapeHtml(paletteItem)}</div>`).join('');
  return `<section class="mock-ui-panel"><h3>${escapeHtml(componentDefinition.title)}</h3><div class="mock-ui-palette-grid">${paletteMarkup}</div></section>`;
}

function createCalloutMarkup(componentDefinition) {
  return `<section class="mock-ui-panel mock-ui-callout"><h3>${escapeHtml(componentDefinition.title)}</h3><p>${escapeHtml(componentDefinition.body)}</p></section>`;
}

function createTabsMarkup(componentDefinition) {
  const tabMarkup = componentDefinition.items.map((tabTitle, tabIndex) => {
    const activeClassName = tabIndex === 0 ? ' mock-ui-tab--active' : '';
    return `<div class="mock-ui-tab${activeClassName}">${escapeHtml(tabTitle)}</div>`;
  }).join('');

  return `<section class="mock-ui-panel mock-ui-panel--wide"><h3>${escapeHtml(componentDefinition.title)}</h3><div class="mock-ui-tabs">${tabMarkup}</div></section>`;
}

function createComponentMarkup(componentDefinition) {
  const componentRenderers = {
    tabs: createTabsMarkup,
    terminal: createTerminalMarkup,
    commandCards: createCommandCardMarkup,
    metrics: createMetricMarkup,
    conversation: createConversationMarkup,
    checklist: (definition) => createSimpleListMarkup(definition, 'mock-ui-checklist'),
    statusSteps: (definition) => createSimpleListMarkup(definition, 'mock-ui-status-list'),
    callout: createCalloutMarkup,
    phone: createPhoneMarkup,
    settings: createSettingsMarkup,
    launcher: createLauncherMarkup,
    table: createTableMarkup,
    progressList: createProgressMarkup,
    kanban: createKanbanMarkup,
    wizard: createWizardMarkup,
    form: createFormMarkup,
    modalLog: createModalLogMarkup,
    chat: createChatMarkup,
    palette: createPaletteMarkup,
    searchResults: createSearchResultsMarkup,
  };
  const componentRenderer = componentRenderers[componentDefinition.type];

  if (!componentRenderer) {
    throw new Error(`No mocked UI component renderer exists for "${componentDefinition.type}".`);
  }

  return componentRenderer(componentDefinition);
}

function createMockScreenStyles() {
  return `
    .mock-ui-frame{height:100%;padding:34px;border-radius:38px;background:linear-gradient(135deg,rgba(13,24,43,.98),rgba(6,10,18,.98));color:#edf4ff;font-family:Inter,Segoe UI,Arial,sans-serif;box-sizing:border-box}
    .mock-ui-window{height:100%;overflow:hidden;border:1px solid rgba(255,255,255,.12);border-radius:30px;background:#0a1324;box-shadow:0 30px 90px rgba(0,0,0,.42)}
    .mock-ui-titlebar{height:56px;display:flex;align-items:center;gap:14px;padding:0 22px;background:rgba(255,255,255,.045);border-bottom:1px solid rgba(255,255,255,.09);box-sizing:border-box}
    .mock-ui-dot{width:13px;height:13px;border-radius:50%;background:#ff5f57}.mock-ui-dot:nth-child(2){background:#ffbd2e}.mock-ui-dot:nth-child(3){background:#28c840}
    .mock-ui-window-title{margin-left:8px;color:#c9d8f4;font-size:17px}
    .mock-ui-screen{height:calc(100% - 56px);display:grid;grid-template-columns:220px minmax(0,1fr);background:linear-gradient(180deg,#101c31,#08111f)}
    .mock-ui-navigation{padding:24px 16px;border-right:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.025)}
    .mock-ui-navigation-item{margin-bottom:10px;padding:12px 14px;border-radius:14px;color:#9fb2d7;font-size:17px}
    .mock-ui-navigation-item--active{background:linear-gradient(135deg,var(--accent),rgba(255,255,255,.16));color:#07101d;font-weight:800}
    .mock-ui-content{padding:26px;display:grid;grid-template-rows:auto 1fr;gap:20px;min-width:0}
    .mock-ui-header{display:flex;justify-content:space-between;gap:24px;align-items:flex-start}
    .mock-ui-feature-title{margin-bottom:8px;color:var(--accent);font-size:14px;font-weight:800;text-transform:uppercase;letter-spacing:.11em}
    .mock-ui-header h2{margin:0 0 8px;font-size:34px;line-height:1.1;color:#f5f8ff}
    .mock-ui-header p{margin:0;color:#b8c9eb;font-size:18px;line-height:1.42;max-width:900px}
    .mock-ui-sample-data{flex:0 0 360px;padding:12px 14px;border-radius:16px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.09);color:#dfe9ff;font-size:15px;line-height:1.35}
    .mock-ui-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:minmax(130px,auto);gap:16px;min-height:0}
    .mock-ui-panel{padding:18px;border-radius:22px;background:rgba(255,255,255,.052);border:1px solid rgba(255,255,255,.09);box-sizing:border-box;min-width:0}
    .mock-ui-panel--wide{grid-column:span 2}.mock-ui-panel h3{margin:0 0 14px;font-size:20px;color:#f2f6ff}.mock-ui-panel p{margin:0;color:#c5d5f2;font-size:18px;line-height:1.45}
    .mock-ui-metrics,.mock-ui-launch-grid,.mock-ui-kanban,.mock-ui-palette-grid,.mock-ui-tabs,.mock-ui-steps{display:grid;gap:12px}
    .mock-ui-metrics{grid-template-columns:repeat(4,1fr)}.mock-ui-launch-grid{grid-template-columns:repeat(3,1fr)}.mock-ui-kanban{grid-template-columns:repeat(3,1fr)}.mock-ui-tabs,.mock-ui-steps{grid-template-columns:repeat(4,1fr)}
    .mock-ui-metric,.mock-ui-launch-card,.mock-ui-command-card,.mock-ui-kanban-column,.mock-ui-step,.mock-ui-tab,.mock-ui-palette-card{padding:14px;border-radius:16px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.08)}
    .mock-ui-metric span,.mock-ui-launch-card span,.mock-ui-command-card span,.mock-ui-window-title{display:block}.mock-ui-metric span,.mock-ui-launch-card span,.mock-ui-command-card span{color:#95abd3;font-size:14px;line-height:1.35}.mock-ui-metric strong,.mock-ui-launch-card strong,.mock-ui-command-card strong{display:block;color:#f7faff;font-size:21px;margin-bottom:6px}
    .mock-ui-terminal{background:#050912}.mock-ui-terminal-line{padding:8px 0;border-bottom:1px solid rgba(255,255,255,.07);font:18px Consolas,Menlo,monospace;color:#d7e3fa}.mock-ui-terminal-line:last-child{border-bottom:0}
    ul{margin:0;padding-left:20px}li{margin:0 0 10px;color:#dbe6fb;font-size:17px;line-height:1.35}
    .mock-ui-setting-row,.mock-ui-form-row,.mock-ui-progress-row,.mock-ui-search-row{display:block;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.075);color:#dce6f9;font-size:16px}.mock-ui-setting-row strong,.mock-ui-form-row strong{float:right;color:#fff}
    .mock-ui-table-header,.mock-ui-table-row{display:grid;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.075);font-size:15px}.mock-ui-table--4 .mock-ui-table-header,.mock-ui-table--4 .mock-ui-table-row{grid-template-columns:.8fr 1.8fr 1fr 1fr}.mock-ui-table--5 .mock-ui-table-header,.mock-ui-table--5 .mock-ui-table-row{grid-template-columns:1fr 1fr .9fr 1fr 1.7fr}.mock-ui-table-header{color:#93a9d3;text-transform:uppercase;letter-spacing:.08em;font-size:12px}.mock-ui-table-row span{color:#edf4ff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .mock-ui-progress-row>div:first-child{display:flex;justify-content:space-between;margin-bottom:8px}.mock-ui-progress-track{height:10px;border-radius:99px;background:rgba(255,255,255,.09);overflow:hidden}.mock-ui-progress-track span{display:block;height:100%;border-radius:99px;background:var(--accent)}
    .mock-ui-kanban-column strong{display:block;margin-bottom:10px}.mock-ui-kanban-column span{display:block;margin-bottom:8px;padding:9px;border-radius:12px;background:rgba(0,0,0,.18);color:#dce6fb;font-size:15px}
    .mock-ui-step--active,.mock-ui-tab--active{background:rgba(255,255,255,.12);border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
    .mock-ui-conversation-row{margin-bottom:10px;padding:12px;border-left:4px solid var(--accent);border-radius:14px;background:rgba(255,255,255,.05)}.mock-ui-conversation-row span{display:block;color:#91a8d1;font-size:12px;text-transform:uppercase;letter-spacing:.12em}.mock-ui-conversation-row p{margin:6px 0 0;color:#e8f0ff;font-size:17px}
    .mock-ui-phone{width:230px;margin:auto;padding:18px;border-radius:28px;background:#050912;border:1px solid rgba(255,255,255,.12)}.mock-ui-phone-row{margin-bottom:10px;padding:11px;border-radius:14px;background:rgba(255,255,255,.08);color:#eaf1ff;text-align:center}
    .mock-ui-phone-panel{background:#06101f}.mock-ui-chat-bubble{max-width:76%;margin:0 0 10px;padding:13px 15px;border-radius:18px;background:rgba(255,255,255,.09);font-size:17px;line-height:1.35}.mock-ui-chat-bubble--sent{margin-left:auto;background:linear-gradient(135deg,var(--accent),#ffd9c2);color:#06101f;font-weight:700}
    .mock-ui-modal{max-width:760px;margin:auto;padding:24px;border-radius:24px;background:#050912;border:1px solid rgba(255,255,255,.1);box-shadow:0 18px 60px rgba(0,0,0,.42)}button{margin-top:14px;padding:11px 16px;border:0;border-radius:12px;background:var(--accent);color:#07101d;font-weight:800}
    .mock-ui-search-box{margin-bottom:12px;padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.08);color:#fff}.mock-ui-palette-grid{grid-template-columns:repeat(2,1fr)}
    .mock-ui-shell--mobile .mock-ui-grid{grid-template-columns:.85fr 1.15fr}.mock-ui-shell--desktop .mock-ui-window{max-width:1180px;margin:0 auto}.mock-ui-shell--terminal .mock-ui-navigation-item--active{background:linear-gradient(135deg,#7cf7c8,var(--accent))}
  `;
}

function createMockRenderSvg(portfolioApp, portfolioFeature) {
  const mockUiScene = ensureSceneExists(portfolioApp, portfolioFeature);
  const componentMarkup = mockUiScene.components.map((componentDefinition) => createComponentMarkup(componentDefinition)).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${MOCK_SCREEN_WIDTH}" height="${MOCK_SCREEN_HEIGHT}" viewBox="0 0 ${MOCK_SCREEN_WIDTH} ${MOCK_SCREEN_HEIGHT}" fill="none">
  <rect width="${MOCK_SCREEN_WIDTH}" height="${MOCK_SCREEN_HEIGHT}" rx="48" fill="#050c18"/>
  <foreignObject x="36" y="36" width="1528" height="968">
    <div xmlns="http://www.w3.org/1999/xhtml" class="mock-ui-frame mock-ui-shell--${escapeHtml(mockUiScene.shellKind)}" style="--accent:${escapeHtml(portfolioApp.accent)}">
      <style>${createMockScreenStyles()}</style>
      <div class="mock-ui-window">
        <div class="mock-ui-titlebar">
          <span class="mock-ui-dot"></span><span class="mock-ui-dot"></span><span class="mock-ui-dot"></span>
          <span class="mock-ui-window-title">${escapeHtml(mockUiScene.windowTitle)}</span>
        </div>
        <div class="mock-ui-screen">
          <aside class="mock-ui-navigation">${createNavigationMarkup(mockUiScene)}</aside>
          <main class="mock-ui-content">
            <header class="mock-ui-header">
              <div>
                <div class="mock-ui-feature-title">${escapeHtml(portfolioFeature.title)}</div>
                <h2>${escapeHtml(mockUiScene.screenTitle)}</h2>
                <p>${escapeHtml(mockUiScene.screenSubtitle)}</p>
              </div>
              <div class="mock-ui-sample-data">${escapeHtml(mockUiScene.sampleDataNote)}</div>
            </header>
            <section class="mock-ui-grid">${componentMarkup}</section>
          </main>
        </div>
      </div>
    </div>
  </foreignObject>
</svg>`;
}

async function ensureDirectoryExists(directoryPath) {
  await fs.mkdir(directoryPath, { recursive: true });
}

async function writePortfolioDataModule() {
  await ensureDirectoryExists(PORTFOLIO_DATA_DIRECTORY);

  const serializedPortfolioApps = JSON.stringify(PORTFOLIO_APP_DEFINITIONS, null, 2);
  const generatedModuleContents = `// Generated portfolio data for the standalone showcase site.
// Rebuild this file with \`node scripts/portfolio/build-portfolio-assets.mjs\`.

export const PORTFOLIO_APPS = ${serializedPortfolioApps};
`;

  await fs.writeFile(PORTFOLIO_DATA_FILE_PATH, generatedModuleContents, 'utf8');
}

async function removeStaleGeneratedAssets() {
  await ensureDirectoryExists(GENERATED_ASSET_DIRECTORY);
  const existingGeneratedEntries = await fs.readdir(GENERATED_ASSET_DIRECTORY, { withFileTypes: true });

  for (const existingGeneratedEntry of existingGeneratedEntries) {
    const isGeneratedSvg = existingGeneratedEntry.isFile() && path.extname(existingGeneratedEntry.name) === '.svg';

    if (isGeneratedSvg) {
      await fs.unlink(path.join(GENERATED_ASSET_DIRECTORY, existingGeneratedEntry.name));
    }
  }
}

async function buildRenderedAssets() {
  await removeStaleGeneratedAssets();

  for (const portfolioApp of PORTFOLIO_APP_DEFINITIONS) {
    for (const portfolioFeature of portfolioApp.features) {
      const outputPath = path.join(GENERATED_ASSET_DIRECTORY, `${portfolioApp.slug}-${portfolioFeature.id}.svg`);
      const renderSvg = createMockRenderSvg(portfolioApp, portfolioFeature);
      await fs.writeFile(outputPath, renderSvg, 'utf8');
    }
  }
}

await writePortfolioDataModule();
await buildRenderedAssets();
