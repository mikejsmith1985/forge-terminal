// Guards the portfolio's argument: the thesis, the headline numbers, and the
// engineering case studies that carry it.
//
// The portfolio makes a specific claim — that agent-directed work can be held
// to a normal engineering standard. A claim like that is only worth anything if
// a reader can check it, so every number carries the command that proves it and
// every case study names the change that fixed it. These tests keep that
// promise structural rather than aspirational.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ENGINEERING_CASE_STUDIES,
  PORTFOLIO_PROOF_STATS,
  PORTFOLIO_THESIS,
  UPSTREAM_CONTRIBUTIONS,
} from './narrative.mjs';

// A case study is only useful if it shows the reasoning, not just the outcome.
const REQUIRED_CASE_STUDY_FIELDS = [
  'id',
  'title',
  'symptom',
  'assumedCause',
  'actualCause',
  'whyItMattered',
  'proof',
];

// Paths and identifiers that belong to the maintainer's machine, not the public.
const FORBIDDEN_PRIVATE_STRINGS = ['C:\\Users\\mikej', 'mikej\\', 'ProjectsWin'];

function collectNarrativeText() {
  return JSON.stringify({
    PORTFOLIO_THESIS, PORTFOLIO_PROOF_STATS, ENGINEERING_CASE_STUDIES, UPSTREAM_CONTRIBUTIONS,
  });
}

// An upstream entry is a claim about someone else's repository, so it carries
// enough to be checked there: the number, the day, the exact subject, and the
// diff size GitHub reports.
const REQUIRED_UPSTREAM_PULL_REQUEST_FIELDS = [
  'number',
  'mergedOn',
  'subject',
  'title',
  'area',
  'linesAdded',
  'linesRemoved',
  'filesChanged',
];

// The three parts of the upstream codebase the changes landed in. Anything
// else is a typo, not a new area.
const PERMITTED_UPSTREAM_AREAS = ['Flutter app', 'Python backend', 'CI ratchet'];

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// A conventional-commit subject such as "fix(app): keep the spinner running"
// reads on the page as "Keep the spinner running".
function deriveReadableTitle(pullRequestSubject) {
  const withoutTypePrefix = pullRequestSubject.replace(/^[a-z]+(\([a-z-]+\))?:\s+/, '');
  return withoutTypePrefix.charAt(0).toUpperCase() + withoutTypePrefix.slice(1);
}

test('the thesis states a claim rather than an apology', () => {
  assert.ok(PORTFOLIO_THESIS.headline.length > 0);
  assert.ok(PORTFOLIO_THESIS.statement.length > 80, 'The thesis must actually argue something.');
  assert.ok(PORTFOLIO_THESIS.subclaims.length >= 3, 'The thesis needs supporting pillars.');

  // Hedging language reads as a concession and undercuts the whole page.
  const apologeticPattern = /\b(even though|despite only|just an?|merely|i admit|unfortunately)\b/i;
  assert.doesNotMatch(PORTFOLIO_THESIS.statement, apologeticPattern);
});

test('every headline number ships with the command that proves it', () => {
  assert.ok(PORTFOLIO_PROOF_STATS.length >= 4);

  for (const proofStat of PORTFOLIO_PROOF_STATS) {
    assert.ok(proofStat.value, 'a stat must have a value');
    assert.ok(proofStat.label, `${proofStat.value} must have a label`);
    assert.ok(
      proofStat.verifyCommand && proofStat.verifyCommand.length > 0,
      `${proofStat.label} must ship the command a reader can run to check it.`,
    );
  }
});

test('every case study shows the reasoning, not just the outcome', () => {
  assert.ok(ENGINEERING_CASE_STUDIES.length >= 4);

  for (const caseStudy of ENGINEERING_CASE_STUDIES) {
    for (const requiredField of REQUIRED_CASE_STUDY_FIELDS) {
      assert.ok(
        caseStudy[requiredField] && String(caseStudy[requiredField]).length > 0,
        `case study "${caseStudy.id}" is missing ${requiredField}.`,
      );
    }

    // The wrong theory is the most valuable part; a case study without one is
    // just a changelog entry.
    assert.notEqual(
      caseStudy.assumedCause,
      caseStudy.actualCause,
      `case study "${caseStudy.id}" has no wrong theory to correct.`,
    );
  }
});

test('every case study points at a change a reader can go and read', () => {
  for (const caseStudy of ENGINEERING_CASE_STUDIES) {
    assert.ok(caseStudy.reference, `${caseStudy.id} must cite a change.`);
    assert.match(
      caseStudy.reference.commitSha,
      /^[0-9a-f]{8,40}$/,
      `${caseStudy.id} must cite a real commit sha.`,
    );
    assert.ok(
      Number.isInteger(caseStudy.reference.pullRequestNumber),
      `${caseStudy.id} must cite a pull request number.`,
    );
  }
});

test('case study ids are unique', () => {
  const caseStudyIdSet = new Set(ENGINEERING_CASE_STUDIES.map((caseStudy) => caseStudy.id));
  assert.equal(caseStudyIdSet.size, ENGINEERING_CASE_STUDIES.length);
});

// ── Upstream contributions ───────────────────────────────────────────────────
//
// Everything else on the page is graded by its author. This section is graded
// by maintainers of a repository the author does not control, which makes it
// the one kind of evidence the reader does not have to take on trust — so the
// data has to be checkable to the pull request, and honest about what did not
// land.

test('the upstream section names the repository and makes a claim about it', () => {
  assert.match(UPSTREAM_CONTRIBUTIONS.repository, /^[\w.-]+\/[\w.-]+$/, 'owner/name form.');
  assert.ok(UPSTREAM_CONTRIBUTIONS.repositoryDescription.length > 0);
  assert.ok(UPSTREAM_CONTRIBUTIONS.headline.length > 0);
  assert.ok(UPSTREAM_CONTRIBUTIONS.statement.length > 80, 'the section must argue something.');
});

test('every upstream contribution is a merged pull request a reader can open', () => {
  assert.ok(UPSTREAM_CONTRIBUTIONS.pullRequests.length >= 6);

  for (const pullRequest of UPSTREAM_CONTRIBUTIONS.pullRequests) {
    for (const requiredField of REQUIRED_UPSTREAM_PULL_REQUEST_FIELDS) {
      assert.ok(
        pullRequest[requiredField] !== undefined && String(pullRequest[requiredField]).length > 0,
        `upstream #${pullRequest.number} is missing ${requiredField}.`,
      );
    }

    assert.ok(Number.isInteger(pullRequest.number) && pullRequest.number > 0);
    assert.match(pullRequest.mergedOn, ISO_DATE_PATTERN, `#${pullRequest.number} needs a calendar day.`);
    assert.ok(
      PERMITTED_UPSTREAM_AREAS.includes(pullRequest.area),
      `#${pullRequest.number} names an unknown area "${pullRequest.area}".`,
    );
    assert.ok(Number.isInteger(pullRequest.linesAdded) && pullRequest.linesAdded > 0);
    assert.ok(Number.isInteger(pullRequest.linesRemoved) && pullRequest.linesRemoved >= 0);
    assert.ok(Number.isInteger(pullRequest.filesChanged) && pullRequest.filesChanged > 0);
  }
});

test('an upstream title is its pull request subject with the type prefix removed', () => {
  // The subject is what GitHub verifies; the title is what the page shows.
  // Deriving one from the other means the display copy cannot drift from the
  // record without this test noticing.
  for (const pullRequest of UPSTREAM_CONTRIBUTIONS.pullRequests) {
    assert.equal(
      pullRequest.title,
      deriveReadableTitle(pullRequest.subject),
      `#${pullRequest.number} shows a title that is not its subject.`,
    );
  }
});

test('upstream pull request numbers are unique and merged in date order', () => {
  const pullRequestNumbers = UPSTREAM_CONTRIBUTIONS.pullRequests.map((pullRequest) => pullRequest.number);
  assert.equal(new Set(pullRequestNumbers).size, pullRequestNumbers.length);

  const mergedDays = UPSTREAM_CONTRIBUTIONS.pullRequests.map((pullRequest) => pullRequest.mergedOn);
  assert.deepEqual(mergedDays, [...mergedDays].sort(), 'the list reads as a timeline.');
});

test('the upstream section admits what did not land', () => {
  // A page that lists only wins is a page a reader stops trusting. The one
  // closed pull request is part of the record, and it must not also appear in
  // the merged list.
  assert.ok(UPSTREAM_CONTRIBUTIONS.notMerged.length >= 1);

  const mergedNumbers = new Set(UPSTREAM_CONTRIBUTIONS.pullRequests.map((pullRequest) => pullRequest.number));
  for (const unmergedPullRequest of UPSTREAM_CONTRIBUTIONS.notMerged) {
    assert.ok(Number.isInteger(unmergedPullRequest.number));
    assert.ok(unmergedPullRequest.outcome.length > 0);
    assert.ok(unmergedPullRequest.reason.length > 0, `#${unmergedPullRequest.number} needs a reason.`);
    assert.ok(!mergedNumbers.has(unmergedPullRequest.number), 'a closed PR cannot also be merged.');
  }
});

test('the upstream data carries no author handle and no absolute URL', () => {
  // The handle is a rendering constant, never a value in published data, so
  // the leak scanner can keep treating its presence there as a private path.
  const upstreamText = JSON.stringify(UPSTREAM_CONTRIBUTIONS);
  assert.doesNotMatch(upstreamText, /mikej/i);
  assert.doesNotMatch(upstreamText, /https?:\/\//);
});

test('the narrative leaks no private paths', () => {
  const narrativeText = collectNarrativeText();

  for (const forbiddenString of FORBIDDEN_PRIVATE_STRINGS) {
    assert.ok(
      !narrativeText.includes(forbiddenString),
      `the narrative leaks the private string "${forbiddenString}".`,
    );
  }
});
