// App-specific portfolio display and capture definitions for Recall Radar.
//
// This entry carries the page's argument into retrieval-augmented generation,
// which is the domain where "the model said so" is most often allowed to
// stand as evidence. The product's answer to that is mechanical: a citation is
// not evidence until it has been found, character for character, in the record
// it names, and an answer with no surviving citation is refused rather than
// flagged. The entry leads with the number that makes the project credible —
// the evaluation that got worse when embeddings were added — because a
// retrieval project that only publishes its good numbers has published nothing.

const LOCAL_REPO_PATH = 'C:\\ProjectsWin\\recall-radar';

// The shipped shell is capped at 1120 pixels wide and centred, so a viewport
// much wider than that captures page margin rather than product.
const RADAR_VIEWPORT_WIDTH = 1280;
const RADAR_VIEWPORT_HEIGHT = 1000;

export const RECALL_RADAR_APP = {
  slug: 'recall-radar',
  name: 'Recall Radar',
  tagline:
    'Ask whether a symptom in your car is a known defect, and get an answer whose every quote '
    + 'has been checked against the NHTSA record it came from.',
  headline:
    'Adding embeddings made the evaluation worse. The numbers are on the page, and so is why.',
  summary:
    'A retrieval-augmented question answering system over public NHTSA data: owner complaints, '
    + 'recall campaigns, and the defect investigations that connect them, for a specific vehicle. '
    + 'Hybrid retrieval — pgvector for meaning, Postgres full-text for keywords, fused by '
    + 'reciprocal rank — feeds Claude a schema that makes citations data rather than prose. Every '
    + 'quote is then checked as a literal substring of its record. A quote that is not there is '
    + 'dropped and counted; an answer with no surviving quote is returned as not grounded and its '
    + 'prose is discarded with it, because text that reads as an answer will be read as one '
    + 'whatever flag sits beside it.',
  accent: '#1a56db',
  category: 'Grounded RAG over public records',
  launchSurface: './scripts/run-dev-clean.ps1',
  techStack: ['C# / .NET 10', 'PostgreSQL + pgvector', 'Claude API', 'React / TypeScript', 'Testcontainers'],
  // The four claims the entry rests on. Each is either falsifiable from the
  // repository or an admission.
  keyPoints: [
    'Grounding fails closed. A citation is verified as a literal substring of its source record '
    + 'before it is shown; unverified citations are dropped and the count is displayed even when '
    + 'it is zero, so a silent drop is impossible.',
    'Retrieval quality is measured against ground truth nobody hand-labelled: NHTSA records which '
    + 'investigation led to which recall, and which complaints were filed while it was open. '
    + 'Eighty cases, three retrieval modes, two record pools, results committed.',
    'The first evaluation scored meaning search at zero. Nothing was broken — 28 official records '
    + 'were being ranked against 3,593 complaints and the complaints won every place. The fix was '
    + 'a second retrieval pool, not a better model, and it took recall@10 from 0.125 to 0.400.',
    'Five defects that passed every test and failed on real data are written up in the README, '
    + 'including the one where the model reasonably cited the record label instead of the record '
    + 'and nine genuine citations were thrown away.',
  ],
  links: [
    // The evaluation leads, because the headline is a claim about a number and
    // the reader is entitled to the table before the prose.
    {
      label: 'Retrieval quality, measured — and read honestly',
      repoPath: 'recall-radar/blob/main/README.md#retrieval-quality-measured',
    },
    {
      label: 'The committed evaluation run',
      repoPath: 'recall-radar/blob/main/eval/results.json',
    },
    {
      label: 'Source — recall-radar',
      repoPath: 'recall-radar',
    },
  ],
  proofNote:
    'These screens are source-derived replicas of the shipped interface. The vehicle and the '
    + 'symptom are the ones the README walks through; every record number, narrative, quote, '
    + 'offset and rank was invented for publication, with the record numbers chosen outside the '
    + 'ranges NHTSA issues. The one exception is the evaluation table, which reproduces the '
    + 'measured run committed in the repository, zeros included.',
  features: [
    {
      id: 'grounded-answer',
      title: 'An answer that says what it could not prove',
      wowFactor:
        'The model offered six quotes and one of them was a paraphrase. It is gone, and the panel '
        + 'says so — the dropped count is shown when it is zero too, so silence never hides a drop. '
        + 'Beneath the answer, the recall that was retrieved but never quoted is labelled unverified '
        + 'rather than left to borrow credibility from the ones that were.',
      whatItShows:
        'The Ask tab after a symptom is described: the grounded and known-pattern verdicts, the '
        + 'answer, the dropped-citation line, five surviving citations each naming its record, and '
        + 'the related campaigns split into quoted and merely retrieved.',
      mockDataApproach:
        'The question is the README\'s worked example; every record, quote and campaign number is '
        + 'invented, and the surviving citations are the ones whose quote is found in its record at '
        + 'build time — the paraphrase is dropped by the same rule the product applies.',
      capturePlan:
        'Render the Ask tab with the answer and related-campaigns panels and trim to content height.',
      imageKind: 'source-derived-replica',
      imagePath: './assets/recall-radar/recall-radar-grounded-answer.png',
    },
    {
      id: 'verified-quote',
      title: 'The quote, at the character it was found',
      wowFactor:
        'Opening a citation shows the whole record with the quoted span marked at the offsets the '
        + 'verifier matched — not a search for similar words, the exact characters. This is the '
        + 'picture of what "checked" means, and it is the reason the answer above it can be '
        + 'trusted without trusting the model.',
      whatItShows:
        'The first citation opened: the owner\'s complaint in full, in the upper case NHTSA stores '
        + 'it in, with the quoted span highlighted where it sits in the narrative.',
      mockDataApproach:
        'The narrative is invented. The highlight offsets are not typed: they are found by looking '
        + 'the quote up in the body, so the marked span and the quote in the list cannot disagree.',
      capturePlan:
        'Render the Ask tab with the first citation opened beneath the answer and trim to content.',
      imageKind: 'source-derived-replica',
      imagePath: './assets/recall-radar/recall-radar-verified-quote.png',
    },
    {
      id: 'explained-search',
      title: 'Every result says how it was found',
      wowFactor:
        'Rank explanations are part of the API contract, not a debug extra. The complaint about '
        + 'headaches never says "exhaust smell", so keyword search misses it and meaning search '
        + 'finds it — and the card says exactly that, with the fused score the two ranks produce.',
      whatItShows:
        'The Search tab in combined mode: four records, each with its meaning rank, its keyword '
        + 'rank or the note that keyword search did not surface it, and the reciprocal-rank-fusion '
        + 'score they add up to.',
      mockDataApproach:
        'The ranks are invented; the fused scores are computed from them at build time and the '
        + 'list is sorted by the result, so the screen cannot show an order its own arithmetic '
        + 'would reject.',
      capturePlan:
        'Render the Search tab with the mode switch and four result cards and trim to content.',
      imageKind: 'source-derived-replica',
      imagePath: './assets/recall-radar/recall-radar-explained-search.png',
    },
    {
      id: 'retrieval-evaluation',
      title: 'The numbers, including the ones that are bad',
      wowFactor:
        'Meaning search scored 0.000 against every record and 0.400 against the official records '
        + 'alone. The product ships both tables one above the other, because the gap between them '
        + 'is the finding: the failure was crowding, not ranking, and a second retrieval pool fixed '
        + 'what a better model would not have.',
      whatItShows:
        'The Evaluation tab: eighty derived ground-truth cases, three retrieval modes, and the two '
        + 'pools — every record, then recalls and investigations only — with recall@5, recall@10 '
        + 'and MRR for each.',
      mockDataApproach:
        'These six rows are the measured run committed in the repository, reproduced exactly and '
        + 'checked against that file by the test suite. Nothing on this screen is invented except '
        + 'the run number.',
      capturePlan:
        'Render the Evaluation tab with both pools and trim to content height.',
      imageKind: 'source-derived-replica',
      imagePath: './assets/recall-radar/recall-radar-retrieval-evaluation.png',
    },
  ],
};

export const RECALL_RADAR_PORTFOLIO_CONFIG = {
  slug: RECALL_RADAR_APP.slug,
  name: RECALL_RADAR_APP.name,
  localRepoPath: LOCAL_REPO_PATH,
  outputDirPath: 'web/portfolio/assets/recall-radar',
  captureToolchain: 'playwright',
  launchStrategy: {
    localRepoPath: LOCAL_REPO_PATH,
    command: './scripts/run-dev-clean.ps1',
    readySignal: 'http://127.0.0.1:5173',
    environmentVariables: {},
  },
  demoSetupHooks: [
    {
      id: 'seed-invented-answer-session',
      description:
        'Populate the replica with invented records, quotes and ranks rather than reading the '
        + 'local database, so the published image depends on nothing that can change and carries '
        + 'no record NHTSA actually holds.',
      mockDataApproach:
        'All values come from the portfolio demo-data module; the running product is never '
        + 'started and no API key is needed.',
      runnerInstruction:
        'Render the screen builders directly — they are self-contained documents and need no '
        + 'running server.',
    },
    {
      id: 'reproduce-the-measured-evaluation',
      description:
        'Show the committed evaluation figures exactly, zeros included, because a replica that '
        + 'improved on the measured run would be the overclaim the product exists to prevent.',
      mockDataApproach:
        'The metrics are copied from eval/results.json in the product repository and the test '
        + 'suite compares them against that file when it is present.',
      runnerInstruction:
        'Do not adjust or round the metric values; the product prints three decimal places.',
    },
  ],
  captureTargets: [
    {
      featureId: 'grounded-answer',
      outputFileName: 'recall-radar-grounded-answer.png',
      viewportWidth: RADAR_VIEWPORT_WIDTH,
      viewportHeight: RADAR_VIEWPORT_HEIGHT,
    },
    {
      featureId: 'verified-quote',
      outputFileName: 'recall-radar-verified-quote.png',
      viewportWidth: RADAR_VIEWPORT_WIDTH,
      viewportHeight: RADAR_VIEWPORT_HEIGHT,
    },
    {
      featureId: 'explained-search',
      outputFileName: 'recall-radar-explained-search.png',
      viewportWidth: RADAR_VIEWPORT_WIDTH,
      viewportHeight: RADAR_VIEWPORT_HEIGHT,
    },
    {
      featureId: 'retrieval-evaluation',
      outputFileName: 'recall-radar-retrieval-evaluation.png',
      viewportWidth: RADAR_VIEWPORT_WIDTH,
      viewportHeight: RADAR_VIEWPORT_HEIGHT,
    },
  ],
};
