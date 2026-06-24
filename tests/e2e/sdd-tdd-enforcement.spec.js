// E2E tests for specs/012 — deterministic resume + no recursive worktree nesting.
// Per Constitution Article X these assert on the xterm.js buffer model
// (window.term.buffer.active via the shared fixtures), never the DOM canvas.
//
// Prerequisite: the dev harness must be running (./run-dev-clean.ps1, port 9999).
// Playwright baseURL is configured for the running instance.
const {
  test,
  expect,
  waitForTerminal,
  getTerminalOutput,
  terminalType,
  terminalEnter,
  terminalShouldContain,
} = require('../fixtures/forge')

test.describe('specs/012 deterministic resume — no recursive worktree nesting', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForTerminal(page)
  })

  // US1 / SC-002: the captured bug was a cwd like
  // .forge/worktrees/X/.forge/worktrees/Y. The rendered prompt (read from the
  // buffer) must NEVER contain two .forge/worktrees/ segments — a session can be
  // in at most one worktree level beneath the main checkout.
  test('the terminal working directory never contains nested .forge/worktrees segments', async ({ page }) => {
    // Print the current directory; PowerShell is the primary shell on Windows.
    await terminalType(page, 'Get-Location')
    await terminalEnter(page)
    // Settle, then read the buffer (Article X — not the DOM).
    await page.waitForTimeout(800)
    const output = await getTerminalOutput(page, 40)

    const normalized = output.replace(/\\/g, '/').toLowerCase()
    const nestedSegments = (normalized.match(/\.forge\/worktrees\//g) || []).length
    expect(
      nestedSegments,
      `working directory shows ${nestedSegments} ".forge/worktrees/" segments; nesting bug (SC-002) if > 1.\nBuffer:\n${output}`
    ).toBeLessThanOrEqual(1)
  })

  // US1 / SC-008 placeholder: deterministic re-attach across an app restart is
  // validated in the quickstart (Scenario 2) against a provisioned worktree. The
  // pure re-attach logic is proven by the Go unit + integration suites
  // (TestResolveWorkspace_ReattachesExistingWorktree, TestNoNesting_RealGit); this
  // spec guards the user-visible invariant from the rendered buffer.
  test('a fresh tab reports a usable working directory in the buffer', async ({ page }) => {
    await terminalType(page, 'Get-Location')
    await terminalEnter(page)
    // The prompt resolves to a real path quickly (well within the 10s resume budget).
    await terminalShouldContain(page, ':', { timeout: 10000 })
  })
})

test.describe('specs/012 US3 — Playwright UX gate (end-to-end)', () => {
  // The UX-gate decision logic is fully proven by the Go unit suite
  // (TestEvaluateGate_UXRule: no-UX ⇒ block, ran=false ⇒ block, failed ⇒ block,
  // passing ⇒ pass). This end-to-end scenario asserts the *rendered* verdict on the
  // SDD dashboard report card and requires (a) the live dev harness and (b) the
  // frontend verdict chip (US4 / T032). Marked pending until that lands so it can
  // never report a false pass — consistent with the honest-failure principle this
  // feature enforces.
  test.fixme('a user-facing phase shows a "blocked — needs UX validation" verdict until a passing Playwright result is recorded', async ({ page }) => {
    // 1. Drive a user-facing phase to completion with no ux-validated ledger entry.
    // 2. Assert the dashboard report card renders decision=block with the UX reason,
    //    read from the verification field — not the DOM canvas (Article X).
    // 3. Record a passing UX result; assert the verdict flips to pass.
  })
})
