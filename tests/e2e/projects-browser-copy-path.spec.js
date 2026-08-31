// Proves the Projects Browser gives up a folder's path on a real right-click.
//
// The unit tests drive a mounted component; this drives the running application
// through the browser, because the thing being fixed is an interaction — a
// right-click that previously fell through to the browser's own menu — and a
// component test cannot tell whether the menu ever reaches the page.
//
// Runs against the dev instance on :9999 started by run-dev-clean.ps1, never
// against production on :3005.

const { test, expect } = require('@playwright/test');

const DEV_BASE_URL = 'http://localhost:9999';
const PROJECT_ROOT = 'C:\\ProjectsWin';

test.use({ baseURL: DEV_BASE_URL });

test.beforeEach(async ({ context }) => {
  // Reading the clipboard needs permission; without it the read throws and the
  // test cannot tell a failed copy from a blocked read.
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});

/** Points the Projects Browser at a root that has real subdirectories. */
async function openProjectsBrowser(page) {
  await page.addInitScript((rootPath) => {
    window.localStorage.setItem('forge_directory_card_root', rootPath);
  }, PROJECT_ROOT);

  await page.goto('/');
  await page.locator('.directory-card-folder-btn').first().waitFor({ timeout: 30000 });
}

test('right-clicking a project folder copies its full path', async ({ page }) => {
  await openProjectsBrowser(page);

  const firstFolder = page.locator('.directory-card-folder-btn').first();
  const folderName = (await firstFolder.innerText()).trim();

  await firstFolder.click({ button: 'right' });

  const menu = page.locator('.context-menu');
  await expect(menu).toBeVisible();

  await menu.getByText('Copy Path').click();

  // The menu says what happened, rather than leaving a silent clipboard
  // failure indistinguishable from a success.
  await expect(page.locator('.context-menu-result')).toContainText('Copied path');

  const clipboardValue = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboardValue).toContain(folderName);
  expect(clipboardValue.startsWith(PROJECT_ROOT)).toBe(true);
});

test('the menu opens under the pointer, not in the corner', async ({ page }) => {
  await openProjectsBrowser(page);

  const folder = page.locator('.directory-card-folder-btn').first();
  const folderBox = await folder.boundingBox();

  await folder.click({ button: 'right' });

  const menuBox = await page.locator('.context-menu').boundingBox();

  // Within the folder's own row rather than at the viewport origin, which is
  // where an unpositioned fixed element lands.
  expect(menuBox.x).toBeGreaterThan(folderBox.x - 40);
  expect(menuBox.y).toBeGreaterThan(folderBox.y - 40);
});

test('a right-click does not also open the folder', async ({ page }) => {
  await openProjectsBrowser(page);

  await page.locator('.directory-card-folder-btn').first().click({ button: 'right' });
  await expect(page.locator('.context-menu')).toBeVisible();

  // Opening a folder sends `cd` to the terminal. Read the buffer model rather
  // than the DOM, per the project's own rule about terminal assertions.
  const terminalText = await page.evaluate(() => {
    if (!window.term?.buffer?.active) return '';
    const buffer = window.term.buffer.active;
    const lines = [];
    for (let row = 0; row < buffer.length; row += 1) {
      lines.push(buffer.getLine(row)?.translateToString(true) ?? '');
    }
    return lines.join('\n');
  });

  expect(terminalText).not.toContain(`cd "${PROJECT_ROOT}\\`);
});
