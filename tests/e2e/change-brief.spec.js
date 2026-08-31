// Proves a published change brief actually reaches the developer's screen.
//
// The unit tests drive a mounted component; this drives the running
// application. That distinction matters more than usual here, because the
// failure being guarded against is silent: by the time a brief is published the
// commit gate is already satisfied, so a brief that never renders leaves the
// developer believing they reviewed a change they never saw.
//
// The brief is written to disk exactly as the publishing tool writes it, and
// the page is then loaded. That exercises the real restore path — the one that
// covers a reload — through real backend code, without shipping a test-only
// hook into the application to make the test convenient.
//
// Runs against the dev instance on :9999 started by run-dev-clean.ps1, never
// against production on :3005.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const DEV_BASE_URL = 'http://localhost:9999';
const BRIEF_DIRECTORY = path.join(process.cwd(), '.forge', 'briefs');
const BRIEF_ID = 'brief-e2e-001';

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

/** Loads the app and waits for the restored brief to appear. */
async function openWithRestoredBrief(page) {
  await page.goto('/');
  await page.locator('.change-brief').waitFor({ timeout: 20000 });
}

test('a published brief is served back after a reload', async ({ request }) => {
  const response = await request.get(`${DEV_BASE_URL}/api/brief/latest?sessionId=`);

  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(body.brief?.taskId).toBe('task-e2e-001');
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

test('the brief can be dismissed once read', async ({ page }) => {
  await openWithRestoredBrief(page);

  await page.locator('.brief-dismiss').click();

  await expect(page.locator('.change-brief')).toHaveCount(0);
});
