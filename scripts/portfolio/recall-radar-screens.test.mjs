// Guards the Recall Radar portfolio screens.
//
// Recall Radar's claim is that nothing it asserts is unquoted, and every quote
// is checked character for character against the record it names. A replica
// of that product has to hold itself to the same rule: a highlighted span that
// did not come from the body it sits in, or a fused score that does not follow
// from the ranks beside it, would be a picture of the guarantee rather than an
// instance of it. So these tests derive the same things the product derives,
// and refuse a screen where the picture and the arithmetic disagree.
//
// The one thing on these screens that is not invented is the evaluation table.
// Those six rows are the measured run the repository commits, and when that
// repository is present on this machine the figures are checked against it.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { RECALL_RADAR_SCREEN_BUILDERS } from './screens/recall-radar-screens.mjs';
import {
  DEMO_ANSWER,
  DEMO_EVALUATION,
  DEMO_RECORDS,
  DEMO_SEARCH,
  RECIPROCAL_RANK_FUSION_CONSTANT,
  buildSearchHits,
  buildVerifiedCitations,
} from './screens/recall-radar-demo-data.mjs';

const REQUIRED_SCREEN_FEATURE_IDS = [
  'grounded-answer',
  'verified-quote',
  'explained-search',
  'retrieval-evaluation',
];

// Anything that would identify the maintainer or a real machine. The product
// reads public data, so there is no customer to protect, but a local path or a
// handle in a published image is still a leak.
const FORBIDDEN_PRIVATE_STRINGS = [
  'Michael Smith',
  'Michael_Smith',
  'mikejsmith1985',
  'mikej',
  'ProjectsWin',
  'ANTHROPIC_API_KEY',
  'VOYAGE_API_KEY',
  'RECALLRADAR_CONNECTION',
  'localhost:5433',
];

// What each replica has to actually contain to be the surface it claims. These
// are the labels a reader recognises from the running product, not decoration.
const SCREEN_FIDELITY_MARKERS = {
  'grounded-answer': ['Grounded', 'Known pattern', 'citation', 'Related recalls and investigations'],
  'verified-quote': ['<mark', 'Grounded', 'complaint'],
  'explained-search': ['Meaning rank', 'Keyword rank', 'Fused score', 'Combined'],
  'retrieval-evaluation': ['Recall@5', 'Recall@10', 'MRR', 'Every record', 'Recalls and investigations only'],
};

// Where the measured run lives when the product's repository is checked out
// beside this one. Absent on a machine without it, and the check is skipped.
const MEASURED_RESULTS_PATH = 'C:\\ProjectsWin\\recall-radar\\eval\\results.json';

function renderEveryScreen() {
  return REQUIRED_SCREEN_FEATURE_IDS.map((featureId) => ({
    featureId,
    markup: RECALL_RADAR_SCREEN_BUILDERS[featureId](),
  }));
}

test('every promised Recall Radar feature resolves to a screen builder', () => {
  for (const featureId of REQUIRED_SCREEN_FEATURE_IDS) {
    assert.equal(
      typeof RECALL_RADAR_SCREEN_BUILDERS[featureId],
      'function',
      `${featureId} must have a screen builder.`,
    );
  }
});

test('every screen renders a complete standalone HTML document', () => {
  for (const { featureId, markup } of renderEveryScreen()) {
    assert.match(markup, /^<!doctype html>/i, `${featureId} must render a full document.`);
    assert.match(markup, /<\/html>\s*$/i, `${featureId} must close its document.`);
    assert.ok(markup.length > 2000, `${featureId} looks too sparse to be a product screen.`);
  }
});

test('no screen carries a real person, machine, or secret name', () => {
  for (const { featureId, markup } of renderEveryScreen()) {
    for (const forbiddenString of FORBIDDEN_PRIVATE_STRINGS) {
      assert.doesNotMatch(
        markup,
        new RegExp(forbiddenString, 'i'),
        `${featureId} leaks the private string "${forbiddenString}".`,
      );
    }
  }
});

test('each screen reproduces the shipped Recall Radar surface it claims to show', () => {
  for (const { featureId, markup } of renderEveryScreen()) {
    for (const fidelityMarker of SCREEN_FIDELITY_MARKERS[featureId]) {
      assert.ok(
        markup.includes(fidelityMarker),
        `${featureId} is missing the "${fidelityMarker}" surface.`,
      );
    }
  }
});

// ── The grounding rule, applied to the replica ──────────────────────────────

test('every surviving citation is a literal substring of the record it names', () => {
  // This is the product's own rule. A citation whose quote is not in its record
  // would be dropped by the verifier, so it cannot appear as a surviving one.
  for (const citation of buildVerifiedCitations()) {
    const record = DEMO_RECORDS.find((candidate) => candidate.externalId === citation.externalId);

    assert.ok(record, `citation ${citation.externalId} names a record the demo does not hold.`);
    assert.equal(
      record.body.slice(citation.startOffset, citation.endOffset),
      citation.quote,
      `citation ${citation.externalId} is highlighted at offsets that do not spell its quote.`,
    );
  }
});

test('the dropped-citation count is shown even though it could have been hidden', () => {
  // The product shows the count when it is zero and when it is not, so a
  // silent drop is impossible. The replica keeps one drop in the picture on
  // purpose: a screen where every citation survived would hide the mechanism.
  const answerMarkup = RECALL_RADAR_SCREEN_BUILDERS['grounded-answer']();

  assert.ok(DEMO_ANSWER.droppedCitationCount >= 1, 'the demo answer must drop at least one citation.');
  assert.ok(
    answerMarkup.includes(`${DEMO_ANSWER.droppedCitationCount} citation`),
    'the grounded-answer screen must state how many citations were dropped.',
  );
});

test('the opened record highlights exactly the quoted span and nothing else', () => {
  const quoteMarkup = RECALL_RADAR_SCREEN_BUILDERS['verified-quote']();
  const highlightMatches = [...quoteMarkup.matchAll(/<mark[^>]*>([\s\S]*?)<\/mark>/g)];

  assert.equal(highlightMatches.length, 1, 'exactly one span is highlighted on the opened record.');

  const openedCitation = buildVerifiedCitations()
    .find((citation) => citation.externalId === DEMO_ANSWER.openedCitationExternalId);
  assert.ok(openedCitation, 'the opened citation must be one of the surviving citations.');
  assert.equal(highlightMatches[0][1], openedCitation.quote);
});

test('uncited campaign matches are labelled as unverified rather than borrowing credibility', () => {
  const answerMarkup = RECALL_RADAR_SCREEN_BUILDERS['grounded-answer']();

  assert.ok(DEMO_ANSWER.uncitedMatches.length >= 1, 'the demo answer must carry an uncited match.');
  assert.ok(answerMarkup.includes('Also matched, not quoted'));
  assert.ok(answerMarkup.includes('none of it has been verified'));
});

// ── The ranking arithmetic, applied to the replica ──────────────────────────

test('every fused score follows from the ranks shown beside it', () => {
  // Reciprocal rank fusion is the product's arithmetic: 1 / (k + rank) summed
  // over the methods that surfaced the record. A score typed by hand beside
  // ranks it does not follow from would be exactly the kind of plausible wrong
  // screen this product exists to prevent.
  for (const searchHit of buildSearchHits()) {
    const expectedScore = [searchHit.denseRank, searchHit.sparseRank]
      .filter((rank) => rank !== null)
      .reduce((runningTotal, rank) => runningTotal + 1 / (RECIPROCAL_RANK_FUSION_CONSTANT + rank), 0);

    assert.ok(
      Math.abs(searchHit.fusedScore - expectedScore) < 1e-9,
      `${searchHit.externalId} shows a fused score its ranks do not produce.`,
    );
  }
});

test('search results are listed in fused-score order', () => {
  const searchHits = buildSearchHits();

  for (let i = 1; i < searchHits.length; i += 1) {
    assert.ok(
      searchHits[i - 1].fusedScore >= searchHits[i].fusedScore,
      `${searchHits[i].externalId} outranks a record with a higher fused score.`,
    );
  }
});

test('at least one result was found by only one method, so the absent badge is shown', () => {
  const searchHits = buildSearchHits();
  const hasSingleMethodHit = searchHits.some(
    (searchHit) => searchHit.denseRank === null || searchHit.sparseRank === null,
  );

  assert.ok(hasSingleMethodHit, 'the search screen must show a record one method missed.');
  assert.ok(RECALL_RADAR_SCREEN_BUILDERS['explained-search']().includes('not in top results'));
  assert.equal(DEMO_SEARCH.mode, 'hybrid');
});

// ── The evaluation numbers are the measured ones ────────────────────────────

test('the evaluation screen shows the unflattering pool as well as the good one', () => {
  const evaluationMarkup = RECALL_RADAR_SCREEN_BUILDERS['retrieval-evaluation']();

  // The all-records pool scoring zero for meaning search is the honest result
  // the README explains; a replica that quietly showed only the second pool
  // would be the overclaim the product's own write-up refuses to make.
  assert.ok(evaluationMarkup.includes('0.000'), 'the zero scores must stay in the picture.');
  assert.ok(evaluationMarkup.includes('0.400'), 'the campaign-pool recall must be in the picture.');
  assert.equal(DEMO_EVALUATION.caseCount, 80);
});

test('the evaluation figures match the measured run when its repository is present', {
  skip: !fs.existsSync(MEASURED_RESULTS_PATH) && 'the Recall Radar repository is not checked out here',
}, () => {
  const measuredRun = JSON.parse(fs.readFileSync(MEASURED_RESULTS_PATH, 'utf8'));

  assert.equal(measuredRun.caseCount, DEMO_EVALUATION.caseCount);

  for (const measuredMode of measuredRun.modes) {
    const shownMetrics = DEMO_EVALUATION.metrics[measuredMode.key];

    assert.ok(shownMetrics, `the evaluation screen omits the measured ${measuredMode.key} row.`);
    assert.equal(shownMetrics.recallAt5, measuredMode.metrics.recallAt5, `${measuredMode.key} recall@5 drifted.`);
    assert.equal(shownMetrics.recallAt10, measuredMode.metrics.recallAt10, `${measuredMode.key} recall@10 drifted.`);
    assert.ok(
      Math.abs(shownMetrics.mrr - measuredMode.metrics.meanReciprocalRank) < 1e-9,
      `${measuredMode.key} MRR drifted.`,
    );
  }
});
