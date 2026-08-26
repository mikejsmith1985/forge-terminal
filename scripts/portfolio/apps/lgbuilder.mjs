// App-specific portfolio display and capture definitions for LG-Builder.
//
// LG-Builder is an agentic software-delivery pipeline built on LangGraph. It
// watches a system of record for new work, gates it through human checkpoints,
// hands ready work to a coding agent, enforces human review before merge, then
// watches production and feeds any defect back through the same pipeline.
//
// Its replicas are rebuilt in scripts/portfolio/screens/lgbuilder-screens.mjs
// from captures of a real chat workspace and a running admin console, so the
// server, colleagues, tickets, issue keys, and webhook are all replaced by the
// invented values in lgbuilder-demo-data.mjs.

const LOCAL_REPO_PATH = 'C:\\ProjectsWin\\DBAI';

// Chat surfaces are portrait-ish and console surfaces are landscape, so each
// group is captured at the width that suits it.
const CHAT_SCREEN_WIDTH = 1500;
const CONSOLE_SCREEN_WIDTH = 1600;
const SCREEN_HEIGHT = 1000;

function createCaptureTarget(featureId, viewportWidth, mockSafetyNotes) {
  return {
    featureId,
    outputFileName: `lgbuilder-${featureId}.png`,
    viewportWidth,
    viewportHeight: SCREEN_HEIGHT,
    mockSafetyNotes,
  };
}

export const LGBUILDER_APP = {
  slug: 'lgbuilder',
  name: 'LG-Builder',
  tagline:
    'An agentic delivery pipeline on LangGraph that stops and asks a human — and says so out loud '
    + 'when nobody answers.',
  summary:
    'LG-Builder watches a system of record for new work, gates it through human checkpoints before '
    + 'anything is built, hands ready work to a coding agent, enforces human review before merge, '
    + 'then watches production and feeds any defect it finds back into the same intake. The design '
    + 'problem it solves is not generating code — it is knowing when the machine must stop. Every '
    + 'checkpoint has an owner, a deadline, an escalation path, and a recorded outcome, so an '
    + 'unanswered question becomes a visible rejection rather than a silent assumption.',
  accent: '#22d3ee',
  category: 'Agentic delivery platform',
  launchSurface: 'docker compose up',
  techStack: ['LangGraph', 'Python', 'FastAPI', 'React', 'TypeScript', 'Postgres'],
  proofNote:
    'These screens are source-derived replicas of the running chat integration and admin console, '
    + 'populated with an invented delivery programme. The captures they were rebuilt from show a '
    + 'real workspace and are not published — no real server, colleague, ticket, issue key, or '
    + 'webhook appears anywhere in this section, and no webhook value is rendered at all.',

  // ── Five surfaces, ordered so the thesis leads ────────────────────────────
  features: [
    {
      id: 'hitl-checkpoint',
      title: 'The pipeline stops and will not continue without a person',
      wowFactor:
        'A human checkpoint is a first-class state in the graph, not a notification. The run '
        + 'suspends, its state is persisted, and it resumes only when a named decision arrives — '
        + 'so a pause can outlive a process restart rather than dropping the work on the floor.',
      whatItShows:
        'The workflow posting clarifying questions before it will build anything, the Product '
        + 'Owner answering in the channel, tracker issues being created from those answers, and a '
        + 'pull-request review checkpoint sitting at pending with the three decisions that can '
        + 'release it.',
      mockDataApproach:
        'The server, channels, people, ticket identifiers, issue keys, and repository URL are all '
        + 'invented against a fictional delivery programme.',
      capturePlan:
        'Portfolio runner renders the chat integration from the shipped message structure with an invented exchange.',
      imageKind: 'source-derived-replica',
      imagePath: './assets/lgbuilder/lgbuilder-hitl-checkpoint.png',
    },
    {
      id: 'sla-escalation',
      title: 'When nobody answers, it escalates — then rejects, and says which',
      wowFactor:
        'The failure mode of human-in-the-loop is a queue nobody reads. This pipeline treats an '
        + 'unanswered question as an outcome: it escalates to a wider audience with the questions '
        + 'restated, counts down in public, and on expiry moves the ticket to rejected. It never '
        + 'proceeds on an assumption, and never silently stalls either.',
      whatItShows:
        'An escalation notice naming how long a checkpoint has waited, the outstanding questions '
        + 'repeated so a senior reviewer can resolve it in place, the remaining time before '
        + 'auto-rejection, and the auto-rejection itself recording that no decision was received.',
      mockDataApproach:
        'Checkpoint identifiers, ticket text, and timings belong to the invented programme.',
      capturePlan:
        'Portfolio runner renders the escalation thread from the shipped notice structure with invented checkpoints.',
      imageKind: 'source-derived-replica',
      imagePath: './assets/lgbuilder/lgbuilder-sla-escalation.png',
    },
    {
      id: 'automation-policy',
      title: 'Every limit on the automation is a setting, not a code change',
      wowFactor:
        'This is the governance surface, and it is the most opinionated screen in the product: how '
        + 'long to wait, when to escalate, whether an unresolved checkpoint auto-rejects, whether a '
        + 'rejected ticket may be reopened, and which channel wins when several reply. The '
        + 'escalation webhook is shown as a field and never as a value — it lives in the vault.',
      whatItShows:
        'The conversation policy with its response and escalation windows, the auto-reject and '
        + 'reopen switches, the multi-channel tie-break rule, the plain-language instruction the '
        + 'agent must follow when asking questions, and the masked escalation webhook.',
      mockDataApproach:
        'Timings and guidance are the shipped defaults; the webhook is rendered masked so no '
        + 'usable value is published.',
      capturePlan:
        'Portfolio runner renders the policy form from the shipped field layout with masked credentials.',
      imageKind: 'source-derived-replica',
      imagePath: './assets/lgbuilder/lgbuilder-automation-policy.png',
    },
    {
      id: 'review-queue',
      title: 'Every pause has a queue, an owner, and an audit trail',
      wowFactor:
        'The chat channel is where people are, but it is a bad system of record. The console keeps '
        + 'the authoritative view: what is waiting, who it is waiting on, how long it has waited, '
        + 'and what was eventually decided — including the decisions nobody made.',
      whatItShows:
        'Pending stop events with their stage and waiting party, one of them already escalated, '
        + 'and a decision history recording approvals, rejections, and the auto-rejections that '
        + 'happened because no decision arrived.',
      mockDataApproach:
        'Tickets, titles, and timings belong to the invented programme.',
      capturePlan:
        'Portfolio runner renders the review queue from the shipped event and history rows with invented events.',
      imageKind: 'source-derived-replica',
      imagePath: './assets/lgbuilder/lgbuilder-review-queue.png',
    },
    {
      id: 'pipeline-view',
      title: 'Ticket to production, and back again when it breaks',
      wowFactor:
        'The loop actually closes. A defect observed in production is not an alert someone triages '
        + 'by hand — it re-enters the same intake as new work, with the link between the '
        + 'production signal and the issue it raised kept visible.',
      whatItShows:
        'Every request in flight with its stage — pending human input, building, in production, '
        + 'complete — and a close-loop panel showing a production defect that was fed back into '
        + 'intake as a new tracked issue.',
      mockDataApproach:
        'Ticket identifiers, issue keys, titles, and durations are invented.',
      capturePlan:
        'Portfolio runner renders the pipeline view from the shipped stage filters and run rows with invented runs.',
      imageKind: 'source-derived-replica',
      imagePath: './assets/lgbuilder/lgbuilder-pipeline-view.png',
    },
  ],
};

export const LGBUILDER_PORTFOLIO_CONFIG = {
  slug: LGBUILDER_APP.slug,
  name: LGBUILDER_APP.name,
  localRepoPath: LOCAL_REPO_PATH,
  outputDirPath: 'web/portfolio/assets/lgbuilder',
  captureToolchain: 'playwright',
  launchStrategy: {
    localRepoPath: LOCAL_REPO_PATH,
    command: 'docker compose up',
    readySignal: 'http://localhost:3000/',
    environmentVariables: {
      LG_BUILDER_DEMO_MODE: 'true',
    },
  },
  demoSetupHooks: [
    {
      id: 'render-source-derived-replicas',
      description:
        'Render the five LG-Builder surfaces from the shipped layout using the invented delivery '
        + 'programme in scripts/portfolio/screens/lgbuilder-demo-data.mjs.',
      mockDataApproach:
        'The reference captures show a real chat workspace and a running console. Every server, '
        + 'channel, colleague, ticket, issue key, and repository URL on the replicas is invented, '
        + 'and the escalation webhook is rendered masked so no usable credential is published.',
      runnerInstruction:
        'Run scripts/portfolio/build-portfolio-assets.mjs so the LG-Builder cards use PNG assets from web/portfolio/assets/lgbuilder.',
    },
  ],
  captureTargets: [
    createCaptureTarget('hitl-checkpoint', CHAT_SCREEN_WIDTH, [
      'Server, channels, people, tickets, and issue keys are invented.',
    ]),
    createCaptureTarget('sla-escalation', CHAT_SCREEN_WIDTH, [
      'Checkpoint identifiers and timings belong to the invented programme.',
    ]),
    createCaptureTarget('automation-policy', CONSOLE_SCREEN_WIDTH, [
      'The escalation webhook is rendered masked — no usable value is published.',
    ]),
    createCaptureTarget('review-queue', CONSOLE_SCREEN_WIDTH, [
      'Stop events and decision history are invented.',
    ]),
    createCaptureTarget('pipeline-view', CONSOLE_SCREEN_WIDTH, [
      'Runs, issue keys, and durations are invented.',
    ]),
  ],
};
