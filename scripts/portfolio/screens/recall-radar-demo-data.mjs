// The real session the Recall Radar portfolio screens are drawn from.
//
// Every other product on the site shows invented data, because their real data
// belongs to somebody. Recall Radar's does not: NHTSA complaints, recalls and
// defect investigations are public records, and a screen that hid them behind
// made-up ones would make the product look less credible, not more. So this
// file holds a session captured from the running product on 7 September 2026 —
// the question, the answer Claude gave, the ten citations that survived
// verification, the records they name, a search with its ranks, and the latest
// evaluation — reproduced exactly as the API returned them. Nothing here is
// invented, tidied, or improved. The accompanying test re-verifies every
// citation against its record body and every fused score against its ranks,
// which is the product's own arithmetic applied to its own output.
//
// The only editorial decision is the vehicle list: the local database also
// held two scratch vehicles the maintainer was experimenting with, and those
// are left out because they are not part of what the README documents.

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

/** The two vehicles the README documents, with the counts the API reports for them. */
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

/** The symptom typed into the Ask tab — the README's own worked example. */
export const DEMO_QUESTION =
  'I get a strong exhaust smell inside the cabin when I accelerate. Is this a known problem?';

/**
 * The eight NHTSA records the answer's citations name, exactly as the product
 * stores them: complaint narratives in the upper case the agency files them
 * in, and the investigation summaries with the agency's own encoding artefacts
 * left alone, because the verifier matches against these bytes and a tidied
 * copy would be a record the verifier never saw.
 */
export const DEMO_RECORDS = [
  {
    id: 1766,
    kind: 'complaint',
    externalId: '10955503',
    title: 'ON ACCELERATION THE INSIDE OF THE CABIN HAS AN EXHAUST SMELL.  THIS ONLY HAPPENS',
    component: 'UNKNOWN OR OTHER',
    filedOn: '2017-02-19',
    body: 'ON ACCELERATION THE INSIDE OF THE CABIN HAS AN EXHAUST SMELL.  THIS ONLY HAPPENS WHEN ACCELERATING, USUALLY MEDIUM TO HARD, AND THEN STOPS.  THE EXHAUST FUMES ALWAY OCCUR DURING THIS TYPE OF ACCELERATION.',
  },
  {
    id: 1670,
    kind: 'complaint',
    externalId: '11006419',
    title: 'SMELLING EXHAUST ODORS INSIDE THE VEHICLE. EXHAUST SMELL OCCURS WHEN YOU ARE AT',
    component: 'UNKNOWN OR OTHER',
    filedOn: '2017-07-19',
    body: 'SMELLING EXHAUST ODORS INSIDE THE VEHICLE. EXHAUST SMELL OCCURS WHEN YOU ARE AT FULL THROTTLE, SUCH AS WHEN YOU ARE TRYING TO ENTER A HIGHWAY. THE SMELL STAYS IN THE VEHICLE, AND IT IS VERY STRONG.',
  },
  {
    id: 1792,
    kind: 'complaint',
    externalId: '10954200',
    title: 'WHEN ACCELERATING RAPIDLY A STRONG EXHAUST ODOR ENTERS THE CABIN OF THE VEHICLE.',
    component: 'UNKNOWN OR OTHER',
    filedOn: '2017-02-13',
    body: 'WHEN ACCELERATING RAPIDLY A STRONG EXHAUST ODOR ENTERS THE CABIN OF THE VEHICLE. ODOR RESULTS IN HEADACHE AND AT TIMES NAUSEA. HOWEVER, ODOR IS NOT AS PROMINENT IF THE CAR ACCELERATES GRADUALLY ONLY IF ACCELERATING QUICKLY IE...MERGING ONTO THE HIGHWAY. THIS HAS BEEN A PROBLEM SINCE I PURCHASED MY VEHICLE MAY 10, 2012.  I HAVE INQUIRED ABOUT THIS ISSUE MULTIPLE TIMES WHEN THE VEHICLE HAS BEEN IN TO THE PURCHASING DEALER FOR SERVICE AND WAS TOLD EACH TIME THAT "NO PROBLEM COULD BE FOUND OR DUPLICATED".',
  },
  {
    id: 1725,
    kind: 'complaint',
    externalId: '10969992',
    title: 'I HAVE BEEN EXPERINCING EXHAUST FUMES INSIDE THE VEHICLE WHEN I ACCELLARATE AT A',
    component: 'ENGINE',
    filedOn: '2017-04-02',
    body: 'I HAVE BEEN EXPERINCING EXHAUST FUMES INSIDE THE VEHICLE WHEN I ACCELLARATE AT A HIGH R.P.M.',
  },
  {
    id: 2130,
    kind: 'complaint',
    externalId: '10608674',
    title: 'WHEN ACCELERATING A STONG EXHAUST SMELL IS PRESENT IN THE VEHICLE CABIN.  THIS I',
    component: 'ENGINE AND ENGINE COOLING,UNKNOWN OR OTHER',
    filedOn: '2014-07-07',
    body: 'WHEN ACCELERATING A STONG EXHAUST SMELL IS PRESENT IN THE VEHICLE CABIN.  THIS IS MOST PRONOUNCED DURING A LONG ACCELERATION I.E. WHEN ENTERING A HIGHWAY.  FOLLOWING A PERIOD OF ACCELERATION WE NEED TO OPEN THE WINDOWS TO PURGE THE EXHAUST FROM THE CABIN.  THIS IS REGARDLESS OF THE HEATING/COOLING SYSTEM BEING ON OR OFF, OR IF THE RECIRCULATION FEATURE IS ENABLED.  THE DEALERSHIP IMPLEMENTED A TECHNICAL SERVICE BULLETIN FOR THIS CONDITION AND IT HAD NO IMPROVEMENT.   *JS',
  },
  {
    id: 1529,
    kind: 'complaint',
    externalId: '11064972',
    title: 'WHEN VEHICLE IS UNDER ACCELERATION, THERE IS AN EXHAUST SMELL THROUGHOUT THE CAB',
    component: 'ENGINE',
    filedOn: '2018-01-25',
    body: 'WHEN VEHICLE IS UNDER ACCELERATION, THERE IS AN EXHAUST SMELL THROUGHOUT THE CABIN.  FORD HAS ATTEMPTED TO CORRECT THE ISSUE, BUT THE EXHAUST SMELL REMAINS UNDER ACCELERATION.',
  },
  {
    id: 2248,
    kind: 'investigation',
    externalId: 'PE16008',
    title: 'Ford Explorer Exhaust Odor',
    component: 'ENGINE AND ENGINE COOLING:EXHAUST SYSTEM; STRUCTURE:BODY',
    filedOn: '2016-07-01',
    body: 'During the National Highway Traffic Safety Administration?s (NHTSA?s) investigation into the Ford carbon monoxide allegations, the Office of Defects Investigation (ODI) identified additional Vehicle Owner Questionnaire (VOQ) reports with similar exhaust odor claims.Presently, ODI has identified 791 VOQs for Model Year 2011-2017 Ford Explorers pertaining to exhaust odor claims.ODI has identified three crashes and 41 injuries potentially linked this issue.The reported injuries range from unspecified to loss of consciousness, with the majority being nausea, headaches, or dizziness ? all of which can be symptomatic of carbon monoxide exposure.Additionally, Ford provided 2,400 reports including owner complaints, warranty claims, dealer field reports, and legal claims, that involve 2,051 vehicles that may be connected to the exhaust odor issue.NHTSA\'s Vehicle Test and Research Center tested multiple vehicles, including complaint vehicles, during the investigation.ODI also conducted field inspections of complaint vehicles and crashes involving police units that occurred while the officers were on duty.When possible, data was collected to quantify carbon monoxide levels in the examined vehicles.Based on the information gathered to date, NHTSA upgraded this investigation to an Engineering Analysis (EA17-002).',
  },
  {
    id: 2245,
    kind: 'investigation',
    externalId: 'EA17002',
    title: 'Exhaust Odor in Passenger Cab',
    component: 'ENGINE AND ENGINE COOLING:EXHAUST SYSTEM:MANIFOLD/HEADER/MUFFLER/TAIL PIPE; STRUCTURE:BODY',
    filedOn: '2017-07-27',
    body: 'During the EA17-002 investigation, the agency reviewed and analyzed reports of exhaust odors in the passenger cabins of Model Year 2011 to 2017 Ford Explorers. This investigation required an approach that incorporated knowledge and expertise from the automotive, medical, environmental health, and occupational safety fields. The agency conducted an in-depth investigation that encompassed the review of over 6,500 consumer complaints, conducting field inspections, and testing the relevant vehicles, both independently and in coordination with Ford and other entities. During the investigation, the evolution of Ford service bulletins intended to reduce the level of exhaust odors and carbon monoxide (CO) entering the occupant compartment was examined and independent tests to evaluate the effectiveness of the final Field Service Actions (FSA) for both consumer and police vehicles were conducted. As part of the investigation, the agency also examined the effects of cracked exhaust mani-cats on the measured CO levels in the vehicles and tested the FSA repairs to ensure they did not adversely impact occupant compartment CO levels due to cracked mani-cats.The investigation identified upfitting issues for Police Interceptor vehicles. Upfitting (sirens, lights, cages, auxiliary power, etc.) is typically performed by governmental fleet operations, independent repair facilities, or local Ford dealers after the sale of the new vehicle. Sealing issues caused by upfitting were responsible for the highest measured carbon monoxide levels in tested vehicles. The police FSA instructs how to inspect the quality of the vehicle upfits and how to properly seal any leaks caused by these upfits, at no cost to the police agency. Similarly, the highest CO levels measured in consumer vehicles were usually traced to sealing issues caused by rear crash damage where the repairs did not ensure sealing integrity. The most recent Ford FSA procedure for both the police (17B25) and consumer vehicles (17N03) includes an HVAC reprogramming operation. Tests by Ford and NHTSA have demonstrated a substantial reduction of CO levels due solely to the HVAC reprogramming. Other FSA repairs also demonstrated measurable contributions to CO level reductions during controlled tests.Throughout the investigation, vehicles accurately measured with higher levels of carbon monoxide were almost always affected by upfitter alterations, damage, or other causes compromising rear passenger cabin seals.NHTSA received thousands of reports alleging odors which triggered a variety of physiological responses, predominately nausea, headaches, and lightheadedness. NHTSA focused the investigation on accurately measuring vehicle CO levels, and accurately measuring carboxyhemoglobin (COHB) levels from properly administered blood tests. Using rigorous test methods to produce exhaust gas intrusion in vehicles with a properly performed FSA, occupant compartment CO levels remained below current environmental limits for CO in any environment (EPA ambient air quality standards). Furthermore, even without FSA repairs, no vehicles unaffected by upfitter issues or prior crash damage were identified with CO levels that exceed accepted occupational CO exposure levels. This investigation finds that the 2011-2017 Ford Explorer vehicles when accurately measured produce occupant compartment CO levels which fall below current accepted health standards, and could not identify COHB levels for vehicle drivers or other occupants, which exceeded thresholds for acute physiological effects. Therefore, the agency has not identified a defect that represents an unreasonable risk to motor vehicle safety.This inve',
  },
];

/**
 * The ten citations that survived verification, with the offsets the
 * verifier matched. Three come from the same engineering analysis, and the
 * last of them is the agency's own conclusion that it found no defect — the
 * model quoted the finding that cuts against the owners rather than leaving it
 * out, which is what a citation schema buys.
 */
export const DEMO_CITATIONS = [
  { documentId: 1766, externalId: '10955503', kind: 'complaint', quote: 'ON ACCELERATION THE INSIDE OF THE CABIN HAS AN EXHAUST SMELL.', startOffset: 0, endOffset: 61 },
  { documentId: 1670, externalId: '11006419', kind: 'complaint', quote: 'EXHAUST SMELL OCCURS WHEN YOU ARE AT FULL THROTTLE, SUCH AS WHEN YOU ARE TRYING TO ENTER A HIGHWAY.', startOffset: 43, endOffset: 142 },
  { documentId: 1792, externalId: '10954200', kind: 'complaint', quote: 'WHEN ACCELERATING RAPIDLY A STRONG EXHAUST ODOR ENTERS THE CABIN OF THE VEHICLE. ODOR RESULTS IN HEADACHE AND AT TIMES NAUSEA.', startOffset: 0, endOffset: 126 },
  { documentId: 1725, externalId: '10969992', kind: 'complaint', quote: 'I HAVE BEEN EXPERINCING EXHAUST FUMES INSIDE THE VEHICLE WHEN I ACCELLARATE AT A HIGH R.P.M.', startOffset: 0, endOffset: 92 },
  { documentId: 2130, externalId: '10608674', kind: 'complaint', quote: 'THE DEALERSHIP IMPLEMENTED A TECHNICAL SERVICE BULLETIN FOR THIS CONDITION AND IT HAD NO IMPROVEMENT.', startOffset: 368, endOffset: 469 },
  { documentId: 1529, externalId: '11064972', kind: 'complaint', quote: 'FORD HAS ATTEMPTED TO CORRECT THE ISSUE, BUT THE EXHAUST SMELL REMAINS UNDER ACCELERATION.', startOffset: 85, endOffset: 175 },
  { documentId: 2248, externalId: 'PE16008', kind: 'investigation', quote: 'ODI has identified 791 VOQs for Model Year 2011-2017 Ford Explorers pertaining to exhaust odor claims.', startOffset: 277, endOffset: 379 },
  { documentId: 2245, externalId: 'EA17002', kind: 'investigation', quote: 'the agency reviewed and analyzed reports of exhaust odors in the passenger cabins of Model Year 2011 to 2017 Ford Explorers', startOffset: 35, endOffset: 158 },
  { documentId: 2245, externalId: 'EA17002', kind: 'investigation', quote: 'includes an HVAC reprogramming operation', startOffset: 2003, endOffset: 2043 },
  { documentId: 2245, externalId: 'EA17002', kind: 'investigation', quote: 'the agency has not identified a defect that represents an unreasonable risk to motor vehicle safety', startOffset: 3573, endOffset: 3672 },
];

/** The answer as the API returned it, and the verdicts and counts beside it. */
export const DEMO_ANSWER = {
  text:
    'Yes — this is a well-documented complaint on 2011-2017 Explorers. Many owners report the same '
    + 'thing: a strong exhaust odor in the cabin that shows up mainly under hard acceleration, such '
    + 'as merging onto a highway, and some report headaches or nausea. NHTSA opened an investigation '
    + 'and reviewed thousands of reports; Ford issued service bulletins and field service actions '
    + '(including HVAC reprogramming), though some owners say the smell came back after the dealer '
    + 'repair, and NHTSA ultimately concluded it did not find a defect posing an unreasonable safety '
    + 'risk.',
  isGrounded: true,
  isKnownPattern: true,
  droppedCitationCount: 0,
  // No recall campaign is linked, because there was none: the investigation
  // closed without one, and the answer says so.
  linkedCampaigns: [],
  // What the campaign pool retrieved. Both were quoted, so the product shows
  // them as cited records and has nothing to list as unverified.
  campaignMatches: [
    { documentId: 2248, kind: 'investigation', externalId: 'PE16008', title: 'Ford Explorer Exhaust Odor' },
    { documentId: 2245, kind: 'investigation', externalId: 'EA17002', title: 'Exhaust Odor in Passenger Cab' },
  ],
  // The citation opened on the verified-quote screen: the dealer's fix that
  // did not work, highlighted 368 characters into an owner's complaint. Chosen
  // over the ones at offset zero because a highlight in the middle of a
  // narrative is the picture of an offset, not a prefix.
  openedCitationIndex: 4,
};

/**
 * The constant in reciprocal rank fusion, 1 / (k + rank). Sixty is the value
 * the original paper proposed and the one the product uses; the API rounds the
 * resulting score to five places.
 */
export const RECIPROCAL_RANK_FUSION_CONSTANT = 60;

/**
 * The search typed into the Search tab and the ten hits the API returned in
 * combined mode, in the order it returned them.
 *
 * The top result was neither method's first choice — sixteenth by meaning,
 * twenty-second by keyword — and it wins because both methods found it. The
 * record meaning search ranked first was not in keyword's top fifty at all,
 * and sits fifth. That is what fusion does, and the cards say so.
 */
export const DEMO_SEARCH = {
  query: 'exhaust smell in cabin',
  mode: 'hybrid',
  hits: [
    { documentId: 1086, kind: 'complaint', externalId: '11277694', title: 'EXHAUST SMELL IN THE CABIN WHEN DRIVING. CHECKED THE DOOR SEALS AND OTHER PLACES', component: 'UNKNOWN OR OTHER', filedOn: '2019-11-02', snippet: 'EXHAUST SMELL IN THE CABIN WHEN DRIVING. CHECKED THE DOOR SEALS AND OTHER PLACES WHERE IT COULD BE COMING FROM AND FOUND NO BREAKS IN THEM. THAT LEAVES THE EXHAUST SYSTEM COULD BE LEAKING INTO THE CABIN', denseRank: 16, sparseRank: 22, fusedScore: 0.02535 },
    { documentId: 2132, kind: 'complaint', externalId: '10607685', title: 'EXHAUST SMELL, OR ACRID BURNING SMELL IN CABIN OFF AND ON SINCE NEW, AND ESPECIA', component: 'ENGINE AND ENGINE COOLING', filedOn: '2014-07-02', snippet: 'EXHAUST SMELL, OR ACRID BURNING SMELL IN CABIN OFF AND ON SINCE NEW, AND ESPECIALLY DURING HIGHER SPEED ACCELERATION... SUSPECT EXHAUST FUMES ENTERING CABIN... *TR', denseRank: 23, sparseRank: 20, fusedScore: 0.02455 },
    { documentId: 906, kind: 'complaint', externalId: '11386156', title: 'SMELLING A WEIRD SMELL COMING FROM THE CABIN LIKE CARBON MONOXIDE SMELL .', component: 'UNKNOWN OR OTHER,ENGINE,FUEL/PROPULSION SYSTEM', filedOn: '2021-01-02', snippet: 'SMELLING A WEIRD SMELL COMING FROM THE CABIN LIKE CARBON MONOXIDE SMELL .', denseRank: 10, sparseRank: 45, fusedScore: 0.02381 },
    { documentId: 1670, kind: 'complaint', externalId: '11006419', title: 'SMELLING EXHAUST ODORS INSIDE THE VEHICLE. EXHAUST SMELL OCCURS WHEN YOU ARE AT', component: 'UNKNOWN OR OTHER', filedOn: '2017-07-19', snippet: 'SMELLING EXHAUST ODORS INSIDE THE VEHICLE. EXHAUST SMELL OCCURS WHEN YOU ARE AT FULL THROTTLE, SUCH AS WHEN YOU ARE TRYING TO ENTER A HIGHWAY. THE SMELL STAYS IN THE VEHICLE, AND IT IS VERY STRONG.', denseRank: 40, sparseRank: 31, fusedScore: 0.02099 },
    { documentId: 1419, kind: 'complaint', externalId: '11120903', title: 'EXHAUST SMELL IN THE CAB', component: 'UNKNOWN OR OTHER', filedOn: '2018-08-19', snippet: 'EXHAUST SMELL IN THE CAB', denseRank: 1, sparseRank: null, fusedScore: 0.01639 },
    { documentId: 1610, kind: 'complaint', externalId: '11021156', title: "I'VE NOTICED THIS SMELL EVERY TIME I TURNED MY CAR ON/OFF OR WOULD GET FINISHED", component: 'UNKNOWN OR OTHER,ENGINE,FUEL/PROPULSION SYSTEM', filedOn: '2017-09-02', snippet: "I'VE NOTICED THIS SMELL EVERY TIME I TURNED MY CAR ON/OFF OR WOULD GET FINISHED DRIVING. IT WOULD BE IN THE DRIVERS CABIN DOWN AT THE FLOOR WHERE IT CAME FROM. I FIRST NOTICED IT THERE AND HAD MENTIONED IT TO FORD WHEN THERE FOR SERVICE. IT…", denseRank: null, sparseRank: 1, fusedScore: 0.01639 },
    { documentId: 1629, kind: 'complaint', externalId: '11015629', title: 'EXHAUST SMELL INSIDE CABIN, ESPECIALLY WHEN STATIONARY', component: 'UNKNOWN OR OTHER', filedOn: '2017-08-16', snippet: 'EXHAUST SMELL INSIDE CABIN, ESPECIALLY WHEN STATIONARY', denseRank: 2, sparseRank: null, fusedScore: 0.01613 },
    { documentId: 2051, kind: 'complaint', externalId: '10733802', title: 'UNTIL THIS LAST WEEKEND, WE OWNED A 2013 FORD EXPLORER.  WE NOTICED AN EXHAUST S', component: 'ENGINE', filedOn: '2015-07-13', snippet: 'UNTIL THIS LAST WEEKEND, WE OWNED A 2013 FORD EXPLORER. WE NOTICED AN EXHAUST SMELL IN THE CABIN SOON AFTER WE PURCHASED THE VEHICLE, BUT THOUGHT IT WAS JUST "NEW ENGINE SMELL." ON TRIPS ACCELERATING UP MOUNTAINS THE EXHAUST SMELL IN THE…', denseRank: null, sparseRank: 2, fusedScore: 0.01613 },
    { documentId: 1672, kind: 'complaint', externalId: '11006173', title: 'EXHAUST FUMES IN CABIN.', component: 'UNKNOWN OR OTHER', filedOn: '2017-07-18', snippet: 'EXHAUST FUMES IN CABIN.', denseRank: 3, sparseRank: null, fusedScore: 0.01587 },
    { documentId: 2093, kind: 'complaint', externalId: '10681254', title: 'IN DECEMBER 2014, SEVERAL PATROL OFFICERS FROM THE YARMOUTH POLICE DEPARTMENT RE', component: 'ENGINE AND ENGINE COOLING', filedOn: '2015-01-20', snippet: 'IN DECEMBER 2014, SEVERAL PATROL OFFICERS FROM THE YARMOUTH POLICE DEPARTMENT REPORTED THE ODOR OF EXHAUST FUMES IN THE PASSENGER COMPARTMENT OF A 2013 FORD EXPLORER INTERCEPTOR SUV THEY HAD BEEN OPERATING. WHILE SITTING STATIONARY WITH THE…', denseRank: null, sparseRank: 3, fusedScore: 0.01587 },
  ],
};

/**
 * The latest evaluation run as the API reports it — the same run committed in
 * the product's eval/results.json, and the finding the README explains at
 * length: meaning search scoring zero against every record, and 0.400 against
 * the official records alone.
 */
export const DEMO_EVALUATION = {
  runId: 4,
  ranAt: '2026-09-06T09:55:55.1263-04:00',
  caseCount: 80,
  earlierRunCount: 3,
  metrics: {
    sparse: { recallAt5: 0.075, recallAt10: 0.125, mrr: 0.05666666666666668 },
    dense: { recallAt5: 0, recallAt10: 0, mrr: 0 },
    hybrid: { recallAt5: 0, recallAt10: 0, mrr: 0 },
    campaignsSparse: { recallAt5: 0.375, recallAt10: 0.375, mrr: 0.375 },
    campaignsDense: { recallAt5: 0.325, recallAt10: 0.4, mrr: 0.2833333333333333 },
    campaignsHybrid: { recallAt5: 0.375, recallAt10: 0.4, mrr: 0.2791666666666667 },
  },
  // The run measured retrieval only; answering was not part of it.
  faithfulness: null,
};
