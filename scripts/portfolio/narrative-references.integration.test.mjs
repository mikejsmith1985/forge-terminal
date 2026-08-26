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

import { ENGINEERING_CASE_STUDIES, PORTFOLIO_PROOF_STATS } from './narrative.mjs';

function runGit(gitArguments) {
  return execFileSync('git', gitArguments, { encoding: 'utf8' }).trim();
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
