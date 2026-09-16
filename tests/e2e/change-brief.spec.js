// Proves a published change brief actually reaches the developer's screen —
// and stays out of their way until they are ready for it.
//
// The unit tests drive a mounted component; this drives the running
// application. That distinction matters more than usual here, because the
// failure being guarded against is silent: by the time a brief is published the
// commit gate is already satisfied, so a brief that never renders leaves the
// developer believing they reviewed a change they never saw.
//
// Three things are proven. The restore path: the brief is written to disk
// exactly as the publishing tool writes it, and the page is then loaded — real
// backend code, no test-only hook. The live path: a CHANGE_BRIEF frame arrives
// on a tab's real terminal socket, as the publishing tool pushes it. And the
// tab discipline: a brief waits as a pill on the tab it belongs to, opens into
// a dock that scrolls instead of outgrowing the window, and never covers a
// tab whose work it does not describe — which is what it used to do.
//
// Runs against the dev instance on :9999 started by run-dev-clean.ps1, never
// against production on :3005.

const { test, expect } = require('@playwright/test');
const { visitWithoutTour } = require('../fixtures/forge');
const fs = require('node:fs');
const path = require('node:path');

const DEV_BASE_URL = 'http://localhost:9999';
const BRIEF_DIRECTORY = path.join(process.cwd(), '.forge', 'briefs');
const BRIEF_ID = 'brief-e2e-001';

// Small enough that a long brief cannot fit, so the dock has to scroll.
const SHORT_VIEWPORT = { width: 1280, height: 720 };

test.use({ baseURL: DEV_BASE_URL });

/** A brief with enough substance to pass validation. */
function sampleBrief() {
  return {
    briefId: BRIEF_ID,
    sessionId: '',
    taskId: 'task-e2e-001',
    headline: 'Folders now give up their path on a right-click',
    whatChanged: 'Right-clicking a folder offers Copy Path in the file tree and the projects browser.',
    whyItChanged: 'Copy Path existed on files only, so a folder path could not be got out of the interface.',
    whatCouldBreak: 'The clipboard is unavailable outside a secure context, so a copy now reports failure.',
    isRoutine: false,
    filesTouched: 6,
    publishedAt: new Date().toISOString(),
    decisions: [{
      chose: 'One shared context menu used by both surfaces',
      insteadOf: 'A separate menu implementation for each surface',
      because: 'Two menus drift apart in dismissal and positioning.',
      openQuestion: 'Is the shared menu worth coupling two unrelated panels?',
    }],
  };
}

test.beforeAll(() => {
  fs.mkdirSync(BRIEF_DIRECTORY, { recursive: true });
  fs.writeFileSync(
    path.join(BRIEF_DIRECTORY, `${BRIEF_ID}.json`),
    JSON.stringify(sampleBrief(), null, 2),
    'utf8',
  );
});

test.afterAll(() => {
  // The brief directory is real project state, so the test cleans up after
  // itself rather than leaving a fabricated brief for the developer to find.
  fs.rmSync(path.join(BRIEF_DIRECTORY, `${BRIEF_ID}.json`), { force: true });
});

/** Loads the app, waits for the restored brief's pill, and opens it. */
async function openWithRestoredBrief(page) {
  await page.goto('/');
  await page.locator('.brief-pill').waitFor({ timeout: 20000 });
  await page.locator('.brief-pill').click();
  await page.locator('.change-brief').waitFor({ timeout: 10000 });
}

test('a published brief is served back after a reload', async ({ request }) => {
  const response = await request.get(`${DEV_BASE_URL}/api/brief/latest?sessionId=`);

  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(body.brief?.taskId).toBe('task-e2e-001');
});

test('a restored brief waits as a pill rather than taking the screen over', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.brief-pill')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('.brief-pill')).toContainText(/brief ready/i);
  await expect(page.locator('.change-brief')).toHaveCount(0);
});

test('the brief renders as a billboard, not a wall of text', async ({ page }) => {
  await openWithRestoredBrief(page);

  // The three panels are visually separate, which is the whole point: a risk
  // buried in a paragraph is a risk nobody reads.
  await expect(page.locator('.brief-panel--changed')).toBeVisible();
  await expect(page.locator('.brief-panel--why')).toBeVisible();
  await expect(page.locator('.brief-panel--risk')).toBeVisible();

  // The decision shows both sides of the fork and ends in a question.
  await expect(page.locator('.brief-fork__chosen')).toBeVisible();
  await expect(page.locator('.brief-fork__rejected')).toBeVisible();
  await expect(page.locator('.brief-question')).toBeVisible();
});

test('no panel hides text behind a scrollbar', async ({ page }) => {
  await openWithRestoredBrief(page);

  const overflowingPanels = await page.evaluate(() => {
    const panels = [...document.querySelectorAll('.brief-panel, .brief-decision')];
    return panels
      .filter((panel) => panel.scrollHeight > panel.clientHeight + 2)
      .map((panel) => panel.className);
  });

  expect(overflowingPanels).toEqual([]);
});

test('the headline is large enough to read at a glance', async ({ page }) => {
  await openWithRestoredBrief(page);

  const headlineSize = await page.evaluate(() => {
    const headline = document.querySelector('.brief-headline');
    return parseFloat(getComputedStyle(headline).fontSize);
  });

  // Below this the eye reads it as body text and skims straight past it.
  expect(headlineSize).toBeGreaterThanOrEqual(22);
});

test('the risk panel is visually distinct from the others', async ({ page }) => {
  await openWithRestoredBrief(page);

  const [riskBackground, changedBackground] = await page.evaluate(() => [
    getComputedStyle(document.querySelector('.brief-panel--risk')).backgroundColor,
    getComputedStyle(document.querySelector('.brief-panel--changed')).backgroundColor,
  ]);

  expect(riskBackground).not.toBe(changedBackground);
});

test('the brief can be parked and picked up again', async ({ page }) => {
  await openWithRestoredBrief(page);

  await page.locator('.brief-park').click();

  // Parked, not gone: the panel closes and the pill stays, now quiet.
  await expect(page.locator('.change-brief')).toHaveCount(0);
  await expect(page.locator('.brief-pill')).toContainText(/parked/i);

  await page.locator('.brief-pill').click();
  await expect(page.locator('.change-brief')).toBeVisible();
});

test('the brief can be dismissed once read', async ({ page }) => {
  await openWithRestoredBrief(page);

  await page.locator('.brief-dismiss').click();

  await expect(page.locator('.change-brief')).toHaveCount(0);
  await expect(page.locator('.brief-pill')).toHaveCount(0);
});

// ── Live path: a brief pushed over a tab's socket ───────────────────────────
//
// WS injection mirrors the production socket and is the established technique
// in worktree-recovery.spec.js: the frame is dispatched on the real WebSocket
// the terminal opened, so it travels through the terminal's own message
// handler and its forwarding decision — the exact place the brief used to die.

const LIVE_BRIEF_HEADLINE = 'A brief pushed live reaches the panel without a reload';

/** Wraps window.WebSocket so the test can dispatch a frame on the active tab's socket. */
async function enableWsInjection(page) {
  await page.addInitScript(() => {
    const OriginalWebSocket = window.WebSocket;
    window.WebSocket = class extends OriginalWebSocket {
      constructor(...args) {
        super(...args);
        window.__testWS = this;
      }
    };
    window.__wsInject = (message) => {
      if (!window.__testWS) return false;
      window.__testWS.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }));
      return true;
    };
  });
}

/**
 * Opens a fresh tab and returns its session id.
 *
 * The dev instance restores whatever tabs the developer had open, and each one
 * opens its own socket, so "the last socket constructed" is only guaranteed to
 * be the ACTIVE tab's when the test itself just opened that tab. Opening one is
 * a real click, and the brief must name that tab's id or the hook files it
 * under another tab.
 */
async function openFreshTabAndReadSessionId(page) {
  await page.locator('.xterm').first().waitFor({ state: 'visible', timeout: 20000 });
  const socketUrlBefore = await page.evaluate(() => window.__testWS?.url ?? '');
  await page.locator('.new-tab-btn').click();
  await page.waitForFunction(
    (previousUrl) => !!(window.__testWS && window.__testWS.url && window.__testWS.url !== previousUrl),
    socketUrlBefore,
    { timeout: 10000 },
  );
  await page.waitForTimeout(1500); // let the new tab's hook settle on its session id.
  return page.evaluate(() => new URL(window.__testWS.url).searchParams.get('tabId'));
}

/** A brief addressed to one session, as change_brief_publish broadcasts it. */
function liveBrief(sessionId, overrides = {}) {
  return {
    ...sampleBrief(),
    briefId: 'brief-e2e-live-001',
    sessionId,
    taskId: 'task-e2e-live-001',
    headline: LIVE_BRIEF_HEADLINE,
    ...overrides,
  };
}

/** Injects a brief on the active socket and opens it from its pill. */
async function injectAndOpenBrief(page, brief) {
  const wasInjected = await page.evaluate(
    (message) => window.__wsInject(message),
    { type: 'CHANGE_BRIEF', brief },
  );
  expect(wasInjected).toBe(true);
  await expect(page.locator('.brief-pill')).toContainText(brief.headline, { timeout: 10000 });
  await page.locator('.brief-pill').click();
  await expect(page.locator('.brief-headline')).toHaveText(brief.headline, { timeout: 10000 });
}

test.describe('live path — the brief arrives over the terminal socket', () => {
  test.beforeEach(async ({ page }) => {
    await enableWsInjection(page);
  });

  test('a CHANGE_BRIEF frame on the active socket renders in the panel', async ({ page }) => {
    await visitWithoutTour(page, DEV_BASE_URL);
    const sessionId = await openFreshTabAndReadSessionId(page);

    await injectAndOpenBrief(page, liveBrief(sessionId));
  });

  test('a CHANGE_BRIEF frame is never written to the terminal as output', async ({ page }) => {
    await visitWithoutTour(page, DEV_BASE_URL);
    const sessionId = await openFreshTabAndReadSessionId(page);

    await injectAndOpenBrief(page, liveBrief(sessionId));

    // Article X: read the xterm buffer model, never the DOM. A control frame
    // that leaked into the terminal would show its JSON in the scrollback.
    const bufferText = await page.evaluate(() => {
      const buffer = window.term?.buffer?.active;
      if (!buffer) return '';
      const lines = [];
      for (let i = 0; i < buffer.length; i++) lines.push(buffer.getLine(i)?.translateToString(true) ?? '');
      return lines.join('\n');
    });
    expect(bufferText).not.toContain('CHANGE_BRIEF');
    expect(bufferText).not.toContain(LIVE_BRIEF_HEADLINE);
  });
});

// ── Tab discipline: a brief belongs to one tab ──────────────────────────────

const FIRST_TAB_HEADLINE = 'The first tab keeps this brief to itself';

/** A brief long enough that no reasonable window can show all of it at once. */
function longBrief(sessionId) {
  const decision = sampleBrief().decisions[0];
  return liveBrief(sessionId, {
    headline: FIRST_TAB_HEADLINE,
    filesTouched: 12,
    decisions: Array.from({ length: 6 }, (_, index) => ({
      ...decision,
      openQuestion: `${decision.openQuestion} (decision ${index + 1})`,
    })),
  });
}

test.describe('tab discipline — a brief stays on the tab it belongs to', () => {
  test.beforeEach(async ({ page }) => {
    await enableWsInjection(page);
    await page.setViewportSize(SHORT_VIEWPORT);
  });

  test('a brief on one tab leaves another tab untouched, and is still there on return', async ({ page }) => {
    await visitWithoutTour(page, DEV_BASE_URL);
    const firstSessionId = await openFreshTabAndReadSessionId(page);
    await injectAndOpenBrief(page, liveBrief(firstSessionId, { headline: FIRST_TAB_HEADLINE }));

    // Open a second tab while the first tab's brief is open. This is the
    // reported defect: the brief used to follow the developer to every tab.
    await openFreshTabAndReadSessionId(page);

    await expect(page.locator('.change-brief')).toHaveCount(0);
    await expect(page.locator('.brief-pill')).not.toContainText(FIRST_TAB_HEADLINE);

    // The first tab says on its face that it is holding a brief.
    const firstTab = page.locator(`.tab[data-tab-id="${firstSessionId}"]`);
    await expect(firstTab.locator('.tab-brief-indicator')).toBeVisible();

    // Going back finds the brief exactly as it was left: open.
    await firstTab.click();
    await expect(page.locator('.brief-headline')).toHaveText(FIRST_TAB_HEADLINE, { timeout: 10000 });
  });

  test('an open brief scrolls inside its dock and does not block switching tabs', async ({ page }) => {
    await visitWithoutTour(page, DEV_BASE_URL);
    const firstSessionId = await openFreshTabAndReadSessionId(page);
    const secondSessionId = await openFreshTabAndReadSessionId(page);
    await page.locator(`.tab[data-tab-id="${firstSessionId}"]`).click();
    await page.waitForTimeout(500);

    await injectAndOpenBrief(page, longBrief(firstSessionId));

    // The dock, not the window, is what scrolls: its content is taller than
    // it is, and its bottom edge is still inside the viewport.
    const dockGeometry = await page.evaluate(() => {
      const dock = document.querySelector('.change-brief-dock');
      const rectangle = dock.getBoundingClientRect();
      return {
        overflowY: getComputedStyle(dock).overflowY,
        isTallerThanShown: dock.scrollHeight > dock.clientHeight + 2,
        bottom: rectangle.bottom,
        viewportHeight: window.innerHeight,
      };
    });
    expect(dockGeometry.overflowY).toBe('auto');
    expect(dockGeometry.isTallerThanShown).toBe(true);
    expect(dockGeometry.bottom).toBeLessThanOrEqual(dockGeometry.viewportHeight);

    // The tab bar is still reachable with the brief open: a real click on the
    // other tab switches to it, and the brief does not come along.
    await page.locator(`.tab[data-tab-id="${secondSessionId}"]`).click();
    await expect(page.locator(`.tab[data-tab-id="${secondSessionId}"]`)).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.change-brief')).toHaveCount(0);
  });
});
