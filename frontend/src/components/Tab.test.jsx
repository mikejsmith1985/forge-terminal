// Tests for the tab's brief indicator.
//
// A brief belongs to the tab whose work it describes. When the developer is
// looking at a different tab, the only place that brief can announce itself is
// on its own tab, so the indicator is what makes "hold it here, work there"
// possible without the brief being forgotten.

import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import Tab from './Tab'

function makeTab(overrides = {}) {
  return { id: 'tab-1', title: 'forge-terminal', modified: false, ...overrides }
}

function renderTab(props = {}) {
  return render(
    <Tab
      tab={makeTab()}
      isActive={false}
      onClick={vi.fn()}
      onClose={vi.fn()}
      onRename={vi.fn()}
      {...props}
    />,
  )
}

describe('Tab — brief indicator', () => {
  it('shows nothing when the tab holds no brief', () => {
    renderTab()

    expect(document.querySelector('.tab-brief-indicator')).toBeNull()
  })

  it('marks a tab holding an unread brief', () => {
    renderTab({ briefState: 'unread' })

    const indicator = document.querySelector('.tab-brief-indicator')
    expect(indicator).toBeTruthy()
    expect(indicator.getAttribute('data-brief-state')).toBe('unread')
    expect(indicator.getAttribute('title')).toMatch(/brief/i)
  })

  it('marks a tab holding a parked brief, distinctly from an unread one', () => {
    renderTab({ briefState: 'parked' })

    expect(document.querySelector('.tab-brief-indicator').getAttribute('data-brief-state')).toBe('parked')
  })

  it('carries its id in the markup so a test can address it by tab', () => {
    renderTab()

    expect(document.querySelector('.tab').getAttribute('data-tab-id')).toBe('tab-1')
  })
})
