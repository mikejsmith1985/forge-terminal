// Fictional delivery program used by every NodeToolbox portfolio screen.
//
// The source captures for these replicas are live views of a real employer
// workspace: real project keys, real colleagues, a readable product roadmap.
// None of that may reach the published site, so every value the screens can
// display is invented here instead. Keeping it in one file makes the
// anonymisation guarantee reviewable in a single place, and lets the guard
// test assert against it directly.

// The invented program the whole workspace revolves around.
export const DEMO_PROGRAM_NAME = 'Eligibility & Enrollment Consolidation';
export const DEMO_WORKSPACE_NAME = 'HSCS Enrollment Platform';
export const DEMO_TEAM_NAME = 'Meridian';
export const DEMO_PARTNER_TEAM_NAME = 'Northgate';
export const DEMO_PROGRAM_INCREMENT = 'PI 26.3 (05/21/26 - 07/29/26)';
export const DEMO_TEAM_PROJECT_KEY = 'BEN';

// Invented colleagues. Plain, unremarkable names with no real counterpart.
export const DEMO_PEOPLE = [
  'Ramirez, Dana',
  'Okafor, Chidi',
  'Lindqvist, Sara',
  'Patel, Nikhil',
  'Whitfield, Joan',
];

// ── Roll-Up Board ───────────────────────────────────────────────────────────
// The team's own column vocabulary, each mapped to the Jira status pair it
// stands for. The mapping is the point: work sits in the team's language.
export const DEMO_BOARD_COLUMNS = [
  { label: 'TO DO', count: 25, mapsTo: 'To Do' },
  { label: 'TRIAGE', count: 6, mapsTo: 'Triage' },
  { label: 'READY TO WORK', count: 3, mapsTo: 'Ready to Work' },
  { label: 'WORKING', count: 10, mapsTo: 'Working' },
  { label: 'CODE REVIEW', count: 5, mapsTo: 'Working / Code Review' },
  { label: 'INTERNAL TEST QUEUE', count: 9, mapsTo: 'Ready for Testing' },
  { label: 'SL TESTING', count: 1, mapsTo: 'Ready for Testing / Testing' },
  { label: 'INT TESTING', count: 0, mapsTo: 'Ready for Testing / Integration Test' },
  { label: 'BT TESTING', count: 0, mapsTo: 'Ready for Testing / Ready for UAT' },
  { label: 'READY TO ACCEPT', count: 7, mapsTo: 'Ready to Accept' },
  { label: 'ACCEPTED · DONE', count: 0, mapsTo: 'Accepted - Done' },
  { label: 'CANCELLED', count: 11, mapsTo: 'Cancelled' },
  { label: 'UNMAPPED', count: 6, mapsTo: 'No column claims these', isUnmapped: true },
];

export const DEMO_BOARD_SCOPE_LINE = '18 Feature lanes · 73 issues in scope · PI';
export const DEMO_BOARD_NOTICE = '9 board notices · 6 need attention';

// The honest note an empty lane carries. This is the single most
// portfolio-worthy detail on the board: a lane with nothing under it says so.
export const DEMO_EMPTY_LANE_NOTE =
  'No work rolls up to this Feature yet — it is committed to the PI with nothing underneath.';

export const DEMO_FEATURE_LANES = [
  {
    key: 'PGM-571',
    summary: 'Member ID card reissue enhancements',
    status: 'Implementing',
    itemCount: 0,
    points: 'None',
    priority: 'Medium',
    dependencies: 1,
    isEmpty: true,
  },
  {
    key: 'PGM-1058',
    summary: '[SPIKE] Reduce enrollment fallout volume',
    status: 'Ready Backlog',
    itemCount: 0,
    points: 'None',
    priority: 'Medium',
    dependencies: 0,
    isEmpty: true,
  },
  {
    key: 'PGM-1302',
    summary: 'Trigger eligibility export from the enrollment service',
    status: 'Integrated Test',
    itemCount: 4,
    points: 'None',
    priority: 'None',
    dependencies: 1,
    devPercent: 68,
    devBasis: '3 of 4 by issue count, part credit by column',
    wholePercent: 62,
    wholeBasis: '4 of 6 by issue count, part credit by column',
    verdict: '1 behind',
    isBehind: true,
    integrationDate: '2026-09-03',
    breakdown: 'Deadline gone 1 · On track 2',
  },
  {
    key: 'PGM-1307',
    summary: 'Automate clearing of the pending letters queue',
    status: 'Implementing',
    itemCount: 4,
    points: 'None',
    priority: 'Medium',
    dependencies: 1,
    devPercent: 19,
    devBasis: '3 of 16 by story points, part credit by column',
    wholePercent: 14,
    wholeBasis: '3 of 21 by story points, part credit by column',
    verdict: '3 behind',
    isBehind: true,
    integrationDate: '2026-09-10',
    breakdown: 'Deadline gone 3 · On track 1',
  },
  {
    key: 'PGM-1354',
    summary: 'Scale the transformer service for the full member legacy file',
    status: 'Implementing',
    itemCount: 2,
    points: 'None',
    priority: 'High',
    dependencies: 0,
    devPercent: 22,
    devBasis: '4 of 16 by story points, part credit by column',
    wholePercent: 22,
    wholeBasis: '4 of 16 by story points, part credit by column',
    verdict: 'On track',
    isBehind: false,
    integrationDate: '2026-09-10',
    breakdown: 'On track 2',
  },
];

// ── Daily forecast ──────────────────────────────────────────────────────────
export const DEMO_FORECAST_STATS = [
  { label: 'BEHIND', value: 10, note: 'should already have started', tone: 'behind' },
  { label: 'START TODAY', value: 0, note: 'last day to begin', tone: 'today' },
  { label: 'ON TRACK', value: 16, note: 'no action needed', tone: 'ontrack' },
  { label: 'CANNOT FORECAST', value: 1, note: 'unsized, unowned or undated', tone: 'unknown' },
];

export const DEMO_FORECAST_SCAN_LINE = '27 issues scanned · 1 unsized · 2 undated fix versions';

export const DEMO_FORECAST_GROUPS = [
  {
    title: 'Behind — should already have started',
    tone: 'behind',
    count: 1,
    issues: [
      {
        key: 'BEN-1785',
        summary: 'Run the benefit-eligibility comparison for plan changers',
        owner: 'Ramirez, Dana',
        team: DEMO_TEAM_NAME,
        startBy: '2026-08-21',
        lateness: '1 working day late',
        reason:
          '20 working days of work left before code freeze 2026-09-17 — should have started '
          + '2026-08-21, which was 1 working day ago',
      },
    ],
  },
  {
    title: 'Deadline already passed',
    tone: 'passed',
    count: 2,
    issues: [
      {
        key: 'BEN-2173',
        summary: 'Refactor the stored procedure behind the eligibility lookup',
        owner: 'Okafor, Chidi',
        team: DEMO_TEAM_NAME,
        startBy: '2026-08-14',
        lateness: '7 working days late',
        reason:
          '5 working days of work left and code freeze 2026-08-20 has already passed — no start '
          + 'date can recover this',
      },
      {
        key: 'BEN-2243',
        summary: 'Address validation failure for valid addresses in the integration environment',
        owner: 'Lindqvist, Sara',
        team: DEMO_TEAM_NAME,
        startBy: '2026-08-14',
        lateness: '7 working days late',
        jiraTargetStart: '2026-08-10',
        reason:
          '5 working days of work left and code freeze 2026-08-20 has already passed — no start '
          + 'date can recover this',
      },
    ],
  },
  {
    title: 'On track',
    tone: 'ontrack',
    count: 3,
    issues: [
      {
        key: 'BEN-2064',
        summary: 'Plan details render incorrectly on the eligibility tab',
        owner: 'Patel, Nikhil',
        team: DEMO_TEAM_NAME,
        startBy: '2026-09-17',
        slack: '17 working days of slack',
        jiraTargetStart: '2026-08-14',
        reason:
          '1 working day of work left before code freeze 2026-09-17 — can start as late as 2026-09-17',
      },
      {
        key: 'BEN-2202',
        summary: 'Plan consolidation: migrate the legacy enrollment plan mapping',
        owner: 'Whitfield, Joan',
        team: DEMO_PARTNER_TEAM_NAME,
        startBy: '2026-09-08',
        slack: '10 working days of slack',
        reason:
          '8 working days of work left before code freeze 2026-09-17 — can start as late as 2026-09-08',
      },
      {
        key: 'BEN-2011',
        summary: 'Remediate critical dependency vulnerabilities, part 3',
        owner: 'Okafor, Chidi',
        team: DEMO_TEAM_NAME,
        startBy: '2026-10-01',
        slack: '27 working days of slack',
        jiraTargetStart: '2026-07-24',
        reason:
          '5 working days of work left before PI end 2026-10-07 — can start as late as 2026-10-01',
      },
    ],
  },
  {
    title: 'Unsized — cannot be forecast',
    tone: 'unknown',
    count: 1,
    issues: [
      {
        key: 'BEN-2082',
        summary: 'Primary care provider is not assigned in place of the default',
        owner: 'Ramirez, Dana',
        team: DEMO_TEAM_NAME,
        reason: 'No estimate — cannot forecast, and excluded from every total rather than guessed at',
      },
    ],
  },
];

// ── Hygiene workspace ───────────────────────────────────────────────────────
export const DEMO_HYGIENE_SCORE = '75/100';

export const DEMO_HYGIENE_CHECKS = [
  { label: 'Missing Feature Link', count: 0 },
  { label: 'Missing Parent Link', count: 0 },
  { label: 'Missing Product Owner', count: 0 },
  { label: 'Missing Assignee', count: 0 },
  { label: 'Missing Acceptance Criteria', count: 0 },
  { label: 'Missing Target Start', count: 0 },
  { label: 'Missing Target End', count: 2 },
  { label: 'Missing Fix Version', count: 0 },
  { label: 'Missing Due Date', count: 2 },
  { label: 'Target End reached before testing transition', count: 0 },
  { label: 'Due Date reached before completion', count: 0 },
  { label: 'Unpointed Story', count: 1 },
];

export const DEMO_HYGIENE_BANDS = [
  { label: 'BROKEN', value: 0, note: 'issues with an error flag', tone: 'broken' },
  { label: 'UNTIDY', value: 2, note: 'warnings only', tone: 'untidy' },
  { label: 'DATES FIXABLE', value: 2, note: 'one click, no decisions', tone: 'fixable' },
  { label: 'CLEAN', value: 55, note: 'no flags at all', tone: 'clean' },
];

export const DEMO_HYGIENE_BULK_ACTION = 'Fix 2 blank or mismatched date(s)';

// The refusal is the story: rewriting an overdue date hides a true statement.
export const DEMO_HYGIENE_REFUSAL =
  '6 more have an overdue date — not auto-fixed, because the date is right and the work is late.';

export const DEMO_HYGIENE_FINDINGS = [
  {
    key: 'BEN-2361',
    summary: 'Eligibility rules for newly enrolled group members',
    issueType: 'Story',
    status: 'To Do',
    owner: 'Lindqvist, Sara',
    flags: [
      { label: 'Missing Target End', detail: 'Missing Target End — fix it inline here, or open the issue in Jira.' },
      { label: 'Missing Due Date', detail: 'No due date — set when this is expected to finish.' },
      { label: 'Missing Story Points', detail: 'Missing story points — set the estimate so planning can size this work.' },
    ],
  },
  {
    key: 'BEN-2360',
    summary: 'Eligibility rules for newly enrolled group members — development task',
    issueType: 'Defect',
    status: 'To Do',
    owner: 'Unassigned',
    flags: [
      { label: 'Missing Target End', detail: 'Missing Target End — fix it inline here, or open the issue in Jira.' },
      { label: 'Missing Due Date', detail: 'No due date — set when this is expected to finish.' },
    ],
  },
];

// ── Simple search ───────────────────────────────────────────────────────────
export const DEMO_SEARCH_KEYWORD = 'enrollment';
export const DEMO_SEARCH_RESULT_LINE = 'Showing 98 of 98 matching issues across 3 Jira levels';

export const DEMO_SEARCH_LEVELS = [
  {
    level: 'Portfolio',
    issueCount: 1,
    rows: [
      {
        key: 'PGM-41',
        summary: `Enable the ${DEMO_PROGRAM_NAME} lifecycle end to end`,
        match: 'Description',
        type: 'Program Epic',
        status: 'Analyzing',
        assignee: 'Whitfield, Joan',
        updated: '2026-08-24',
      },
    ],
  },
  {
    level: 'ART',
    issueCount: 6,
    rows: [
      {
        key: 'MER-1235',
        summary: 'Enrollment consolidation | member ID card | PI 27.2',
        match: 'Summary + Description',
        type: 'Feature',
        status: 'Funnel',
        assignee: 'Ramirez, Dana',
        updated: '2026-08-25',
      },
      {
        key: 'MER-1236',
        summary: 'Enrollment consolidation enabler: review fulfilment solution impacts',
        match: 'Summary + Description',
        type: 'Feature',
        status: 'Ready Backlog',
        assignee: 'Okafor, Chidi',
        updated: '2026-08-25',
      },
      {
        key: 'MER-1239',
        summary: 'Enrollment consolidation: provide data to downstream consumers',
        match: 'Summary',
        type: 'Feature',
        status: 'Implementing',
        assignee: 'Patel, Nikhil',
        updated: '2026-08-25',
      },
      {
        key: 'MER-1240',
        summary: 'Enrollment consolidation: annual notice of change automation',
        match: 'Summary',
        type: 'Feature',
        status: 'Implementing',
        assignee: 'Lindqvist, Sara',
        updated: '2026-08-24',
      },
      {
        key: 'MER-1241',
        summary: 'Enable eligibility and enrollment communications',
        match: 'Description',
        type: 'Feature',
        status: 'Analyzing',
        assignee: 'Whitfield, Joan',
        updated: '2026-08-24',
      },
      {
        key: 'MER-1242',
        summary: 'Automate the load of auto-facilitated enrollment files',
        match: 'Description',
        type: 'Feature',
        status: 'Integrated Test',
        assignee: 'Ramirez, Dana',
        updated: '2026-08-24',
      },
    ],
  },
  {
    level: 'Team',
    issueCount: 6,
    rows: [
      {
        key: 'BEN-903',
        summary: 'Configure new group and subgroup class combinations',
        match: 'Summary + Description',
        type: 'Story',
        status: 'Working',
        assignee: 'Patel, Nikhil',
        updated: '2026-08-25',
      },
      {
        key: 'BEN-904',
        summary: 'Document fee-bearing enrollment questions for the consolidation sprint',
        match: 'Summary + Description',
        type: 'Story',
        status: 'To Do',
        assignee: 'Lindqvist, Sara',
        updated: '2026-08-25',
      },
      {
        key: 'BEN-905',
        summary: 'Group enrollment file test scenarios for the migration',
        match: 'Summary',
        type: 'Story',
        status: 'Ready to Accept',
        assignee: 'Okafor, Chidi',
        updated: '2026-08-25',
      },
      {
        key: 'BEN-906',
        summary: 'Enrollment details not added to the reconciliation report',
        match: 'Summary',
        type: 'Defect',
        status: 'Triage',
        assignee: 'Ramirez, Dana',
        updated: '2026-08-24',
      },
      {
        key: 'BEN-907',
        summary: 'Letter suppression for creditable coverage, client attestation part 2',
        match: 'Description',
        type: 'Story',
        status: 'Ready for Testing',
        assignee: 'Whitfield, Joan',
        updated: '2026-08-25',
      },
      {
        key: 'BEN-908',
        summary: 'Enrollment queue is missing skills to be added to the report',
        match: 'Description',
        type: 'Defect',
        status: 'Working',
        assignee: 'Patel, Nikhil',
        updated: '2026-08-24',
      },
    ],
  },
];

// ── Feature composition ─────────────────────────────────────────────────────
export const DEMO_COMPOSITION_TABS = [
  'Feature Review',
  'PI Review',
  'Planner',
  'Feature Splitter',
  'Feature Composition',
  'Bulk Re-write',
];

export const DEMO_COMPOSITION_SOURCES = {
  confluenceUrl: 'https://…/pages/12345/Enrollment consolidation brief',
  relatedIssue: 'PGM-41',
  noteText: 'Intake call with the enrollment operations lead, 21 Aug',
};

// A drafted Feature, written the way the panel's own guidance says to write it.
export const DEMO_COMPOSITION_DRAFT = {
  summary: 'Members keep one ID card when their group plan is consolidated',
  description:
    'Today a group consolidation reissues every member a new card, so roughly 3,000 members a '
    + 'month receive a card they did not need and call to ask why. Proposed: keep the existing '
    + 'card where the member identifier is unchanged, and reissue only on a genuine change.',
  acceptanceCriteria:
    '1. A consolidation that leaves the member identifier unchanged issues no new card.\n'
    + '2. A consolidation that changes it issues exactly one.\n'
    + '3. Suppressed reissues are counted and reportable.',
  ownWords:
    'The reissue rule was never wrong, it was just never scoped to the identifier. This narrows it.',
  createInProject: 'BEN',
  issueType: 'Feature',
};

export const DEMO_COMPOSITION_CHECKLIST = [
  { text: 'Nothing outstanding against your team\'s rules.', isSatisfied: true },
  { text: 'Summary reads as an outcome, not a task.', isSatisfied: true },
  { text: 'Choose the issue type to create. Only the types this project offers are available.', isSatisfied: false },
];

export const DEMO_DOMAIN_COMPONENT_RULE =
  'Components always applied to this team\'s Features (e.g. Enrollment). Applied deterministically '
  + 'by rule — never suggested, and never turned into a story.';

// The panel's own definition of a ready Feature. Generic product guidance with
// no employer content, and the clearest product-thinking artefact in the app.
export const DEMO_READINESS_GUIDANCE = [
  {
    title: 'The problem is stated, not the solution',
    detail:
      'A ready Feature says what is wrong or missing today and for whom. A Feature that opens with '
      + 'the solution hides the reasoning that would let a team propose a better one.',
    question: 'Could a reader say what problem this solves without you in the room?',
  },
  {
    title: 'The value is explicit',
    detail:
      'Say who is better off and how — time saved, risk removed, revenue enabled, a rule complied '
      + 'with. "The business wants it" is not value; it is a sponsor.',
    question: 'If this shipped and nothing else changed, what would measurably improve?',
  },
  {
    title: 'The edges are drawn',
    detail:
      'What is deliberately NOT in this Feature is as useful as what is. An unbounded Feature grows '
      + 'silently during the PI, and no one can tell when it is finished.',
    question: 'What might a reasonable person assume is included that is not?',
  },
  {
    title: 'Acceptance criteria are testable',
    detail:
      'Someone who did not write the Feature should be able to read the criteria and say "yes, that '
      + 'happened" or "no, it did not" — with no discussion.',
    question: 'Could a tester check every criterion without asking you what you meant?',
  },
];
