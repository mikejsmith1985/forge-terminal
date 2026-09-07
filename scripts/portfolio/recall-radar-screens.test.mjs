// Guards the Recall Radar portfolio screens.
//
// These screens show a real session captured from the running product, on
// public NHTSA records, and the product's claim about that session is that
// nothing in it is unquoted and every quote was checked character for
// character against the record it names. A replica of that product has to be
// held to the same rule, so these tests re-run the product's own checks on the
// captured data: every citation's offsets must spell its quote inside its
// record, and every fused score must follow from the ranks beside it. A screen
// where the picture and the arithmetic disagree is refused.
//
// The evaluation table is the measured run the product's repository commits,
// and when that repository is present on this machine the figures are checked
// against it.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { RECALL_RADAR_SCREEN_BUILDERS } from './screens/recall-radar-screens.mjs';
import {
  DEMO_ANSWER,
  DEMO_CITATIONS,
  DEMO_EVALUATION,
  DEMO_RECORDS,
  DEMO_SEARCH,
  RECIPROCAL_RANK_FUSION_CONSTANT,
} from './screens/recall-radar-demo-data.mjs';

const REQUIRED_SCREEN_FEATURE_IDS = [
  'grounded-answer',
  'verified-quote',
  'explained-search',
  'retrieval-evaluation',
];

// Anything that would identify the maintainer or a real machine. The records
// are public, so there is no customer to protect, but a local path, a handle
// or a secret name in a published image is still a leak.
const FORBIDDEN_PRIVATE_STRINGS = [
  'Michael Smith',
  'Michael_Smith',
  'mikejsmith1985',
  'mikej',
  'ProjectsWin',
  'ANTHROPIC_API_KEY',
  'VOYAGE_API_KEY',
  'RECALLRADAR_CONNECTION',
  'localhost',
  '127.0.0.1',
];

// What each replica has to actually contain to be the surface it claims. These
// are the labels a reader recognises from the running product, not decoration.
const SCREEN_FIDELITY_MARKERS = {
  'grounded-answer': ['Grounded', 'Known pattern', 'verified against its source record', 'Related recalls and investigations'],
  'verified-quote': ['<mark', 'Grounded', 'complaint'],
  'explained-search': ['Meaning rank', 'Keyword rank', 'Fused score', 'Combined'],
  'retrieval-evaluation': ['Recall@5', 'Recall@10', 'MRR', 'Every record', 'Recalls and investigations only'],
};

// NHTSA's own identifier shapes: an eight-digit ODI number for a complaint, a
// two-letter prefix and five digits for an investigation. A record that does
// not look like this is not a record the agency issued.
const NHTSA_IDENTIFIER_SHAPES = {
  complaint: /^\d{8}$/,
  investigation: /^(PE|EA|RQ|DP)\d{5}$/,
  recall: /^\d{2}V\d{3}000$/,
};

// The API rounds a fused score to five places before returning it.
const FUSED_SCORE_TOLERANCE = 0.000005;

// Where the measured run lives when the product's repository is checked out
// beside this one. Absent on a machine without it, and the check is skipped.
const MEASURED_RESULTS_PATH = 'C:\\ProjectsWin\\recall-radar\\eval\\results.json';

function renderEveryScreen() {
  return REQUIRED_SCREEN_FEATURE_IDS.map((featureId) => ({
    featureId,
    markup: RECALL_RADAR_SCREEN_BUILDERS[featureId](),
  }));
}

function findRecord(documentId) {
  return DEMO_RECORDS.find((candidate) => candidate.id === documentId);
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

// ── The records are real ────────────────────────────────────────────────────

test('every record and every citation carries an identifier NHTSA actually issues', () => {
  for (const record of DEMO_RECORDS) {
    assert.match(record.externalId, NHTSA_IDENTIFIER_SHAPES[record.kind], `${record.externalId} is not an NHTSA ${record.kind} id.`);
  }
  for (const citation of DEMO_CITATIONS) {
    assert.match(citation.externalId, NHTSA_IDENTIFIER_SHAPES[citation.kind], `${citation.externalId} is not an NHTSA ${citation.kind} id.`);
  }
  for (const searchHit of DEMO_SEARCH.hits) {
    assert.match(searchHit.externalId, NHTSA_IDENTIFIER_SHAPES[searchHit.kind], `${searchHit.externalId} is not an NHTSA ${searchHit.kind} id.`);
  }
});

// ── The grounding rule, applied to the captured session ─────────────────────

test('every citation spells its quote at its offsets inside the record it names', () => {
  // This is the product's own verifier, re-run on its own output. A citation
  // whose offsets do not spell its quote could not have survived it.
  for (const citation of DEMO_CITATIONS) {
    const record = findRecord(citation.documentId);

    assert.ok(record, `citation ${citation.externalId} names a record the screens do not hold.`);
    assert.equal(record.externalId, citation.externalId, `citation ${citation.externalId} points at the wrong record.`);
    assert.equal(
      record.body.slice(citation.startOffset, citation.endOffset),
      citation.quote,
      `citation ${citation.externalId} is highlighted at offsets that do not spell its quote.`,
    );
  }
});

test('the dropped-citation line is shown whether or not anything was dropped', () => {
  // The product shows the count when it is zero and when it is not, so a
  // silent drop is impossible. In the captured session nothing was dropped,
  // and the screen must say so rather than say nothing.
  const answerMarkup = RECALL_RADAR_SCREEN_BUILDERS['grounded-answer']();
  const expectedLine = DEMO_ANSWER.droppedCitationCount === 0
    ? 'Every citation the model offered was verified against its source record.'
    : `${DEMO_ANSWER.droppedCitationCount} citation`;

  assert.ok(answerMarkup.includes(expectedLine), 'the grounded-answer screen must state the dropped count.');
});

test('the opened record highlights exactly the quoted span and nothing else', () => {
  const quoteMarkup = RECALL_RADAR_SCREEN_BUILDERS['verified-quote']();
  const highlightMatches = [...quoteMarkup.matchAll(/<mark[^>]*>([\s\S]*?)<\/mark>/g)];
  const openedCitation = DEMO_CITATIONS[DEMO_ANSWER.openedCitationIndex];

  assert.ok(openedCitation, 'the opened citation must be one of the surviving citations.');
  assert.equal(highlightMatches.length, 1, 'exactly one span is highlighted on the opened record.');
  assert.equal(highlightMatches[0][1], openedCitation.quote);
  // A highlight at offset zero is a prefix, not a picture of an offset.
  assert.ok(openedCitation.startOffset > 0, 'the opened citation should sit inside the narrative, not at its start.');
});

test('the related-campaigns panel lists each cited investigation once and nothing unverified', () => {
  const answerMarkup = RECALL_RADAR_SCREEN_BUILDERS['grounded-answer']();
  const citedInvestigationIds = [...new Set(
    DEMO_CITATIONS.filter((citation) => citation.kind !== 'complaint').map((citation) => citation.externalId),
  )];

  assert.ok(citedInvestigationIds.length >= 1, 'the captured answer must cite at least one official record.');
  for (const externalId of citedInvestigationIds) {
    const occurrences = answerMarkup.split(`</span> ${externalId}</li>`).length - 1;
    assert.equal(occurrences, 1, `${externalId} must be listed exactly once as a cited record.`);
  }

  // Everything the campaign pool retrieved was quoted, so the product has no
  // unverified matches to show and must not render an empty section for them.
  const uncitedCount = DEMO_ANSWER.campaignMatches
    .filter((match) => !citedInvestigationIds.includes(match.externalId)).length;
  assert.equal(
    answerMarkup.includes('Also matched, not quoted'),
    uncitedCount > 0,
    'the unverified section appears exactly when there is something unverified to show.',
  );
});

// ── The ranking arithmetic, applied to the captured session ─────────────────

test('every fused score follows from the ranks shown beside it', () => {
  // Reciprocal rank fusion is the product's arithmetic: 1 / (k + rank) summed
  // over the methods that surfaced the record. A score beside ranks it does
  // not follow from would be the plausible wrong screen this product exists
  // to prevent.
  for (const searchHit of DEMO_SEARCH.hits) {
    const expectedScore = [searchHit.denseRank, searchHit.sparseRank]
      .filter((rank) => rank !== null)
      .reduce((runningTotal, rank) => runningTotal + 1 / (RECIPROCAL_RANK_FUSION_CONSTANT + rank), 0);

    assert.ok(
      Math.abs(searchHit.fusedScore - expectedScore) <= FUSED_SCORE_TOLERANCE,
      `${searchHit.externalId} shows a fused score its ranks do not produce.`,
    );
  }
});

test('search results are listed in fused-score order', () => {
  const searchHits = DEMO_SEARCH.hits;

  for (let i = 1; i < searchHits.length; i += 1) {
    assert.ok(
      searchHits[i - 1].fusedScore >= searchHits[i].fusedScore,
      `${searchHits[i].externalId} outranks a record with a higher fused score.`,
    );
  }
});

test('at least one result was found by only one method, so the absent badge is shown', () => {
  const hasSingleMethodHit = DEMO_SEARCH.hits.some(
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
