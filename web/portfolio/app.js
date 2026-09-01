// Client-side renderer for the engineering portfolio.
//
// The page argues one thing — that agent-directed work can be held to a normal
// engineering standard — and every section is a different kind of evidence for
// it: a checkable number, a product surface, or a debugging story where the
// obvious answer was wrong. All content comes from generated data modules so
// the page can never drift from what the repository actually contains.

import { PORTFOLIO_APPS } from './data/apps.mjs?v=20260826-architecture';
import {
  ARCHITECTURE_CONTROL_PLANE,
  ARCHITECTURE_FLOW,
  ARCHITECTURE_NODE_KINDS,
  ARCHITECTURE_OBSERVABILITY,
  ARCHITECTURE_ROUTES,
  ARCHITECTURE_STATE_OBJECT,
  ENGINEERING_CASE_STUDIES,
  PORTFOLIO_PROOF_STATS,
  PORTFOLIO_THESIS,
} from './data/narrative.mjs?v=20260826-architecture';

// Forge Terminal is the flagship because it is the tooling that enforces the
// standard the rest of the page claims. Everything else is supporting breadth.
const FLAGSHIP_APP_SLUG = 'forge-terminal';

// These get their own full-width tier rather than a grid cell. None is the
// flagship — Forge Terminal is the machinery the thesis is about — but each
// carries the same argument in a different domain: U2 Counter refuses to quote
// a figure it cannot trace to a lookup, LG-Builder refuses to proceed without a
// human, NodeToolbox refuses to guess at a number. U2 Counter leads the tier
// because its opening line is the one a reader will remember.
const DEPTH_APP_SLUGS = ['u2-counter', 'lgbuilder', 'nodetoolbox'];

// Only one product carries an architecture diagram; the rest are product tours.
const ARCHITECTURE_APP_SLUG = 'lgbuilder';

// Screenshot filenames are stable across rebuilds, so a returning visitor's
// browser serves the old image until its cache expires. Bump this whenever the
// assets are regenerated so a redeploy is never invisible.
const ASSET_VERSION = '20260830-u2-counter';

// The repository handle lives here rather than in the generated data, because
// that data file is scanned for exactly this string as a sign that a local path
// has leaked into published copy. An app's links therefore carry a repo-relative
// path and this constant supplies the rest.
const GITHUB_REPO_BASE_URL = 'https://github.com/mikejsmith1985/';
const GITHUB_COMMIT_BASE_URL = `${GITHUB_REPO_BASE_URL}forge-terminal/commit/`;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function selectElement(selector) {
  const element = document.querySelector(selector);
  if (!element) {
    throw new Error(`Portfolio markup is missing the required element "${selector}".`);
  }
  return element;
}

// ── Thesis ──────────────────────────────────────────────────────────────────

function renderThesis() {
  selectElement('.thesis__role').textContent = PORTFOLIO_THESIS.role;
  selectElement('#thesis-heading').textContent = PORTFOLIO_THESIS.headline;
  selectElement('.thesis__statement').textContent = PORTFOLIO_THESIS.statement;
  selectElement('.thesis__stack').innerHTML = createStackChips(PORTFOLIO_THESIS.stack);
  selectElement('.thesis__lead').innerHTML = createLeadArtifact();

  selectElement('.thesis__pillars').innerHTML = PORTFOLIO_THESIS.subclaims
    .map((subclaim) => `
      <li>
        <h3>${escapeHtml(subclaim.title)}</h3>
        <p>${escapeHtml(subclaim.detail)}</p>
      </li>`)
    .join('');
}

/** Emits the stack a recruiter scans for before reading a word of prose. */
function createStackChips(stack) {
  return stack
    .map((technology) => `<span>${escapeHtml(technology)}</span>`)
    .join('');
}

/**
 * Emits the first artefact, so something built appears before any argument.
 *
 * The page used to put its first image 2,548 pixels down — roughly three
 * screens of prose before a reader saw anything that had been made. This puts
 * one in the opening screen, and picks the artefact that answers "can this
 * person do the work" rather than the one that answers "how do they know it is
 * right".
 */
function createLeadArtifact() {
  const lead = PORTFOLIO_THESIS.leadArtifact;
  const app = PORTFOLIO_APPS.find((candidate) => candidate.slug === lead.appSlug);
  const feature = app?.features.find((candidate) => candidate.id === lead.featureId);

  if (!app || !feature) {
    throw new Error(`The lead artefact ${lead.appSlug}/${lead.featureId} is missing from the portfolio data.`);
  }

  return `
    <figure class="lead-artifact">
      <img src="${escapeHtml(feature.imagePath)}?v=${escapeHtml(ASSET_VERSION)}"
           alt="${escapeHtml(app.name)} — ${escapeHtml(feature.title)}" />
      <figcaption>
        <p class="lead-artifact__claim">${escapeHtml(lead.claim)}</p>
        <p class="lead-artifact__detail">${escapeHtml(lead.detail)}</p>
      </figcaption>
    </figure>`;
}

// ── Checkable numbers ───────────────────────────────────────────────────────

function renderProofStats() {
  selectElement('.proof-strip__grid').innerHTML = PORTFOLIO_PROOF_STATS
    .map((proofStat) => `
      <article class="proof-stat">
        <p class="proof-stat__value">${escapeHtml(proofStat.value)}</p>
        <p class="proof-stat__label">${escapeHtml(proofStat.label)}</p>
        <p class="proof-stat__detail">${escapeHtml(proofStat.detail)}</p>
        <code class="proof-stat__command">${escapeHtml(proofStat.verifyCommand)}</code>
      </article>`)
    .join('');
}

// ── Product surfaces ────────────────────────────────────────────────────────

function createFeatureFigure(feature, app, figureClassName) {
  if (!feature.imagePath) {
    throw new Error(`${app.name} feature "${feature.id}" is missing a PNG imagePath.`);
  }

  return `
    <figure class="${escapeHtml(figureClassName)}">
      <img
        src="${escapeHtml(feature.imagePath)}?v=${escapeHtml(ASSET_VERSION)}"
        alt="${escapeHtml(`${app.name} — ${feature.title}`)}"
        loading="lazy"
      />
      <figcaption>
        <h4>${escapeHtml(feature.title)}</h4>
        <p class="figure-why">${escapeHtml(feature.wowFactor)}</p>
        <p class="figure-shows">${escapeHtml(feature.whatItShows)}</p>
      </figcaption>
    </figure>`;
}

function createTechStack(app) {
  return `<div class="tech-stack">${app.techStack
    .map((technology) => `<span>${escapeHtml(technology)}</span>`)
    .join('')}</div>`;
}

/**
 * Emits the line an entry leads with, for the entries that have one.
 *
 * Set above the tagline rather than inside the summary because it is a claim in
 * its own right and reads as weaker the moment it is surrounded by other
 * sentences.
 */
function createHeadline(app) {
  return app.headline
    ? `<p class="app-headline">${escapeHtml(app.headline)}</p>`
    : '';
}

/** Emits the short claims an entry rests on, each one checkable or an admission. */
function createKeyPoints(app) {
  if (!app.keyPoints) {
    return '';
  }

  const pointsMarkup = app.keyPoints
    .map((keyPoint) => `<li>${escapeHtml(keyPoint)}</li>`)
    .join('');

  return `<ul class="app-key-points">${pointsMarkup}</ul>`;
}

/**
 * Emits an entry's outbound links, resolved against the repository base URL.
 *
 * Each link carries a repo-relative path rather than a full address, so the
 * generated data file never contains the handle the leak scanner looks for.
 */
function createAppLinks(app) {
  if (!app.links) {
    return '';
  }

  const linksMarkup = app.links
    .map((appLink) => `
      <a class="app-link" href="${escapeHtml(GITHUB_REPO_BASE_URL)}${escapeHtml(appLink.repoPath)}" rel="noopener">
        ${escapeHtml(appLink.label)}
      </a>`)
    .join('');

  return `<div class="app-links">${linksMarkup}</div>`;
}

/** Emits the mount point for the architecture diagram, for the one app that has one. */
function createArchitectureSlot(appSlug) {
  return appSlug === ARCHITECTURE_APP_SLUG ? '<div class="architecture-slot"></div>' : '';
}

/** Reports whether a feature is the one already shown in the hero. */
function isLeadArtifact(appSlug, featureId) {
  const lead = PORTFOLIO_THESIS.leadArtifact;
  return lead.appSlug === appSlug && lead.featureId === featureId;
}

function renderFullWidthApp(appSlug, sectionSelector, kicker, figureClassName) {
  const portfolioApp = PORTFOLIO_APPS.find((app) => app.slug === appSlug);
  if (!portfolioApp) {
    throw new Error(`The product "${appSlug}" is missing from the portfolio data.`);
  }

  const headingId = `${appSlug}-heading`;

  // The hero already shows one artefact in full. Repeating it here reads as
  // padding — the reader recognises the picture, learns nothing, and starts
  // skimming the section that was meant to hold their attention.
  const figuresMarkup = portfolioApp.features
    .filter((feature) => !isLeadArtifact(portfolioApp.slug, feature.id))
    .map((feature) => createFeatureFigure(feature, portfolioApp, figureClassName))
    .join('');

  selectElement(sectionSelector).innerHTML = `
    <div class="section-intro">
      <p class="kicker">${escapeHtml(kicker)}</p>
      ${createHeadline(portfolioApp)}
      <h2 id="${escapeHtml(headingId)}">${escapeHtml(portfolioApp.name)}</h2>
      <p class="flagship__tagline">${escapeHtml(portfolioApp.tagline)}</p>
      <p>${escapeHtml(portfolioApp.summary)}</p>
      ${createKeyPoints(portfolioApp)}
      ${createTechStack(portfolioApp)}
      ${createAppLinks(portfolioApp)}
      <p class="evidence-note">${escapeHtml(portfolioApp.proofNote)}</p>
    </div>
    ${createArchitectureSlot(appSlug)}
    <div class="flagship__figures">${figuresMarkup}</div>`;
}

function renderFlagship() {
  renderFullWidthApp(FLAGSHIP_APP_SLUG, '#flagship', 'Flagship', 'flagship-figure');
}

function renderDepth() {
  const depthSection = selectElement('#depth');
  depthSection.innerHTML = DEPTH_APP_SLUGS
    .map((appSlug) => `<div class="depth-entry" data-app="${escapeHtml(appSlug)}"></div>`)
    .join('');

  DEPTH_APP_SLUGS.forEach((appSlug) => {
    renderFullWidthApp(appSlug, `#depth [data-app="${appSlug}"]`, 'Depth', 'flagship-figure');
  });
}

function renderSupportingProducts() {
  const promotedSlugs = [FLAGSHIP_APP_SLUG, ...DEPTH_APP_SLUGS];
  const supportingApps = PORTFOLIO_APPS.filter((app) => !promotedSlugs.includes(app.slug));

  selectElement('.products__list').innerHTML = supportingApps
    .map((app) => `
      <article class="product-card">
        <header>
          <h3>${escapeHtml(app.name)}</h3>
          <p class="product-card__category">${escapeHtml(app.category)}</p>
          <p class="product-card__tagline">${escapeHtml(app.tagline)}</p>
          ${createTechStack(app)}
        </header>
        <div class="product-card__figures">
          ${app.features.map((feature) => createFeatureFigure(feature, app, 'product-figure')).join('')}
        </div>
      </article>`)
    .join('');
}


// ── Architecture ────────────────────────────────────────────────────────────
// Rendered as markup rather than an image so it reflows on a narrow screen and
// keeps the page's type scale. A scaled-down SVG would put 8px text on a phone,
// and recruiters open these links from phones.

function createArchitectureNode(architectureStep) {
  const nodeNameMarkup = architectureStep.nodeName
    ? `<code class="arch-node__name">${escapeHtml(architectureStep.nodeName)}</code>`
    : '';

  return `
    <li class="arch-node arch-node--${escapeHtml(architectureStep.kind)}">
      <span class="arch-node__kind">${escapeHtml(architectureStep.kind)}</span>
      <h4>${escapeHtml(architectureStep.title)}</h4>
      ${nodeNameMarkup}
      <p>${escapeHtml(architectureStep.detail)}</p>
    </li>`;
}

function createArchitectureRoute(architectureRoute) {
  const stepsMarkup = architectureRoute.steps.map(createArchitectureNode).join('');
  const loopMarkup = architectureRoute.loopsBackTo
    ? `<p class="arch-route__loop">↺ back to
        <code>${escapeHtml(architectureRoute.loopsBackTo)}</code> —
        ${escapeHtml(architectureRoute.loopNote)}</p>`
    : `<p class="arch-route__end">${escapeHtml(architectureRoute.endsAt)}</p>`;

  return `
    <section class="arch-route arch-route--${escapeHtml(architectureRoute.tone)}">
      <header>
        <code class="arch-route__label">${escapeHtml(architectureRoute.label)}</code>
        <span class="arch-route__summary">${escapeHtml(architectureRoute.summary)}</span>
      </header>
      <ol class="arch-node-list">${stepsMarkup}</ol>
      ${loopMarkup}
    </section>`;
}

function createArchitectureLegend() {
  return `<ul class="arch-legend">${ARCHITECTURE_NODE_KINDS.map((nodeKind) => `
    <li class="arch-legend__item arch-node--${escapeHtml(nodeKind.id)}">
      <b>${escapeHtml(nodeKind.label)}</b> ${escapeHtml(nodeKind.detail)}
    </li>`).join('')}</ul>`;
}

function createObservabilityCallout() {
  return `
    <div class="arch-observability">
      <h4>Three layers, three different questions</h4>
      <dl>${ARCHITECTURE_OBSERVABILITY.map((observabilityLayer) => `
        <div>
          <dt>${escapeHtml(observabilityLayer.layer)}
            <span>${escapeHtml(observabilityLayer.scope)}</span></dt>
          <dd>${escapeHtml(observabilityLayer.answers)}</dd>
        </div>`).join('')}</dl>
    </div>`;
}

function createControlPlaneCallout() {
  const stagesMarkup = ARCHITECTURE_CONTROL_PLANE.stages.map((controlStage) => `
    <li><b>${escapeHtml(controlStage.label)}</b> ${escapeHtml(controlStage.detail)}</li>`).join('');

  return `
    <aside class="arch-control-plane">
      <h4>${escapeHtml(ARCHITECTURE_CONTROL_PLANE.title)}</h4>
      <p>${escapeHtml(ARCHITECTURE_CONTROL_PLANE.detail)}</p>
      <ol>${stagesMarkup}</ol>
    </aside>`;
}

function renderArchitecture() {
  const architectureHost = document.querySelector(
    `#depth [data-app="${ARCHITECTURE_APP_SLUG}"] .architecture-slot`,
  );
  if (!architectureHost) {
    throw new Error('The architecture slot is missing from the LG-Builder entry.');
  }

  // Collapsed by default. The diagram is the deepest thing on the page and cost
  // every reader roughly a screen and a half to scroll past, including the ones
  // who leave in fifteen seconds. Anybody who wants it opens it; nobody has to
  // pay for it. Demotion rather than deletion — it is still the strongest thing
  // in this entry for the reader who reaches it.
  architectureHost.innerHTML = `
    <details class="arch-details">
    <summary class="arch-summary">How a ticket moves through the graph — the compiled graph, node by node</summary>
    <h3 class="arch-heading">How a ticket moves through the graph</h3>
    <p class="arch-intro">Every box below is a node the compiled graph registers, named exactly as
      the orchestrator names it. State travels between them as
      <code>${escapeHtml(ARCHITECTURE_STATE_OBJECT)}</code>.</p>
    ${createArchitectureLegend()}
    <ol class="arch-node-list arch-node-list--trunk">
      ${ARCHITECTURE_FLOW.map(createArchitectureNode).join('')}
    </ol>
    <p class="arch-branch-label">One decision, four routes</p>
    <div class="arch-routes">${ARCHITECTURE_ROUTES.map(createArchitectureRoute).join('')}</div>
    ${createControlPlaneCallout()}
    ${createObservabilityCallout()}
    </details>`;
}

// ── Debugging case studies ──────────────────────────────────────────────────

function createCaseStudyBeat(beatLabel, beatText, beatModifier) {
  return `
    <div class="beat beat--${escapeHtml(beatModifier)}">
      <p class="beat__label">${escapeHtml(beatLabel)}</p>
      <p class="beat__text">${escapeHtml(beatText)}</p>
    </div>`;
}

function renderCaseStudies() {
  selectElement('.case-studies__list').innerHTML = ENGINEERING_CASE_STUDIES
    .map((caseStudy, caseStudyIndex) => `
      <article class="case-study">
        <header class="case-study__header">
          <span class="case-study__index">${escapeHtml(String(caseStudyIndex + 1).padStart(2, '0'))}</span>
          <div>
            <h3>${escapeHtml(caseStudy.title)}</h3>
            <p class="case-study__lesson">${escapeHtml(caseStudy.lesson)}</p>
          </div>
        </header>
        <div class="case-study__beats">
          ${createCaseStudyBeat('Symptom', caseStudy.symptom, 'symptom')}
          ${createCaseStudyBeat('The obvious answer', caseStudy.assumedCause, 'wrong')}
          ${createCaseStudyBeat('Actual cause', caseStudy.actualCause, 'actual')}
          ${createCaseStudyBeat('Why it mattered', caseStudy.whyItMattered, 'insight')}
          ${createCaseStudyBeat('Proof', caseStudy.proof, 'proof')}
        </div>
        <footer class="case-study__footer">
          <a href="${escapeHtml(GITHUB_COMMIT_BASE_URL)}${escapeHtml(caseStudy.reference.commitSha)}" rel="noopener">
            Read the change — PR #${escapeHtml(caseStudy.reference.pullRequestNumber)}
          </a>
        </footer>
      </article>`)
    .join('');
}

// ── Colophon ────────────────────────────────────────────────────────────────

function renderColophon() {
  const totalFeatureCount = PORTFOLIO_APPS.reduce(
    (runningTotal, app) => runningTotal + app.features.length,
    0,
  );

  selectElement('.colophon__meta').textContent =
    `${PORTFOLIO_APPS.length} applications · ${totalFeatureCount} product screens · `
    + `${ENGINEERING_CASE_STUDIES.length} debugging case studies`;
}

renderThesis();
renderProofStats();
renderFlagship();
renderDepth();
renderArchitecture();
renderCaseStudies();
renderSupportingProducts();
renderColophon();
