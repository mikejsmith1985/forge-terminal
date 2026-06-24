// e2eBufferLint.test.js — enforces Constitution Article X / specs/012 FR-014 (analysis finding U1):
// terminal-output assertions in the Playwright e2e suite MUST read the xterm.js buffer model
// (window.term.buffer.active, via the shared fixtures), never the rendered DOM. A DOM-based read
// of terminal output would let a "passing" UX test assert on the wrong surface, so this guard
// fails the build if any e2e spec reaches into the terminal DOM for its text.
import { readFileSync, readdirSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
import { describe, it, expect } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))
const E2E_DIR = path.resolve(here, '../../..', 'tests', 'e2e')

// A violation is reading terminal OUTPUT TEXT from the DOM: an xterm output selector combined with
// a text-extraction operation. Presence/visibility checks on the same selectors (toBeVisible,
// toBeAttached, waitFor, click, focus) are legitimate and MUST NOT be flagged — only text reads
// bypass the buffer model and violate Article X / FR-014.
const XTERM_OUTPUT_SELECTOR = /xterm-rows|xterm-screen|\.xterm['"]\)/
const TEXT_EXTRACTION = /toContainText|toHaveText|textContent|innerText|innerHTML|allInnerTexts|allTextContents/

// findDomTerminalReads returns every line that reads terminal output text from the DOM.
export function findDomTerminalReads(source) {
  const violations = []
  source.split('\n').forEach((line, index) => {
    if (XTERM_OUTPUT_SELECTOR.test(line) && TEXT_EXTRACTION.test(line)) {
      violations.push({ line: index + 1, text: line.trim() })
    }
  })
  return violations
}

describe('e2e buffer-read trust boundary (Article X / FR-014)', () => {
  it('flags a spec that reads terminal output from the DOM', () => {
    const bad = `const text = await page.locator('.xterm-rows').innerText()\nexpect(text).toContain('done')`
    expect(findDomTerminalReads(bad).length).toBeGreaterThan(0)
  })

  it('passes a spec that reads the xterm buffer via the fixture', () => {
    const good = `const out = await getTerminalOutput(page, 20)\nexpect(out).toContain('done')`
    expect(findDomTerminalReads(good)).toEqual([])
  })

  it('every terminal-output e2e spec uses the buffer model, never the DOM', () => {
    const specs = readdirSync(E2E_DIR).filter((name) => name.endsWith('.spec.js'))
    expect(specs.length).toBeGreaterThan(0) // guard against a wrong path silently passing.

    const offenders = []
    for (const spec of specs) {
      const violations = findDomTerminalReads(readFileSync(path.join(E2E_DIR, spec), 'utf8'))
      if (violations.length > 0) {
        offenders.push(`${spec}: ${violations.map((v) => `L${v.line}`).join(', ')}`)
      }
    }
    expect(offenders, `DOM terminal reads found (use window.term.buffer.active fixtures instead):\n${offenders.join('\n')}`).toEqual([])
  })
})
