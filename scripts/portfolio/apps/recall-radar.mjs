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
//
// Unlike every other product on the site, the screens show real data. NHTSA
// records are public, and a reader can look any of them up; hiding them behind
// invented ones would have made the product look less credible, not more.

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
  techStack: ['RAG', 'C# / .NET 10', 'PostgreSQL + pgvector', 'Claude API', 'React / TypeScript', 'Testcontainers'],
  // The four claims the entry rests on. Each is either falsifiable from the
  // repository or an admission.
  keyPoints: [
    'Grounding fails closed. A citation is verified as a literal substring of its source record '
    + 'before it is shown; unverified citations are dropped and the count is displayed even when '
    + 'it is zero — as it is on the screen below — so a silent drop is impossible.',
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
    'These screens are source-derived replicas of the shipped interface showing a real session. '
    + 'The question, the answer, its ten citations, the records they name, the search ranks and the '
    + 'evaluation were produced by the running product against the loaded NHTSA data on 7 September '
    + '2026 and are reproduced exactly — nothing is invented or tidied. The records are public '
    + 'federal filings, and every complaint and investigation number on these screens can be looked '
    + 'up.',
  features: [
    {
      id: 'grounded-answer',
      title: 'An answer that can only say what it can quote',
      wowFactor:
        'Ten quotes offered, ten found character for character in the record each names — six '
        + 'owner complaints and two federal investigations. The last quote is the agency\'s own '
        + 'conclusion that it found no defect, which the model cited rather than left out, because '
        + 'a citation schema does not let it paraphrase the inconvenient part away. The dropped '
        + 'count is shown at zero, so silence never hides a drop.',
      whatItShows:
        'The Ask tab after a symptom is described: the grounded and known-pattern verdicts, the '
        + 'answer, the line stating every citation was verified, ten citations each naming its '
        + 'record, and the related panel listing the two investigations by name.',
      mockDataApproach:
        'None. This is the product\'s real answer to this question, captured from the running API '
        + 'and reproduced exactly; the records are public NHTSA filings.',
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
        + 'verifier matched — not a search for similar words, the exact characters, here 368 to '
        + '469 of an owner\'s complaint: the sentence about the dealer\'s fix that did not work. This '
        + 'is the picture of what "checked" means, and it is why the answer above can be trusted '
        + 'without trusting the model.',
      whatItShows:
        'One citation opened: the owner\'s complaint in full, in the upper case NHTSA files it in, '
        + 'with the quoted sentence highlighted where it sits in the narrative.',
      mockDataApproach:
        'None. The record is the real NHTSA complaint, and the highlight is at the offsets the '
        + 'API returned; the test suite re-checks that those offsets spell the quote.',
      capturePlan:
        'Render the Ask tab with the fifth citation opened beneath the answer and trim to content.',
      imageKind: 'source-derived-replica',
      imagePath: './assets/recall-radar/recall-radar-verified-quote.png',
    },
    {
      id: 'explained-search',
      title: 'Every result says how it was found',
      wowFactor:
        'Rank explanations are part of the API contract, not a debug extra. The top result was '
        + 'neither method\'s first choice — sixteenth by meaning, twenty-second by keyword — and it '
        + 'wins because both found it. The record meaning search ranked first was not in keyword\'s '
        + 'top fifty at all, and the card says so.',
      whatItShows:
        'The Search tab in combined mode: the top results, each with its meaning rank, its keyword '
        + 'rank or the note that keyword search did not surface it, and the reciprocal-rank-fusion '
        + 'score the two produce.',
      mockDataApproach:
        'None. These are the ten hits the API returned for this query, in its order; the test '
        + 'suite recomputes every fused score from the ranks beside it.',
      capturePlan:
        'Render the Search tab with the mode switch and the result cards and trim to content.',
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
        'None. This is the latest run as the API reports it, the same run committed in the '
        + 'repository, and the test suite compares the six rows against that file.',
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
    readySignal: 'http://127.0.0.1:5180/health',
    environmentVariables: {},
  },
  demoSetupHooks: [
    {
      id: 'reproduce-the-captured-session',
      description:
        'Render the session captured from the running product rather than calling it again, so '
        + 'the published image does not change every time the model phrases an answer differently.',
      mockDataApproach:
        'No mocking. The captured answer, citations, records, hits and evaluation live in the '
        + 'portfolio demo-data module exactly as the API returned them.',
      runnerInstruction:
        'Render the screen builders directly — they are self-contained documents and need no '
        + 'running server or API key.',
    },
    {
      id: 'keep-the-measured-evaluation-exact',
      description:
        'Show the committed evaluation figures exactly, zeros included, because a replica that '
        + 'improved on the measured run would be the overclaim the product exists to prevent.',
      mockDataApproach:
        'The metrics are the API\'s latest run and the test suite compares them against '
        + 'eval/results.json in the product repository when it is present.',
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
