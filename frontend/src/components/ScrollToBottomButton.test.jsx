// Unit tests for ScrollToBottomButton — the round control pinned to the bottom-right
// of a terminal pane that returns the view to the newest output.
//
// Red phase: fails until ScrollToBottomButton.jsx exists. The behaviour under test is
// the bug report "this button doesn't work": the control used to be revealed and
// clickable whenever the pointer was anywhere over the terminal, including when the
// terminal was already at the bottom — so a click was guaranteed to do nothing.
import { render, screen } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import ScrollToBottomButton from './ScrollToBottomButton'

describe('ScrollToBottomButton', () => {
  it('is inert while the terminal is already at the bottom', () => {
    const handleScrollToBottom = vi.fn()
    render(
      <ScrollToBottomButton isScrolledUp={false} onScrollToBottom={handleScrollToBottom} />
    )

    const scrollButton = screen.getByRole('button', { name: /scroll to bottom/i })
    expect(scrollButton).toBeDisabled()

    fireEvent.click(scrollButton)
    expect(handleScrollToBottom).not.toHaveBeenCalled()
  })

  it('scrolls to the newest output when the terminal has been scrolled up', () => {
    const handleScrollToBottom = vi.fn()
    render(
      <ScrollToBottomButton isScrolledUp={true} onScrollToBottom={handleScrollToBottom} />
    )

    const scrollButton = screen.getByRole('button', { name: /scroll to bottom/i })
    expect(scrollButton).toBeEnabled()

    fireEvent.click(scrollButton)
    expect(handleScrollToBottom).toHaveBeenCalledTimes(1)
  })

  it('stays available in the alternate screen, where the running program owns the view', () => {
    const handleScrollToBottom = vi.fn()
    render(
      <ScrollToBottomButton
        isScrolledUp={false}
        isAlternateScreen={true}
        onScrollToBottom={handleScrollToBottom}
      />
    )

    const scrollButton = screen.getByRole('button', { name: /scroll to bottom/i })
    expect(scrollButton).toBeEnabled()

    fireEvent.click(scrollButton)
    expect(handleScrollToBottom).toHaveBeenCalledTimes(1)
  })

  it('says it is asking the running program when the alternate screen is active', () => {
    render(
      <ScrollToBottomButton
        isScrolledUp={false}
        isAlternateScreen={true}
        onScrollToBottom={() => {}}
      />
    )
    expect(screen.getByRole('button', { name: /scroll to bottom/i })).toHaveAttribute(
      'title',
      expect.stringContaining('Send Ctrl+End')
    )
  })

  it('describes the plain keyboard shortcut in an ordinary shell', () => {
    render(
      <ScrollToBottomButton
        isScrolledUp={true}
        isAlternateScreen={false}
        onScrollToBottom={() => {}}
      />
    )
    expect(screen.getByRole('button', { name: /scroll to bottom/i })).toHaveAttribute(
      'title',
      'Scroll to bottom (Ctrl+End)'
    )
  })

  it('carries the is-scrolled-up class only when there is scrollback to return from', () => {
    const { rerender } = render(
      <ScrollToBottomButton isScrolledUp={false} onScrollToBottom={() => {}} />
    )
    expect(screen.getByRole('button', { name: /scroll to bottom/i })).not.toHaveClass(
      'is-scrolled-up'
    )

    rerender(<ScrollToBottomButton isScrolledUp={true} onScrollToBottom={() => {}} />)
    expect(screen.getByRole('button', { name: /scroll to bottom/i })).toHaveClass(
      'is-scrolled-up'
    )
  })
})

describe('scroll-to-bottom button stylesheet', () => {
  // The dead-click bug lived in CSS, not JSX: the hover rule handed the button
  // pointer-events while it had nothing to scroll to. Guard the cascade so the
  // regression cannot be reintroduced by editing index.css alone.
  it('only grants pointer-events once the button is in the is-scrolled-up state', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const stylesheetPath = resolve(process.cwd(), 'src/index.css')
    const stylesheet = readFileSync(stylesheetPath, 'utf8')

    const pointerEventRules = stylesheet
      .split('}')
      .filter(
        (rule) =>
          rule.includes('.scroll-to-bottom-btn') && rule.includes('pointer-events: auto')
      )

    expect(pointerEventRules.length).toBeGreaterThan(0)
    for (const rule of pointerEventRules) {
      expect(rule).toContain('.scroll-to-bottom-btn.is-scrolled-up')
    }
  })
})
