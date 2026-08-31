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
  return JSON.stringify({ PORTFOLIO_THESIS, PORTFOLIO_PROOF_STATS, ENGINEERING_CASE_STUDIES });
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

test('the narrative leaks no private paths', () => {
  const narrativeText = collectNarrativeText();

  for (const forbiddenString of FORBIDDEN_PRIVATE_STRINGS) {
    assert.ok(
      !narrativeText.includes(forbiddenString),
      `the narrative leaks the private string "${forbiddenString}".`,
    );
  }
});
