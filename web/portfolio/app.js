// Client-side renderer for the engineering portfolio.
//
// The page argues one thing — that agent-directed work can be held to a normal
// engineering standard — and every section is a different kind of evidence for
// it: a checkable number, a product surface, or a debugging story where the
// obvious answer was wrong. All content comes from generated data modules so
// the page can never drift from what the repository actually contains.

import { PORTFOLIO_APPS } from './data/apps.mjs?v=20260826-thesis-rebuild';
import {
  ENGINEERING_CASE_STUDIES,
  PORTFOLIO_PROOF_STATS,
  PORTFOLIO_THESIS,
} from './data/narrative.mjs?v=20260826-thesis-rebuild';

// Forge Terminal is the flagship because it is the tooling that enforces the
// standard the rest of the page claims. Everything else is supporting breadth.
const FLAGSHIP_APP_SLUG = 'forge-terminal';

// These get their own full-width tier rather than a grid cell. Neither is the
// flagship — Forge Terminal is the machinery the thesis is about — but each
// carries the same argument in a different domain: LG-Builder refuses to
// proceed without a human, NodeToolbox refuses to guess at a number.
const DEPTH_APP_SLUGS = ['lgbuilder', 'nodetoolbox'];

// Screenshot filenames are stable across rebuilds, so a returning visitor's
// browser serves the old image until its cache expires. Bump this whenever the
// assets are regenerated so a redeploy is never invisible.
const ASSET_VERSION = '20260826-fuller-terminals';

const GITHUB_COMMIT_BASE_URL = 'https://github.com/mikejsmith1985/forge-terminal/commit/';

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
  selectElement('#thesis-heading').textContent = PORTFOLIO_THESIS.headline;
  selectElement('.thesis__statement').textContent = PORTFOLIO_THESIS.statement;

  selectElement('.thesis__pillars').innerHTML = PORTFOLIO_THESIS.subclaims
    .map((subclaim) => `
      <li>
        <h3>${escapeHtml(subclaim.title)}</h3>
        <p>${escapeHtml(subclaim.detail)}</p>
      </li>`)
    .join('');
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

function renderFullWidthApp(appSlug, sectionSelector, kicker, figureClassName) {
  const portfolioApp = PORTFOLIO_APPS.find((app) => app.slug === appSlug);
  if (!portfolioApp) {
    throw new Error(`The product "${appSlug}" is missing from the portfolio data.`);
  }

  const headingId = `${appSlug}-heading`;
  const figuresMarkup = portfolioApp.features
    .map((feature) => createFeatureFigure(feature, portfolioApp, figureClassName))
    .join('');

  selectElement(sectionSelector).innerHTML = `
    <div class="section-intro">
      <p class="kicker">${escapeHtml(kicker)}</p>
      <h2 id="${escapeHtml(headingId)}">${escapeHtml(portfolioApp.name)}</h2>
      <p class="flagship__tagline">${escapeHtml(portfolioApp.tagline)}</p>
      <p>${escapeHtml(portfolioApp.summary)}</p>
      ${createTechStack(portfolioApp)}
      <p class="evidence-note">${escapeHtml(portfolioApp.proofNote)}</p>
    </div>
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
renderCaseStudies();
renderSupportingProducts();
renderColophon();
