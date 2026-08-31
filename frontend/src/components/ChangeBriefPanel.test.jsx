// Tests for the change brief panel — the billboard.
//
// The panel exists because a wall of prose gets agreed with rather than read.
// So what is tested here is not "does it render the data" but "is the shape of
// it the shape that gets looked at": risk visually separate rather than buried
// in a clause, the decision's open question actually present, and a routine
// change staying small instead of padding itself out to look substantial.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ChangeBriefPanel from './ChangeBriefPanel'

function makeBrief(overrides = {}) {
  return {
    briefId: 'brief-task-001',
    sessionId: 'session-001',
    taskId: 'task-001',
    headline: 'Folders now give up their path on a right-click',
    whatChanged: 'Right-clicking a folder offers Copy Path in the file tree and the projects browser.',
    whyItChanged: 'Copy Path existed on files only, so a folder path could not be got out of the interface.',
    whatCouldBreak: 'The clipboard is unavailable outside a secure context, so a copy now reports failure.',
    isRoutine: false,
    filesTouched: 6,
    decisions: [{
      chose: 'One shared context menu used by both surfaces',
      insteadOf: 'A separate menu implementation for each surface',
      because: 'Two menus drift apart in dismissal and positioning.',
      openQuestion: 'Is the shared menu worth coupling two unrelated panels?',
    }],
    ...overrides,
  }
}

describe('ChangeBriefPanel', () => {
  it('leads with the headline', () => {
    render(<ChangeBriefPanel brief={makeBrief()} onDismiss={vi.fn()} />)

    expect(screen.getByText(/Folders now give up their path/)).toBeTruthy()
  })

  it('renders what changed, why, and what could break as separate panels', () => {
    render(<ChangeBriefPanel brief={makeBrief()} onDismiss={vi.fn()} />)

    expect(document.querySelector('.brief-panel--changed')).toBeTruthy()
    expect(document.querySelector('.brief-panel--why')).toBeTruthy()
    expect(document.querySelector('.brief-panel--risk')).toBeTruthy()
  })

  it('gives risk its own visual treatment rather than burying it', () => {
    // A risk inside a paragraph is a risk nobody sees. It gets its own class so
    // colour can carry the meaning without the reader having to parse a
    // sentence to find it.
    render(<ChangeBriefPanel brief={makeBrief()} onDismiss={vi.fn()} />)

    const riskPanel = document.querySelector('.brief-panel--risk')
    const changedPanel = document.querySelector('.brief-panel--changed')

    expect(riskPanel.className).not.toBe(changedPanel.className)
    expect(screen.getByText(/clipboard is unavailable/)).toBeTruthy()
  })

  it('shows the decision as a fork, both sides visible', () => {
    render(<ChangeBriefPanel brief={makeBrief()} onDismiss={vi.fn()} />)

    expect(screen.getByText(/One shared context menu/)).toBeTruthy()
    expect(screen.getByText(/A separate menu implementation/)).toBeTruthy()
  })

  it('ends every decision with its open question', () => {
    // This is the mechanism that turns review into a question rather than a
    // nod, so its absence is a failure and not a missing nicety.
    render(<ChangeBriefPanel brief={makeBrief()} onDismiss={vi.fn()} />)

    expect(screen.getByText(/Is the shared menu worth coupling/)).toBeTruthy()
  })

  it('renders every decision when a change had more than one', () => {
    const brief = makeBrief({
      decisions: [
        makeBrief().decisions[0],
        {
          chose: 'Warn on prose rather than block it',
          insteadOf: 'Reject a non-compliant response outright',
          because: 'Detection reads screen redraws and cannot be trusted to gate.',
          openQuestion: 'Should this harden once detection is proven?',
        },
      ],
    })

    render(<ChangeBriefPanel brief={brief} onDismiss={vi.fn()} />)

    expect(document.querySelectorAll('.brief-decision').length).toBe(2)
  })

  it('stays small when a change was genuinely routine', () => {
    // Padding a mechanical change out to look substantial trains the reader to
    // skim, which is the habit the whole feature exists to break.
    const brief = makeBrief({ isRoutine: true, decisions: [] })

    render(<ChangeBriefPanel brief={brief} onDismiss={vi.fn()} />)

    expect(document.querySelectorAll('.brief-decision').length).toBe(0)
    expect(screen.getByText(/routine/i)).toBeTruthy()
  })

  it('shows how many files changed without listing them', () => {
    render(<ChangeBriefPanel brief={makeBrief()} onDismiss={vi.fn()} />)

    expect(screen.getByText(/6/)).toBeTruthy()
  })

  it('can be dismissed once read', () => {
    const onDismiss = vi.fn()
    render(<ChangeBriefPanel brief={makeBrief()} onDismiss={onDismiss} />)

    fireEvent.click(screen.getByRole('button', { name: /got it|dismiss|close/i }))

    expect(onDismiss).toHaveBeenCalled()
  })

  it('renders nothing when there is no brief', () => {
    const { container } = render(<ChangeBriefPanel brief={null} onDismiss={vi.fn()} />)

    expect(container.firstChild).toBeNull()
  })

  it('escapes nothing into markup unsafely', () => {
    // React escapes by default; this pins that no dangerouslySetInnerHTML crept
    // in as a shortcut for formatting a panel.
    const brief = makeBrief({ headline: '<img src=x onerror=alert(1)>' })
    render(<ChangeBriefPanel brief={brief} onDismiss={vi.fn()} />)

    expect(document.querySelector('img')).toBeNull()
  })
})
