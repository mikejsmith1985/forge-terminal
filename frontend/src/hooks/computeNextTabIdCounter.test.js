// Tests for computeNextTabIdCounter — the session-restore id-counter seed.
//
// Regression context: a recovered session must never let a freshly created tab
// reuse an index that a restored tab already holds. The old logic seeded the
// counter from the restored tab COUNT, which collided with restored indices
// whenever an earlier tab had been closed (observed live as two "tab-5"
// sessions after an app update). The counter must sit strictly above the
// highest index present in the restored ids.
import { computeNextTabIdCounter } from './useTabManager'

describe('computeNextTabIdCounter', () => {
  it('returns one past the highest restored index, not the tab count', () => {
    // Two tabs but a gap: indices 2 and 4. Count-based seeding would give 3,
    // letting the next tab mint index 4 — a collision with the restored tab-4.
    expect(computeNextTabIdCounter(['tab-2-aaa', 'tab-4-bbb'])).toBe(5)
  })

  it('handles ids with no random suffix (e.g. test fixtures "tab-1")', () => {
    expect(computeNextTabIdCounter(['tab-1'])).toBe(2)
  })

  it('returns 1 for an empty restore set', () => {
    expect(computeNextTabIdCounter([])).toBe(1)
  })

  it('ignores malformed ids and uses the highest valid index', () => {
    expect(computeNextTabIdCounter(['weird', 'tab-10-x', null, 'tab-3-y'])).toBe(11)
  })
})
