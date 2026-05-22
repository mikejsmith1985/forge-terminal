// Client-side renderer for the recruiter-facing product portfolio microsite.

import { PORTFOLIO_APPS } from './data/apps.mjs';

function createFeatureImage(feature, app) {
  const imagePath = feature.imagePath ?? `./assets/generated/${app.slug}-${feature.id}.svg`;
  const imageKindLabels = {
    'real-ui': 'Live product capture',
    'code-rendered': 'Code-rendered mock interface',
    storyboard: 'Concept rendering',
  };
  const imageKindLabel = imageKindLabels[feature.imageKind] ?? 'Portfolio visual';

  return `
    <div class="feature-preview">
      <img src="${imagePath}" alt="${app.name} - ${feature.title}" />
      <div class="feature-preview__overlay">
        <span>${imageKindLabel}</span>
        <span>${feature.title}</span>
      </div>
    </div>
  `;
}

function createFeatureCard(feature, app) {
  return `
    <article class="feature-card">
      ${createFeatureImage(feature, app)}
      <div class="feature-copy">
        <div class="feature-label">Mocked UI in action</div>
        <h3>${feature.title}</h3>
        <p>${feature.whatItShows}</p>
        <p><strong>Why it matters:</strong> ${feature.wowFactor}</p>
        <p class="feature-evidence"><strong>Sample data shown:</strong> ${feature.mockDataApproach}</p>
      </div>
    </article>
  `;
}

function createAppSection(app) {
  const featureCardsMarkup = app.features.map((feature) => createFeatureCard(feature, app)).join('');
  const techStackMarkup = app.techStack.map((techItem) => `<span>${techItem}</span>`).join('');

  return `
    <section class="portfolio-app" style="--app-accent:${app.accent}">
      <div class="app-header">
        <div>
          <div class="section-kicker">${app.category}</div>
          <h2>${app.name}</h2>
          <p class="app-tagline">${app.tagline}</p>
          <p class="app-summary">${app.summary}</p>
          <div class="app-tech-stack">${techStackMarkup}</div>
        </div>
        <aside class="app-aside">
          <h3>Product snapshot</h3>
          <div class="app-meta">
            <span>Surface: ${app.launchSurface}</span>
            <span>Highlights: ${app.features.length}</span>
          </div>
          <p class="feature-evidence">${app.proofNote}</p>
        </aside>
      </div>
      <div class="feature-grid">${featureCardsMarkup}</div>
    </section>
  `;
}

function renderPortfolio() {
  const portfolioContainer = document.getElementById('portfolio-apps');
  if (!portfolioContainer) {
    throw new Error('Portfolio root element was not found.');
  }

  portfolioContainer.innerHTML = PORTFOLIO_APPS.map((app) => createAppSection(app)).join('');
}

renderPortfolio();
