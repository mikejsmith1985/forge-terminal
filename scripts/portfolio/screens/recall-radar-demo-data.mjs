// The invented session the Recall Radar portfolio screens are drawn from.
//
// The product reads public NHTSA data, so there is no customer to protect —
// but the rule for every screen on the site is that nothing is captured from a
// running system, and these are no exception. The vehicle and the symptom are
// the ones the product's own README walks through, because a made-up make on a
// screen about government records would read as a toy. Every record number,
// every narrative, every quote and every rank below is invented for
// publication, and the record numbers are chosen outside the ranges NHTSA has
// issued so they cannot be mistaken for a real filing.
//
// Two things are derived rather than typed, because the product's whole claim
// is that they cannot drift. A citation's offsets are found in its record's
// body at build time, so the highlighted span can never disagree with the
// quote beside it. A fused score is computed from the ranks shown next to it,
// so the search screen cannot show a number its own arithmetic would reject.
//
// The one exception to "invented" is the evaluation table. Those figures are
// the measured run committed in the product's repository, reproduced exactly,
// and the accompanying test checks them against that file when it is present.

/** The shipped light palette, token for token, from the product's stylesheet. */
export const DEMO_THEME = {
  page: '#f4f6f9',
  surface: '#ffffff',
  surfaceSunken: '#f8fafc',
  ink: '#101827',
  inkSoft: '#364152',
  muted: '#64748b',
  line: '#dfe4ec',
  lineStrong: '#c4ccd8',
  accent: '#1a56db',
  accentSoft: '#e8effc',
  accentInk: '#1543ad',
  onAccent: '#ffffff',
  ok: '#14663f',
  okSoft: '#ddf4e8',
  warn: '#9a3412',
  warnSoft: '#fdead7',
  mark: '#ffe89a',
};

/** The two vehicles the product ships loaded, with the counts the README publishes. */
export const DEMO_VEHICLES = [
  {
    id: 1,
    displayName: '2013 Explorer Sport',
    counts: { complaint: 2231, recall: 12, investigation: 6 },
    isSelected: true,
  },
  {
    id: 2,
    displayName: '2014 F-150 SVT Raptor',
    counts: { complaint: 1362, recall: 8, investigation: 2 },
    isSelected: false,
  },
];

/** The symptom typed into the Ask tab, in the owner's own words. */
export const DEMO_QUESTION =
  'I get a strong exhaust smell inside the cabin when I accelerate. Is this a known problem?';

/**
 * The records the answer draws on, with their full bodies.
 *
 * Complaint narratives are upper case because that is how NHTSA stores them,
 * and a replica that tidied them into sentence case would be showing a record
 * the verifier never sees. Recall and investigation summaries are written the
 * way the agency writes them.
 */
export const DEMO_RECORDS = [
  {
    kind: 'complaint',
    externalId: '90418427',
    title: 'Exhaust odor in cabin under acceleration',
    component: 'ENGINE AND ENGINE COOLING:EXHAUST SYSTEM',
    filedOn: '2013-08-19',
    body:
      'THERE IS A STRONG EXHAUST SMELL INSIDE THE CABIN WHENEVER I ACCELERATE ONTO THE HIGHWAY '
      + 'OR CLIMB A HILL WITH THE AIR CONDITIONING ON. IT IS WORST WITH THE WINDOWS UP AND THE '
      + 'FAN ON RECIRCULATE. THE DEALER COULD NOT REPRODUCE IT IN THE SERVICE BAY BECAUSE THE '
      + 'VEHICLE HAS TO BE UNDER LOAD FOR SEVERAL MINUTES BEFORE THE SMELL COMES THROUGH. I HAVE '
      + 'TWO SMALL CHILDREN IN THE BACK SEAT AND I DO NOT KNOW WHAT THEY ARE BREATHING.',
  },
  {
    kind: 'complaint',
    externalId: '90422910',
    title: 'Headaches and nausea on longer drives',
    component: 'ENGINE AND ENGINE COOLING:EXHAUST SYSTEM',
    filedOn: '2013-11-04',
    body:
      'MY WIFE AND I BOTH GET HEADACHES AND NAUSEA ON LONGER DRIVES IN THIS VEHICLE, AND WE '
      + 'CAN SMELL EXHAUST IN THE CABIN WHEN PASSING TRUCKS OR MERGING. WE BOUGHT A CARBON '
      + 'MONOXIDE DETECTOR FOR THE CAR AND IT HAS GONE OFF TWICE ON THE INTERSTATE. THE DEALER '
      + 'SAYS THERE IS NOTHING WRONG WITH THE EXHAUST SYSTEM.',
  },
  {
    kind: 'complaint',
    externalId: '90431184',
    title: 'Service bulletin performed, odor returned',
    component: 'ENGINE AND ENGINE COOLING:EXHAUST SYSTEM',
    filedOn: '2014-02-12',
    body:
      'THE DEALER PERFORMED THE SERVICE BULLETIN AND THE SMELL CAME BACK WITHIN A WEEK. THEY '
      + 'RESEALED THE REAR OF THE VEHICLE AND TOLD ME THE SMELL WAS COMING IN THROUGH THE LIFTGATE '
      + 'SEAMS. IT STILL SMELLS LIKE EXHAUST UNDER HARD ACCELERATION. THIS IS THE THIRD VISIT FOR '
      + 'THE SAME PROBLEM AND NOBODY WILL TELL ME WHERE THE EXHAUST IS ACTUALLY GETTING IN.',
  },
  {
    kind: 'investigation',
    externalId: 'PE13-901',
    title: 'Exhaust odor in passenger compartment',
    component: 'ENGINE AND ENGINE COOLING:EXHAUST SYSTEM',
    filedOn: '2013-12-10',
    body:
      'The Office of Defects Investigation has received reports of exhaust odor entering the '
      + 'passenger compartment during heavy acceleration, with several complainants describing '
      + 'headache and nausea. A preliminary evaluation has been opened to assess the scope and '
      + 'frequency of the alleged defect, and to determine whether the manufacturer\'s service '
      + 'procedure addresses the source of the odor rather than its path into the cabin.',
  },
  {
    kind: 'recall',
    externalId: '14V-901000',
    title: 'Exhaust pipe to resonator weld may crack',
    component: 'ENGINE AND ENGINE COOLING:EXHAUST SYSTEM',
    filedOn: '2014-06-03',
    body:
      'On certain vehicles, cracks at the weld between the exhaust pipe and the resonator may '
      + 'allow exhaust gases to enter the cabin through the underbody. Prolonged exposure to '
      + 'exhaust gases can cause drowsiness or impairment and increase the risk of a crash. '
      + 'Dealers will inspect the weld and replace the affected section of the exhaust system '
      + 'free of charge.',
  },
];

/**
 * The quotes the model offered, each naming the record it came from.
 *
 * The fifth is the one the verifier drops: the model paraphrased instead of
 * quoting, and a paraphrase is not in the record. It is kept in the picture
 * because a screen where every citation survived would hide the mechanism.
 */
const OFFERED_CITATIONS = [
  { externalId: '90418427', quote: 'STRONG EXHAUST SMELL INSIDE THE CABIN WHENEVER I ACCELERATE ONTO THE HIGHWAY' },
  { externalId: '90422910', quote: 'HEADACHES AND NAUSEA ON LONGER DRIVES' },
  { externalId: '90431184', quote: 'THE DEALER PERFORMED THE SERVICE BULLETIN AND THE SMELL CAME BACK WITHIN A WEEK' },
  { externalId: 'PE13-901', quote: 'exhaust odor entering the passenger compartment during heavy acceleration' },
  { externalId: '14V-901000', quote: 'cracks at the weld between the exhaust pipe and the resonator may allow exhaust gases to enter the cabin' },
  { externalId: '90422910', quote: 'the dealer found nothing wrong with the exhaust' },
];

/** Finds one offered quote in its record, or reports that the verifier would drop it. */
function verifyCitation(offeredCitation) {
  const record = DEMO_RECORDS.find((candidate) => candidate.externalId === offeredCitation.externalId);
  const startOffset = record ? record.body.indexOf(offeredCitation.quote) : -1;

  if (startOffset < 0) {
    return null;
  }

  return {
    kind: record.kind,
    externalId: record.externalId,
    quote: offeredCitation.quote,
    startOffset,
    endOffset: startOffset + offeredCitation.quote.length,
  };
}

/**
 * The citations that survive verification, with offsets found in the body.
 *
 * Built the way the product builds them — by looking each quote up in its
 * record — so the highlight on the opened record and the quote in the list are
 * the same characters by construction rather than by care.
 */
export function buildVerifiedCitations() {
  return OFFERED_CITATIONS
    .map(verifyCitation)
    .filter((citation) => citation !== null);
}

/** The answer as the product presents it, with the counts the verifier produced. */
export const DEMO_ANSWER = {
  text:
    'Yes — this is a known pattern for this vehicle. Owners describe a strong exhaust smell in the '
    + 'cabin under acceleration, several with headaches and nausea, and at least one had the '
    + 'manufacturer\'s service bulletin performed without the smell going away. NHTSA opened an '
    + 'investigation into exhaust odor in the passenger compartment, and a recall followed for '
    + 'cracked welds between the exhaust pipe and the resonator that can let exhaust gases into '
    + 'the cabin. If your vehicle is covered, the repair is free.',
  isGrounded: true,
  isKnownPattern: true,
  droppedCitationCount: OFFERED_CITATIONS.length - buildVerifiedCitations().length,
  linkedCampaigns: ['14V-901000'],
  // The record a reader clicks open on the verified-quote screen: the first
  // complaint, because a highlighted span inside an owner's own words is the
  // clearest possible picture of what "checked" means.
  openedCitationExternalId: '90418427',
  // Retrieved from the campaign pool but never quoted, so shown separately and
  // labelled unverified. Collapsing it into the cited list would let it borrow
  // credibility it has not earned.
  uncitedMatches: [
    {
      kind: 'recall',
      externalId: '15V-901000',
      title: 'Exhaust manifold heat shield may loosen',
    },
  ],
};

/**
 * The constant in reciprocal rank fusion, 1 / (k + rank). Sixty is the value
 * the original paper proposed and the one the product uses.
 */
export const RECIPROCAL_RANK_FUSION_CONSTANT = 60;

/** The search typed into the Search tab, and the mode the product defaults to. */
export const DEMO_SEARCH = {
  query: 'exhaust smell in cabin',
  mode: 'hybrid',
};

// Where each retrieval method placed each record, or null when the method did
// not surface it. The complaint about headaches is the reason a hybrid exists:
// it never says "exhaust smell", so keyword search misses it and meaning search
// does not.
const DEMO_RANKS = [
  { externalId: '90418427', denseRank: 1, sparseRank: 2 },
  { externalId: 'PE13-901', denseRank: 5, sparseRank: 1 },
  { externalId: '90431184', denseRank: 3, sparseRank: 4 },
  { externalId: '90422910', denseRank: 2, sparseRank: null },
];

// How much of a record's body the result card shows before trailing off.
const SNIPPET_LENGTH = 180;

/** Sums 1 / (k + rank) over the methods that surfaced a record. */
function fuseRanks(ranks) {
  return ranks
    .filter((rank) => rank !== null)
    .reduce((runningTotal, rank) => runningTotal + 1 / (RECIPROCAL_RANK_FUSION_CONSTANT + rank), 0);
}

/**
 * The search results, scored and ordered the way the product scores them.
 *
 * The fused score is computed from the two ranks rather than written beside
 * them, and the list is sorted by it, so the screen cannot show an order its
 * own numbers would contradict.
 */
export function buildSearchHits() {
  return DEMO_RANKS
    .map((rankEntry) => {
      const record = DEMO_RECORDS.find((candidate) => candidate.externalId === rankEntry.externalId);

      return {
        kind: record.kind,
        externalId: record.externalId,
        title: record.title,
        component: record.component,
        filedOn: record.filedOn,
        snippet: `${record.body.slice(0, SNIPPET_LENGTH).trimEnd()}…`,
        denseRank: rankEntry.denseRank,
        sparseRank: rankEntry.sparseRank,
        fusedScore: fuseRanks([rankEntry.denseRank, rankEntry.sparseRank]),
      };
    })
    .sort((firstHit, secondHit) => secondHit.fusedScore - firstHit.fusedScore);
}

/**
 * The measured evaluation run, reproduced from the product's committed
 * eval/results.json. These are the only figures on these screens that are not
 * invented, and they are the ones the product's README explains at length:
 * meaning search scoring zero against every record, and 0.400 against the
 * official records alone, is the finding the whole evaluation exists to show.
 *
 * The run number and the count of earlier runs are presentation and are not
 * in the results file; the metrics are exact.
 */
export const DEMO_EVALUATION = {
  runId: 7,
  ranAt: '2026-09-06T13:55:55Z',
  caseCount: 80,
  earlierRunCount: 6,
  metrics: {
    sparse: { recallAt5: 0.075, recallAt10: 0.125, mrr: 0.05666666666666668 },
    dense: { recallAt5: 0, recallAt10: 0, mrr: 0 },
    hybrid: { recallAt5: 0, recallAt10: 0, mrr: 0 },
    campaignsSparse: { recallAt5: 0.375, recallAt10: 0.375, mrr: 0.375 },
    campaignsDense: { recallAt5: 0.325, recallAt10: 0.4, mrr: 0.2833333333333333 },
    campaignsHybrid: { recallAt5: 0.375, recallAt10: 0.4, mrr: 0.2791666666666667 },
  },
  // The committed run measured retrieval only; answering was not part of it.
  faithfulness: null,
};
