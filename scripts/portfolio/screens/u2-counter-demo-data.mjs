// The invented counter session the U2 Counter portfolio screens are drawn from.
//
// The product itself already runs on a synthetic store, but "synthetic" is a
// claim a reader cannot check from a picture, so every value here is invented a
// second time for publication and kept in this one file. Nothing below came out
// of a running system.
//
// The one thing that is not invented is the *shape*. A MultiValue record is not
// a row: fields 1 to 5 of an INVENTORY record run in parallel, so position three
// of each field belongs to the same branch. Reading position three of one field
// beside position four of another produces a screen that is entirely plausible
// and entirely wrong, and a replica that quietly flattened that would be hiding
// the only interesting thing about this data. So the marks are real characters
// here, and the parsed rows are derived from them rather than typed out beside
// them.

/** The colours the shipped interface uses, in the light theme it opens in. */
export const DEMO_THEME = {
  surface: '#fbfaf8',
  surfaceRaised: '#ffffff',
  surfaceSunken: '#f2efea',
  line: '#ddd8d0',
  lineStrong: '#c4bcb0',
  text: '#1c1917',
  textMuted: '#6b6259',
  textFaint: '#776e64',
  accent: '#b45309',
  accentText: '#ffffff',
  accentSoft: '#fdf1e3',
  available: '#15803d',
  availableSoft: '#dcfce7',
  committed: '#a16207',
  committedSoft: '#fef3c7',
  none: '#6b6259',
  noneSoft: '#f2efea',
};

/** The part the whole session is about. */
export const DEMO_PART = {
  number: 'E-BRK00008',
  description: '15A AFCI single-pole breaker',
  unit: 'EA',
};

/** The account the price is being quoted against. */
export const DEMO_CUSTOMER = {
  id: 'C-40118',
  name: 'Redgate Electrical Supply',
  priceClass: 'CONTRACT-B',
};

/**
 * Branch stock, in the order the record stores it.
 *
 * `onHand` minus `committed` is the only figure a counter representative may
 * quote, and the two rows where they differ are the point: a branch with forty
 * on the shelf and thirty-nine promised has one to sell.
 */
export const DEMO_BRANCHES = [
  { code: '03', name: 'Grand Junction', onHand: 312, committed: 13 },
  { code: '07', name: 'Kearsley Park', onHand: 40, committed: 39 },
  { code: '11', name: 'Ashfield Road', onHand: 88, committed: 0 },
  { code: '14', name: 'Weller Street', onHand: 0, committed: 0 },
];

/** What a branch row is worth to a representative, given free-to-sell stock. */
export function describeAvailability(branch) {
  const freeToSell = branch.onHand - branch.committed;

  if (freeToSell > 20) {
    return { freeToSell, tone: 'available', label: 'Free to sell' };
  }
  if (freeToSell > 0) {
    return { freeToSell, tone: 'committed', label: 'Mostly committed' };
  }
  return { freeToSell, tone: 'none', label: 'None free' };
}

/** The three MultiValue separators, by the glyphs the product prints them as. */
export const DEMO_MARKS = {
  attribute: 'þ',
  value: 'ý',
  subValue: 'ü',
};

/**
 * The stored INVENTORY record, as bytes, with separators shown.
 *
 * Built from the branch list rather than written out beside it, so the raw panel
 * and the parsed table cannot drift apart in the published image the way they
 * can in a hand-typed mock.
 */
export function buildStoredRecord() {
  const field = (values) => values.join(DEMO_MARKS.value);

  return [
    DEMO_PART.description,
    field(DEMO_BRANCHES.map((branch) => branch.code)),
    field(DEMO_BRANCHES.map((branch) => String(branch.onHand))),
    field(DEMO_BRANCHES.map((branch) => String(branch.committed))),
    field(DEMO_BRANCHES.map((branch) => branch.name)),
  ].join(DEMO_MARKS.attribute);
}

/** What the five fields of the record mean, for the legend beside the bytes. */
export const DEMO_RECORD_FIELDS = [
  { position: 1, name: 'DESCRIPTION', note: 'one value' },
  { position: 2, name: 'BRANCH.CODE', note: 'multi-valued' },
  { position: 3, name: 'QTY.ON.HAND', note: 'parallel to field 2' },
  { position: 4, name: 'QTY.COMMITTED', note: 'parallel to field 2' },
  { position: 5, name: 'BRANCH.NAME', note: 'parallel to field 2' },
];

/** The question typed into the assistant, in plain words. */
export const DEMO_QUESTION = 'Which branch has the most 15A AFCI breakers free to sell?';

/** The answer it came back with, and the sentence under it that qualifies it. */
export const DEMO_ANSWER = {
  headline:
    'Grand Junction has 299 free to sell — 312 on hand with 13 already committed to orders.',
  qualifier:
    'Kearsley Park looks close on the shelf at 40, but 39 are promised, so only 1 is free.',
};

/**
 * Every call the assistant made to answer that question.
 *
 * Shown because a sentence saying "299 free to sell" is worth no more than the
 * reader's willingness to believe it. Each row names the tool, the file and the
 * key, so the answer can be traced back to a lookup rather than taken on trust.
 */
export const DEMO_MCP_CALLS = [
  {
    tool: 'search_parts',
    detail: "term = '15A AFCI'",
    result: '3 matches',
    milliseconds: 41,
  },
  {
    tool: 'read_record',
    detail: `file = INVENTORY, key = ${DEMO_PART.number}`,
    result: '5 fields, 4 values each',
    milliseconds: 28,
  },
  {
    tool: 'read_dictionary',
    detail: 'file = INVENTORY',
    result: '18 field definitions',
    milliseconds: 19,
  },
  {
    tool: 'execute_query',
    detail: "LIST INVENTORY WITH PART.NO = 'E-BRK00008' BRANCH.CODE QTY.ON.HAND",
    result: '4 rows, uncapped',
    milliseconds: 63,
  },
];

/** The eight tools the server offers, and the fact that none of them writes. */
export const DEMO_TOOL_POLICY = {
  available: 8,
  writes: 0,
  note: 'Read-only: no write, delete or transaction verb is offered for the model to reach for.',
};

/** The badges the product prints on every screen, including this one. */
export const DEMO_GOVERNANCE_BADGES = [
  'Demonstration data',
  'Read-only',
  'One shared database login',
  'Scales to zero when idle',
];

/** Where the tour is when its screen is captured. */
export const DEMO_TOUR_STEP = {
  index: 8,
  total: 14,
  title: 'Free to sell, not on hand',
  body:
    'On hand minus what orders already hold. The distinction is the whole job: a branch with '
    + 'forty on the shelf and thirty-nine promised has one to sell, and promising the forty is '
    + 'how a customer gets let down.',
};
