// The argument the portfolio makes, and the evidence that backs it.
//
// The page has one job: convince a hiring engineer that work directed through
// coding agents can be held to a normal engineering standard. Marketing copy
// cannot do that. What does it is a checkable number and a debugging story
// where the obvious answer was wrong — so this file carries both, and the
// accompanying tests refuse to let either drift away from the repository.

export const PORTFOLIO_THESIS = {
  // Who is speaking, before what they believe. A reader deciding in a few
  // seconds whether to keep reading needs a role and a stack to place the claim
  // against; the page previously opened with a philosophical assertion from an
  // unidentified person, which is the wrong order.
  role: 'AI-native systems engineer',

  stack: ['Go', 'React', 'MCP', 'Playwright', 'WebSockets', 'PTY'],

  headline: 'I direct coding agents, and I built the machinery that refuses their work when the proof is missing.',

  // Two sentences. The long version of this argument was 107 words at the top of
  // the page, ahead of any evidence — which asked the reader to accept the
  // thesis before seeing a single thing that supports it. The detail now lives
  // below the proof, where somebody already interested will still find it.
  statement:
    'The hard problem in agent-assisted engineering is not getting code written — it is proving '
    + 'the code does what it claims before it reaches anyone. Every number below ships with the '
    + 'command that proves it, and every debugging story names the commit that fixed it.',

  // The artefact shown first, chosen because it answers the question a reader
  // actually has — can this person do the work — rather than the question the
  // thesis answers, which is how they know the work is right.
  leadArtifact: {
    appSlug: 'u2-counter',
    featureId: 'mcp-transcript',
    claim: 'I had never heard of Eclipse or a Pick database on Friday afternoon. '
      + 'By Monday morning this was running.',
    detail:
      'An AI answering trade-counter questions against a 1960s MultiValue ERP, through a hardened '
      + 'fork of the U2 MCP server. Every call it made is shown under the answer, and the raw '
      + 'record with its separator bytes is the part a relational database could not have produced.',

    // The claim needs its proof beside it, not five screens below it. Moving
    // the claim to the top without moving its evidence recreated exactly the
    // problem the evidence link was added to solve: the least believable thing
    // on the page, with nothing to click. A reader who doubts "a weekend" does
    // so in the first ten seconds, and by then they have either found the
    // measurements or decided.
    links: [
      {
        label: 'The seven fixes, each measured against the original',
        repoPath: 'u2-mcp/blob/main/evidence/hardening-evidence.md',
      },
      {
        label: 'What it does not show',
        repoPath: 'u2-counter/blob/main/docs/what-it-does-not-show.md',
      },
    ],
  },

  subclaims: [
    {
      title: 'Verification is mechanical, not optional',
      detail:
        'A pre-commit hook reads a ledger of workflow gates and refuses the commit when the '
        + 'branch, the test, or the passing run was never recorded. Being in a hurry is not an '
        + 'input the hook accepts.',
    },
    {
      title: 'Behaviour is proven in a real browser',
      detail:
        'UI claims are settled by driving the running application and reading the terminal\'s own '
        + 'buffer, never by asserting that a function returned. A suite of green unit tests is not '
        + 'evidence that a feature works — one of the case studies below is exactly that failure.',
    },
    {
      title: 'Root cause over symptom',
      detail:
        'Every case study here started with a plausible wrong theory, and in two of them a fix had '
        + 'already shipped against it. Finding the real cause meant explaining a detail the wrong '
        + 'theory could not — usually the one nobody thought was interesting.',
    },
    {
      title: 'Secrets are directed, never handled',
      detail:
        'The agent names where a credential must go; the vault resolves and injects it into the '
        + 'shell. The value never enters a conversation, a file, or a log. The agent is a director, '
        + 'not a courier.',
    },
  ],
};

// Headline numbers. Each carries the command a sceptical reader can run in a
// clone of the repository to check it, which is the only reason to print them.
export const PORTFOLIO_PROOF_STATS = [
  {
    id: 'go-tests',
    value: '896',
    label: 'Go test functions',
    detail: 'Across 153 test files',
    verifyCommand: "git grep -h '^func Test' main -- '*_test.go' | wc -l",
  },
  {
    id: 'browser-specs',
    value: '42',
    label: 'Browser test specs',
    detail: 'Playwright, driving the real app',
    verifyCommand: "git ls-tree -r --name-only main | grep -c '^tests/e2e/.*\\.spec\\.js$'",
  },
  {
    id: 'releases',
    value: '569',
    label: 'Releases shipped',
    detail: 'v1.0.0 through v7.25.1',
    verifyCommand: "git tag | grep -c '^v'",
  },
  {
    id: 'reviewed-changes',
    value: '93',
    label: 'Reviewed changes merged',
    detail: 'Every one via pull request',
    verifyCommand: "git log main --oneline | grep -cE '\\(#[0-9]+\\)'",
  },
  {
    id: 'spec-features',
    value: '15',
    label: 'Features run spec-first',
    detail: 'Specify → plan → tasks → implement',
    verifyCommand: 'ls -d specs/*/ | wc -l',
  },
  {
    id: 'go-lines',
    value: '71,796',
    label: 'Lines of Go',
    detail: 'Plus a React front end',
    verifyCommand: "git ls-tree -r --name-only main | grep '\\.go$' | xargs wc -l | tail -1",
  },
];

// The case studies. Each one is drawn from a real commit whose message contains
// the same reasoning; the reference lets a reader go and read it in full.
export const ENGINEERING_CASE_STUDIES = [
  {
    id: 'green-tests-dead-feature',
    title: 'Every test passed. The feature did not exist.',
    lesson: 'A green suite is evidence about code, not about behaviour.',
    symptom:
      'A new opt-in prompt was finished. The Go unit tests passed, the real-git integration tests '
      + 'passed, and 85 front-end tests passed. By every signal available, the feature was done.',
    assumedCause:
      'Nothing looked wrong, so there was nothing to diagnose — the work was ready to ship.',
    actualCause:
      'The WebSocket handler forwarded exactly two message types to the dashboard, and the new '
      + 'prompt was not one of them. The message was constructed correctly, sent correctly, and '
      + 'silently dropped one layer before the screen. The prompt would never once have appeared '
      + 'in production.',
    whyItMattered:
      'Every test was green because every test checked a layer. Nothing checked the seam between '
      + 'them. This is the exact failure that makes a green suite feel like proof when it is not.',
    proof:
      'The browser test caught it — driving the running app and waiting for a prompt that never '
      + 'arrived. The forwarding allow-list was the one-line fix; the test is why it was found '
      + 'before release rather than by a user.',
    reference: { pullRequestNumber: 202, commitSha: '28a53601' },
  },
  {
    id: 'keyboard-mode-desync',
    title: 'The tab that accepted letters but not numbers',
    lesson: 'The detail everyone dismissed as irrelevant was the whole diagnosis.',
    symptom:
      'After an app update, a restored terminal tab silently ignored digits and arrow keys. '
      + 'Letters typed fine. The tab looked completely normal.',
    assumedCause:
      'A focus bug — a hidden tab stealing keyboard input. Two fixes shipped against that theory. '
      + 'Both corrected genuine defects. Neither fixed this one.',
    actualCause:
      'A keyboard-mode desync. A terminal program sets application keypad and cursor modes once, '
      + 'at startup. Over a long session those bytes aged out of the scrollback journal. On '
      + 'restart the fresh terminal replayed only the scrollback, so it came up in default mode '
      + 'while the program was still in application mode.',
    whyItMattered:
      'That letters worked was the tell, and it ruled the focus theory out entirely. Letters are '
      + 'mode-independent ASCII; digits and arrows are mode-dependent. A broken focus would have '
      + 'swallowed everything. Only a mode mismatch can swallow digits and spare letters.',
    proof:
      'Confirmed against the live broken tab, whose journal contained zero mode-setup sequences. '
      + 'The fix tracks mode changes, persists them beside the session so they survive journal '
      + 'trimming, and re-asserts them ahead of the replay.',
    reference: { pullRequestNumber: 206, commitSha: '3df996e6' },
  },
  {
    id: 'reconnect-kills-reader',
    title: 'Tabs that came back connected, alive, and permanently silent',
    lesson: 'A log with nothing in it is a finding, if you know what should have been there.',
    symptom:
      'A tab reconnected to a still-running shell and looked healthy. It accepted keystrokes and '
      + 'the shell really did run them. It never displayed output again.',
    assumedCause:
      'Reconnect flakiness — a dropped socket or a race that a retry ought to smooth over.',
    actualCause:
      'Detaching deliberately leaves a session live so a reconnecting client can find its '
      + 'scrollback. That made the reconnect match the "live session" branch and join as a passive '
      + 'watcher — and the watcher path stops the previous owner\'s reader while a guard skips '
      + 'starting a replacement. Nobody was reading the shell\'s output. The intended reattach '
      + 'path was unreachable code.',
    whyItMattered:
      'The confirming evidence was an absence: a 9.4-million-line production log containing zero '
      + 'reattach entries and a watcher signature on every single reconnect. The path everyone '
      + 'assumed was running had never run once.',
    proof:
      'A client that finds a detach record now knows no one is reading the terminal, so it '
      + 'reclaims ownership and starts its own reader. Reclaiming is atomic, so two concurrent '
      + 'reconnects can never both own it.',
    reference: { pullRequestNumber: 214, commitSha: '5b0a4971' },
  },
  {
    id: 'zombie-second-instance',
    title: '"The bug you fixed is still happening"',
    lesson: 'When a verified fix does not take, stop debugging the fix and check what is running.',
    symptom:
      'Bugs fixed in the previous release kept occurring: windows stealing focus, calls reaching '
      + 'the wrong place, session state disagreeing with itself.',
    assumedCause:
      'The fixes were wrong or incomplete, and the same defects needed fixing again.',
    actualCause:
      'Two copies of the application were running. A stale instance from an older version had sat '
      + 'beside the current one for weeks, because a second launch quietly fell through its '
      + 'preferred ports instead of refusing to start. Half the traffic was being served by the '
      + 'version that still had the bugs.',
    whyItMattered:
      'The diagnostics that would have shown this had been blank since June: the log writer '
      + 'aborted at a dead output stream and had been silently discarding everything. The missing '
      + 'evidence was itself a second bug, and it was hiding the first.',
    proof:
      'Startup now detects a running instance and either defers to it or takes over deliberately, '
      + 'and the log writer survives a dead stream and rotates. Both causes were fixed together '
      + 'because neither was visible while the other stood.',
    reference: { pullRequestNumber: 210, commitSha: '8404234a' },
  },
  {
    id: 'phantom-cd-injection',
    title: 'Commands nobody typed, and the test that could not miss them',
    lesson: 'Prove the absence of an event by watching the wire, not the screen.',
    symptom:
      'Switching to a background tab revealed a directory-change command nobody had typed. Worse, '
      + 'an agent running in that tab read the injected text as a submitted prompt.',
    assumedCause:
      'Cosmetic replay noise — leftover text being redrawn from the scrollback.',
    actualCause:
      'A directory-restore fallback guarded on a flag that is true only for a socket that dropped '
      + 'and retried. A restart or page reload opens a first-attempt socket, so the guard passed '
      + 'and a real command was typed into a shell already in the right directory. The decision '
      + 'was also made milliseconds before the signal that would have prevented it arrived.',
    whyItMattered:
      'It was not cosmetic at all: the application was sending genuine keystrokes. Measured on the '
      + 'unfixed build, a single page reload injected the command into five hidden tabs at once.',
    proof:
      'The rule moved to one testable decision, re-evaluated at the moment the command would be '
      + 'sent. The browser test spies on every WebSocket frame the page sends across a reload and '
      + 'asserts none is command-shaped — shown failing on the old build and passing on the fix, '
      + 'on the same harness.',
    reference: { pullRequestNumber: 215, commitSha: '2d3d8487' },
  },
];

// Work accepted into a repository the author does not control.
//
// Every other section of the page is graded by the person it is about. This
// one was graded by the maintainers of an open-source project with no stake in
// the argument, in Dart and Python rather than Go, against a codebase first
// opened in August. The same standard travelled with it: each change is a fix
// with a test, small enough to review in a sitting — and the one that did not
// land is listed beside the ones that did, because a page that only shows wins
// is a page a reader stops trusting.
//
// The author's GitHub handle is deliberately absent: the renderer supplies it
// when it builds the verify command, so the published data file stays clean
// for the scanner that treats the handle as a leaked private path.
export const UPSTREAM_CONTRIBUTIONS = {
  repository: 'BasedHardware/omi',
  repositoryDescription:
    'An open-source AI wearable: a Flutter app, a Python backend, and the firmware between them.',

  headline: 'Six changes merged by maintainers with no reason to be generous',

  statement:
    'Every number above was counted by me. These were reviewed by strangers, in a Flutter app and a '
    + 'Python backend rather than the Go on this page, in a codebase I first opened in August. The '
    + 'same standard travelled: each one is a fix with a test, sized to be reviewed in a sitting.',

  // In merge order. `subject` is the pull request title exactly as GitHub holds
  // it and is what the integration test checks; `title` is the same line with
  // its conventional-commit prefix removed, which is what the page shows.
  pullRequests: [
    {
      number: 11293,
      mergedOn: '2026-08-13',
      area: 'Flutter app',
      subject: 'fix(app): keep a progress indicator running for the whole app search',
      title: 'Keep a progress indicator running for the whole app search',
      linesAdded: 169,
      linesRemoved: 68,
      filesChanged: 3,
    },
    {
      number: 11297,
      mergedOn: '2026-08-13',
      area: 'Flutter app',
      subject: 'fix(app): hold the apps search in its searching state until the newest query lands',
      title: 'Hold the apps search in its searching state until the newest query lands',
      linesAdded: 347,
      linesRemoved: 57,
      filesChanged: 2,
    },
    {
      number: 11524,
      mergedOn: '2026-08-17',
      area: 'CI ratchet',
      subject: 'harden(ci): match deepPurple and the Dart hex form in the INV-UI-1 ratchet, and clear the apps pages',
      title: 'Match deepPurple and the Dart hex form in the INV-UI-1 ratchet, and clear the apps pages',
      linesAdded: 126,
      linesRemoved: 56,
      filesChanged: 17,
    },
    {
      number: 12790,
      mergedOn: '2026-09-06',
      area: 'Python backend',
      subject: 'fix(backend): drop marketplace records with no id before the shared catalog reads them',
      title: 'Drop marketplace records with no id before the shared catalog reads them',
      linesAdded: 137,
      linesRemoved: 4,
      filesChanged: 2,
    },
    {
      number: 12807,
      mergedOn: '2026-09-06',
      area: 'Python backend',
      subject: 'fix(backend): drop id-less records from the popular-apps listing too',
      title: 'Drop id-less records from the popular-apps listing too',
      linesAdded: 90,
      linesRemoved: 2,
      filesChanged: 2,
    },
    {
      number: 12864,
      mergedOn: '2026-09-06',
      area: 'Flutter app',
      subject: 'fix(app): re-read device storage after clearing recordings',
      title: 'Re-read device storage after clearing recordings',
      linesAdded: 130,
      linesRemoved: 3,
      filesChanged: 2,
    },
  ],

  // The record is only worth showing if it includes the one that did not land.
  notMerged: [
    {
      number: 11526,
      outcome: 'Closed without merging',
      reason:
        'A 367-line performance change to serve app search from a catalog the browse endpoints '
        + 'already cached. I closed it myself once the same change had landed through a maintainer\'s '
        + 'cleaner seam, with a table on the pull request accounting for every commit as either landed '
        + 'by another route or superseded.',
    },
  ],
};
