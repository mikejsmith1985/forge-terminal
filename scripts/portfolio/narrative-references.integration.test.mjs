// Verifies that every claim the portfolio makes points at something real.
//
// This runs against the actual repository rather than a mock, because that is
// the whole point: a reader who does not trust the page can run these same
// commands. If a case study ever cites a commit that does not exist, or a
// headline number stops matching what the repository actually contains, this
// test fails before the page can go out.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

import {
  ENGINEERING_CASE_STUDIES,
  PORTFOLIO_PROOF_STATS,
  UPSTREAM_CONTRIBUTIONS,
} from './narrative.mjs';

// The GitHub account the upstream work was submitted from. It lives here and
// in the renderer, never in the published data, which is scanned for it.
const UPSTREAM_AUTHOR_HANDLE = 'mikejsmith1985';

const GITHUB_PULL_REQUEST_FIELDS = 'state,mergedAt,title,additions,deletions,changedFiles,author';

function runGit(gitArguments) {
  return execFileSync('git', gitArguments, { encoding: 'utf8' }).trim();
}

/** Reads one pull request from GitHub, as the page's reader would. */
function readUpstreamPullRequest(pullRequestNumber) {
  const pullRequestJson = execFileSync('gh', [
    'pr', 'view', String(pullRequestNumber),
    '--repo', UPSTREAM_CONTRIBUTIONS.repository,
    '--json', GITHUB_PULL_REQUEST_FIELDS,
  ], { encoding: 'utf8' });

  return JSON.parse(pullRequestJson);
}

test('every cited commit exists in this repository', () => {
  for (const caseStudy of ENGINEERING_CASE_STUDIES) {
    const objectType = runGit(['cat-file', '-t', caseStudy.reference.commitSha]);
    assert.equal(
      objectType,
      'commit',
      `case study "${caseStudy.id}" cites ${caseStudy.reference.commitSha}, which is not a commit.`,
    );
  }
});

test('every cited commit really is the pull request the case study names', () => {
  for (const caseStudy of ENGINEERING_CASE_STUDIES) {
    const commitSubject = runGit([
      'log', '-1', '--format=%s', caseStudy.reference.commitSha,
    ]);

    assert.ok(
      commitSubject.includes(`#${caseStudy.reference.pullRequestNumber}`),
      `case study "${caseStudy.id}" cites PR #${caseStudy.reference.pullRequestNumber}, `
        + `but that commit's subject is "${commitSubject}".`,
    );
  }
});

test('the advertised test counts are not smaller than what the repository holds', () => {
  // Counting on main keeps the number stable regardless of which branch the
  // build runs from. The assertion is one-sided on purpose: writing more tests
  // must never break the build, but overstating the number must.
  const goTestFunctionCount = runGit(['grep', '-h', '^func Test', 'main', '--', '*_test.go'])
    .split('\n')
    .filter(Boolean)
    .length;

  const advertisedGoTests = PORTFOLIO_PROOF_STATS.find(
    (proofStat) => proofStat.id === 'go-tests',
  );

  assert.ok(advertisedGoTests, 'the portfolio must advertise its Go test count.');
  assert.ok(
    goTestFunctionCount >= Number(advertisedGoTests.value.replace(/\D/g, '')),
    `the page claims ${advertisedGoTests.value} Go tests but the repository holds ${goTestFunctionCount}.`,
  );
});

test('the advertised browser-test count is not smaller than what the repository holds', () => {
  const browserSpecCount = runGit(['ls-tree', '-r', '--name-only', 'main'])
    .split('\n')
    .filter((filePath) => /^tests\/e2e\/.*\.spec\.js$/.test(filePath))
    .length;

  const advertisedBrowserSpecs = PORTFOLIO_PROOF_STATS.find(
    (proofStat) => proofStat.id === 'browser-specs',
  );

  assert.ok(advertisedBrowserSpecs, 'the portfolio must advertise its browser-test count.');
  assert.ok(
    browserSpecCount >= Number(advertisedBrowserSpecs.value.replace(/\D/g, '')),
    `the page claims ${advertisedBrowserSpecs.value} browser specs but the repository holds ${browserSpecCount}.`,
  );
});

// ── Upstream contributions ───────────────────────────────────────────────────
// These run against GitHub itself, because the claim is about a repository
// this one does not contain. A reader can run the same `gh pr view`.

test('every upstream contribution is merged on GitHub, by the portfolio author, at the stated size', () => {
  for (const pullRequest of UPSTREAM_CONTRIBUTIONS.pullRequests) {
    const githubPullRequest = readUpstreamPullRequest(pullRequest.number);
    const label = `upstream #${pullRequest.number}`;

    assert.equal(githubPullRequest.state, 'MERGED', `${label} is not merged.`);
    assert.equal(githubPullRequest.author.login, UPSTREAM_AUTHOR_HANDLE, `${label} is someone else's work.`);
    assert.ok(
      githubPullRequest.mergedAt.startsWith(pullRequest.mergedOn),
      `${label} merged ${githubPullRequest.mergedAt}, not ${pullRequest.mergedOn}.`,
    );
    assert.equal(githubPullRequest.title, pullRequest.subject, `${label} has a different subject on GitHub.`);
    assert.equal(githubPullRequest.additions, pullRequest.linesAdded, `${label} overstates lines added.`);
    assert.equal(githubPullRequest.deletions, pullRequest.linesRemoved, `${label} misstates lines removed.`);
    assert.equal(githubPullRequest.changedFiles, pullRequest.filesChanged, `${label} misstates files changed.`);
  }
});

test('every admitted non-merge really did not merge', () => {
  for (const unmergedPullRequest of UPSTREAM_CONTRIBUTIONS.notMerged) {
    const githubPullRequest = readUpstreamPullRequest(unmergedPullRequest.number);

    assert.equal(githubPullRequest.author.login, UPSTREAM_AUTHOR_HANDLE);
    assert.notEqual(githubPullRequest.state, 'MERGED', `#${unmergedPullRequest.number} did merge after all.`);
    assert.equal(githubPullRequest.mergedAt, null);
  }
});
