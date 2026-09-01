// App-specific portfolio display and capture definitions for U2 Counter.
//
// This entry is unusual on the page in that its headline is a claim about
// elapsed time rather than about the software, and the claim is only worth
// making because everything under it is checkable: the fork's defects are each
// pinned to a test that fails upstream, and the limits are written down in the
// repository rather than left for a reader to discover.

const LOCAL_REPO_PATH = 'C:\\ProjectsWin\\counter';

// Wide enough for the branch table and the record panel side by side, because
// this is a workstation application — it is used standing at a trade counter.
const COUNTER_VIEWPORT_WIDTH = 1600;
const COUNTER_VIEWPORT_HEIGHT = 1000;
const TOUR_VIEWPORT_HEIGHT = 800;

export const U2_COUNTER_APP = {
  slug: 'u2-counter',
  name: 'U2 Counter',
  tagline:
    'An AI answering trade-counter questions against an ERP on a 1960s Pick database, '
    + 'through a hardened MCP server.',
  // The headline is the framing the page leads this entry with. It is separated
  // from the summary because it is the one line a reader will remember, and a
  // sentence that survives being read on its own should not be buried in a
  // paragraph.
  headline:
    'I had never heard of Eclipse or a Pick database on Friday afternoon. '
    + 'By Monday morning this was running.',
  summary:
    'A working prototype that lets an AI answer counter questions against an ERP system running '
    + 'on a Pick database, via the U2 MCP server. Pick — MultiValue — is a database paradigm from '
    + 'the 1960s that still runs enterprise ERP systems today, and it does not behave like a '
    + 'relational store: a record is not a row, and fields run in parallel, so position three of '
    + 'one field belongs with position three of the next. Built in .NET, deployed to an Azure '
    + 'container that scales to zero when idle, and running entirely on synthetic data.',
  accent: '#b45309',
  category: 'AI over legacy ERP',
  launchSurface: './scripts/run-dev-clean.ps1',
  techStack: ['C# / .NET', 'MCP', 'Azure', 'Pick / UniVerse (MultiValue)'],
  // The four claims the entry rests on, kept short enough to be read standing
  // up. Each is either falsifiable from the repository or an admission.
  keyPoints: [
    'The U2 MCP server is open source but was not adoptable as it stood — it had open '
    + 'vulnerabilities. I forked it, worked through the known issues, found several more, '
    + 'and fixed them.',
    'Each fix is backed by a regression test that fails on the original branch and passes on '
    + 'mine. A script checks out the upstream commit, runs the same tests against both, and '
    + 'keeps the raw output of each run.',
    'It has never been validated against a live UniVerse instance. I wrote up what this '
    + 'prototype does not prove, and what would be required before anyone called it '
    + 'production-ready.',
    'Built in one weekend, from a vague requirement.',
  ],
  // Two links, and deliberately not a third: the deployment is live but is not
  // published here, because a container that scales to zero takes twenty seconds
  // to answer and a cold link reads as a broken one.
  links: [
    // The evidence link leads, because the claim it supports is the one a
    // reader is most entitled to doubt. "Built it in a weekend" is what every
    // junior says; a table showing each fix failing on the upstream commit and
    // passing on the fork, with the raw output of both runs, is not. Without
    // this link the strongest claim on the page was the only one with no
    // one-click proof, while weaker claims shipped shell commands.
    {
      label: 'The seven fixes, measured against the original',
      repoPath: 'u2-mcp/blob/main/evidence/hardening-evidence.md',
    },
    {
      label: 'Source — u2-counter',
      repoPath: 'u2-counter',
    },
    {
      label: 'What it does not show',
      repoPath: 'u2-counter/blob/main/docs/what-it-does-not-show.md',
    },
  ],
  proofNote:
    'These screens are source-derived replicas of the shipped interface. The product already '
    + 'runs on a synthetic store, and every part, branch, customer and figure below was invented '
    + 'again for publication — no screen here was captured from a running system, and none of it '
    + 'belongs to a real business.',
  features: [
    {
      id: 'guided-tour',
      title: 'A tour that drives the product rather than describing it',
      wowFactor:
        'The reader arriving here knows neither MultiValue nor MCP, and the interface does not '
        + 'announce itself. The tour spotlights the real control and puts the application into '
        + 'the state each step needs, so the thing is watched happening rather than claimed.',
      whatItShows:
        'The overlay dimming the page and cutting a hole around the branch table, on the step '
        + 'that explains free-to-sell — on hand minus what orders already hold, which is the '
        + 'distinction the whole product exists to protect.',
      mockDataApproach:
        'The tour copy is the shipped wording; the part, branches and customer beneath it are '
        + 'invented for publication.',
      capturePlan:
        'Render the tour replica at the free-to-sell step with the spotlight over the branch '
        + 'grid, and trim the capture to the content height.',
      imageKind: 'source-derived-replica',
      imagePath: './assets/u2-counter/u2-counter-guided-tour.png',
    },
    {
      id: 'availability-answer',
      title: 'The one figure a representative is allowed to quote',
      wowFactor:
        'A branch with forty on the shelf and thirty-nine promised has one to sell. Showing the '
        + 'forty is how a customer gets let down, so on hand, committed and free to sell are '
        + 'three separate columns and the third is the only one the eye lands on.',
      whatItShows:
        'The branch table answering a counter question for one part and one customer, with the '
        + 'stored MultiValue record open beneath it — the bytes on the left, the parallel fields '
        + 'parsed out on the right.',
      mockDataApproach:
        'Every part number, branch, customer and quantity is invented. The parsed table is '
        + 'derived from the same invented record the bytes panel prints, so the two cannot '
        + 'disagree in the published image.',
      capturePlan:
        'Render the branch grid and record panel together at desktop width and trim to content.',
      imageKind: 'source-derived-replica',
      imagePath: './assets/u2-counter/u2-counter-availability-answer.png',
    },
    {
      id: 'mcp-transcript',
      title: 'The answer, and every call underneath it',
      wowFactor:
        'A sentence saying "299 free to sell" is worth no more than the reader\'s willingness to '
        + 'believe it. Under each answer is every call the model made — tool, file, key and '
        + 'timing — and the raw record with its separators marked, which is the part a relational '
        + 'database could not have produced.',
      whatItShows:
        'A question asked in plain words, the answer with its qualifier, the four MCP calls that '
        + 'produced it, and the note that of the eight tools the server offers, none of them '
        + 'writes.',
      mockDataApproach:
        'The question, answer and call transcript are invented alongside the record they read, '
        + 'and the attribute and value marks are the real separator characters rather than '
        + 'punctuation standing in for them.',
      capturePlan:
        'Render the assistant panel above the record panel at desktop width and trim to content.',
      imageKind: 'source-derived-replica',
      imagePath: './assets/u2-counter/u2-counter-mcp-transcript.png',
    },
  ],
};

export const U2_COUNTER_PORTFOLIO_CONFIG = {
  slug: U2_COUNTER_APP.slug,
  name: U2_COUNTER_APP.name,
  localRepoPath: LOCAL_REPO_PATH,
  outputDirPath: 'web/portfolio/assets/u2-counter',
  captureToolchain: 'playwright',
  launchStrategy: {
    localRepoPath: LOCAL_REPO_PATH,
    command: './scripts/run-dev-clean.ps1',
    readySignal: 'http://127.0.0.1:5173',
    environmentVariables: {},
  },
  demoSetupHooks: [
    {
      id: 'seed-invented-counter-session',
      description:
        'Populate the replica with an invented part, customer and branch set rather than reading '
        + 'the demonstration store, so the published image depends on nothing that can change.',
      mockDataApproach:
        'All values come from the portfolio demo-data module; no seeded store is read.',
      runnerInstruction:
        'Render the screen builders directly — they are self-contained documents and need no '
        + 'running server.',
    },
    {
      id: 'keep-the-governance-strip-visible',
      description:
        'Leave the demonstration-data badges on every screen, because a MultiValue record with '
        + 'no badge on it is an image anyone could present in good faith as production data.',
      mockDataApproach:
        'The badges are the shipped wording and make the synthetic origin part of the picture.',
      runnerInstruction:
        'Do not crop below the governance strip when trimming the capture to content height.',
    },
  ],
  captureTargets: [
    {
      featureId: 'guided-tour',
      outputFileName: 'u2-counter-guided-tour.png',
      viewportWidth: COUNTER_VIEWPORT_WIDTH,
      viewportHeight: TOUR_VIEWPORT_HEIGHT,
    },
    {
      featureId: 'availability-answer',
      outputFileName: 'u2-counter-availability-answer.png',
      viewportWidth: COUNTER_VIEWPORT_WIDTH,
      viewportHeight: COUNTER_VIEWPORT_HEIGHT,
    },
    {
      featureId: 'mcp-transcript',
      outputFileName: 'u2-counter-mcp-transcript.png',
      viewportWidth: COUNTER_VIEWPORT_WIDTH,
      viewportHeight: COUNTER_VIEWPORT_HEIGHT,
    },
  ],
};
