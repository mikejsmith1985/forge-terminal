// Fictional workspace used by every LG-Builder portfolio screen.
//
// The reference material is a real Discord workspace and a running admin
// console: real server and channel names, real colleagues, real ticket and
// issue identifiers, and a live webhook URL. None of that may be published, so
// every value the screens can display is invented here instead.

export const DEMO_SERVER_NAME = 'Northwind Platform';
export const DEMO_BOT_NAME = 'LG-Builder';
export const DEMO_TEST_BOT_NAME = 'Reviewer';

export const DEMO_CHANNELS = [
  { name: 'general', kind: 'text' },
  { name: 'requirements-forum', kind: 'forum' },
  { name: 'build-notifications', kind: 'text' },
  { name: 'delivery-chat', kind: 'text' },
  { name: 'escalation-chat', kind: 'text' },
  { name: 'intake', kind: 'text' },
];

// ── Human-in-the-loop checkpoint ────────────────────────────────────────────
// The pipeline pauses here. Nothing advances until a person answers.
export const DEMO_CHECKPOINT = {
  ticketId: 'INC0042118',
  ticketTitle: 'Add a task summary view for team managers',
  jiraKey: 'NWP-214',
  stage: 'build_waiting_pr_review',
  checkpointId: 'build_waiting_pr_review_20260826_104512',
  agent: 'BuildWorkflowOrchestrator',
  status: 'pending',
  reviewUrl: 'http://localhost:3000/',
  pullRequestUrl: 'https://github.com/example-org/asset-registry/pull/128',
  decisions: [
    { keyword: 'approve', meaning: 'merge this pull request' },
    { keyword: 'reject_code', meaning: 'implementation issue — the developer should fix it' },
    { keyword: 'reject_requirements', meaning: 'the requirement was wrong — send it back to intake' },
  ],
};

// The clarifying questions the pipeline posts before it will build anything.
export const DEMO_CLARIFYING_EXCHANGE = {
  prompt:
    'I need Product Owner input before I can continue this workflow.',
  questions: [
    {
      heading: 'Q1. Minimum required metrics',
      answer:
        'Total task count by status (open, in progress, completed, blocked), overdue task count, '
        + 'and a per-assignee workload breakdown showing how many tasks each person currently has '
        + 'open — that combination is what stops managers clicking through individual tasks.',
    },
    {
      heading: 'Q2. Where the data lives',
      answer:
        'All task data lives in the internal system\'s existing database — a single source, with no '
        + 'third-party tracker in play — so the summary should pull only from there.',
    },
    {
      heading: 'Q3. What "done" looks like',
      answer:
        'Counts and status breakdowns alone are not enough. The view must also show days overdue '
        + 'for overdue tasks and average completion time over the last 30 days, or managers still '
        + 'cannot tell which way the team is trending.',
    },
    {
      heading: 'Q4. Access control',
      answer:
        'Each manager should see only tasks belonging to their own direct team.',
    },
  ],
};

export const DEMO_CREATED_ISSUES = [
  { jiraKey: 'NWP-214', ticketId: 'INC0042118' },
  { jiraKey: 'NWP-215', ticketId: 'INC0042119' },
  { jiraKey: 'NWP-216', ticketId: 'INC0042120' },
];

// ── SLA escalation and auto-reject ──────────────────────────────────────────
// The pipeline will not sit paused forever, and it does not quietly proceed
// either. It escalates, then rejects, and says which of the two happened.
export const DEMO_ESCALATION = {
  checkpointId: 'waiting_po_input_20260826_165302',
  waitedMinutes: 61,
  remainingMinutes: 2,
  ticketId: 'INC0042144',
  ticketTitle: 'Build the internal asset registry reference application',
  ticketExcerpt:
    'A clean, moderately complex reference application to exercise the agentic delivery workflow '
    + 'end to end. Application name: Internal Asset Registry (demo)…',
  workflow: 'HITL Review',
  reviewUrl: 'http://localhost:3000/',
  outstandingQuestions: [
    'Who is the primary user persona for this reference application — a developer exercising the '
    + 'workflow against realistic patterns, a QA engineer validating generated code, or a tech lead '
    + 'evaluating architecture decisions — and what is that person\'s role, so acceptance criteria '
    + 'can be framed around actual usage?',
    'The ticket states this application will be the reference codebase for the delivery programme. '
    + 'Can you confirm the role of the requester who owns it, so the team knows who to consult on '
    + 'architectural trade-offs that will affect every later enhancement ticket?',
  ],
  autoRejectNotice:
    'was automatically rejected because no Product Owner decision was received within the '
    + 'configured SLA.',
  autoRejectMinutes: 3,
  ticketOutcome: 'The service ticket has been moved to the rejected state.',
};

// ── Admin console: review queue ─────────────────────────────────────────────
export const DEMO_REVIEW_QUEUE = {
  explanation:
    'When the workflow detects a ticket is missing required information, it posts clarifying '
    + 'questions to your messaging channel and creates a stop event here. Once the Product Owner '
    + 'replies, the workflow resumes automatically. You can also approve, reject, or flag a ticket '
    + 'as needing changes from this page. Resolved events stay visible so there is a full audit trail.',
  pendingEvents: [
    {
      ticketId: 'INC0042144',
      title: 'Build the internal asset registry reference application',
      stage: 'waiting_po_input',
      waitingFor: 'Product Owner',
      age: 'waiting 61 minutes',
      isEscalated: true,
    },
    {
      ticketId: 'INC0042151',
      title: 'Surface overdue tasks on the manager dashboard',
      stage: 'waiting_po_input',
      waitingFor: 'Product Owner',
      age: 'waiting 12 minutes',
      isEscalated: false,
    },
    {
      ticketId: 'INC0042118',
      title: 'Add a task summary view for team managers',
      stage: 'build_waiting_pr_review',
      waitingFor: 'Reviewer',
      age: 'waiting 4 minutes',
      isEscalated: false,
    },
  ],
  decisionHistory: [
    {
      ticketId: 'INC0042107',
      title: 'Reissue rules for consolidated group plans',
      decision: 'Approved',
      decidedBy: 'Product Owner · in channel',
      resolvedAfter: 'answered in 7 minutes',
      tone: 'approved',
    },
    {
      ticketId: 'INC0042099',
      title: 'Export the eligibility file nightly',
      decision: 'Rejected — requirements',
      decidedBy: 'Product Owner · in channel',
      resolvedAfter: 'answered in 22 minutes',
      tone: 'rejected',
    },
    {
      ticketId: 'INC0042085',
      title: 'Add pagination to the audit log',
      decision: 'Auto-rejected — SLA expired',
      decidedBy: 'No decision received',
      resolvedAfter: 'escalated, then closed after 3 minutes',
      tone: 'auto',
    },
  ],
};

// ── Admin console: pipeline ─────────────────────────────────────────────────
export const DEMO_PIPELINE = {
  subtitle: 'End-to-end view of every request from service ticket to production',
  filters: ['All', 'Pending HITL', 'Building', 'In Production', 'Complete'],
  activeFilter: 'All',
  runs: [
    {
      ticketId: 'INC0042118',
      title: 'Add a task summary view for team managers',
      jiraKey: 'NWP-214',
      stage: 'Pending HITL',
      detail: 'Waiting on pull request review',
      tone: 'hitl',
      duration: '4m',
    },
    {
      ticketId: 'INC0042151',
      title: 'Surface overdue tasks on the manager dashboard',
      jiraKey: 'NWP-217',
      stage: 'Pending HITL',
      detail: 'Waiting on Product Owner answers',
      tone: 'hitl',
      duration: '12m',
    },
    {
      ticketId: 'INC0042132',
      title: 'Reconcile asset owners against the directory',
      jiraKey: 'NWP-211',
      stage: 'Building',
      detail: 'Agent implementing · 3 of 5 acceptance criteria met',
      tone: 'building',
      duration: '31m',
    },
    {
      ticketId: 'INC0042107',
      title: 'Reissue rules for consolidated group plans',
      jiraKey: 'NWP-206',
      stage: 'In Production',
      detail: 'Merged and deployed · watching for defects',
      tone: 'production',
      duration: '2h 14m',
    },
    {
      ticketId: 'INC0042088',
      title: 'Add an export button to the asset list',
      jiraKey: 'NWP-198',
      stage: 'Complete',
      detail: 'Closed — no defects observed in 7 days',
      tone: 'complete',
      duration: '3d',
    },
  ],
  closeLoop: [
    {
      sourceTicket: 'INC0042160',
      detectedFrom: 'Production error rate on the asset list endpoint',
      raisedAs: 'NWP-219',
      note: 'Defect observed in production was fed back into intake as new work.',
    },
  ],
};

// ── Admin console: automation policy ────────────────────────────────────────
// The governance dial. Every value here is a deliberate limit on what the
// pipeline may do without a person.
export const DEMO_POLICY = {
  description:
    'Configure how the workflow asks clarifying questions, when it escalates, and how it verifies '
    + 'runtime readiness.',
  primaryChannel: 'discord',
  waitForResponseMinutes: 60,
  waitAfterEscalationMinutes: 240,
  autoRejectAfterEscalation: true,
  allowReopenAfterRejection: true,
  multiChannelPolicy: 'First response wins',
  plainLanguageGuidance:
    'Ask one clear question at a time in plain language and wait for the Product Owner response.',
  // Never a working value: the field is shown, the credential is not.
  escalationWebhookLabel: 'https://discord.com/api/webhooks/••••••••••••/••••••',
  escalationWebhookNote:
    'Posts when the SLA is breached. Stored in the vault and never displayed in full.',
};
