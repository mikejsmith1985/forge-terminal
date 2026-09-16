// Tests for the pill that says a brief is waiting.
//
// The pill is what replaced the panel taking the screen over on arrival. It
// has one job: be noticeable without being in the way, and open the brief
// when the developer is ready. A brief that arrives and is never noticed is
// the failure the whole feature guards against, so an unread pill must look
// different from a parked one.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ChangeBriefPill from './ChangeBriefPill'

const HEADLINE = 'Folders now give up their path on a right-click'

describe('ChangeBriefPill', () => {
  it('announces an unread brief with its headline', () => {
    render(<ChangeBriefPill briefState="unread" headline={HEADLINE} onOpen={vi.fn()} />)

    const pill = screen.getByRole('button')
    expect(pill.textContent).toMatch(/brief ready/i)
    expect(pill.textContent).toContain('Folders now give up')
    expect(pill.className).toContain('brief-pill--unread')
  })

  it('reads as parked once the developer has put the brief down', () => {
    render(<ChangeBriefPill briefState="parked" headline={HEADLINE} onOpen={vi.fn()} />)

    const pill = screen.getByRole('button')
    expect(pill.textContent).toMatch(/parked/i)
    expect(pill.className).toContain('brief-pill--parked')
    expect(pill.className).not.toContain('brief-pill--unread')
  })

  it('opens the brief when clicked', () => {
    const onOpen = vi.fn()
    render(<ChangeBriefPill briefState="unread" headline={HEADLINE} onOpen={onOpen} />)

    fireEvent.click(screen.getByRole('button'))

    expect(onOpen).toHaveBeenCalled()
  })

  it('renders nothing while the brief is open or once it has been read', () => {
    for (const briefState of ['open', 'read', null]) {
      const { container, unmount } = render(
        <ChangeBriefPill briefState={briefState} headline={HEADLINE} onOpen={vi.fn()} />,
      )
      expect(container.firstChild).toBeNull()
      unmount()
    }
  })
})
