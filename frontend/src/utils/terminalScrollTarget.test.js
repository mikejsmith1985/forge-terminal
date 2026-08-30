// Unit tests for the scroll-to-bottom decision helpers.
//
// Red phase: fails until terminalScrollTarget.js exists.
import {
  CTRL_END_KEY_SEQUENCE,
  SCROLL_ACTION_SEND_END_KEY,
  SCROLL_ACTION_SCROLL_VIEWPORT,
  WHEEL_SCROLL_LINES_PER_NOTCH,
  resolveScrollToBottomAction,
  canScrollToBottom,
  performScrollToBottom,
} from './terminalScrollTarget'
import { ALTERNATE_SCREEN_BUFFER } from './terminalTuiState'

const NORMAL_SCREEN_BUFFER = 'normal'

describe('CTRL_END_KEY_SEQUENCE', () => {
  it('is the CSI form xterm.js itself emits for Ctrl+End', () => {
    // xterm.js encodes End (keyCode 35) with a modifier as ESC [ 1 ; <mod+1> F.
    // Ctrl is modifier bit 4, so Ctrl+End is ESC [ 1 ; 5 F. Sending anything else
    // would reach the running program as a key it does not recognise.
    expect(CTRL_END_KEY_SEQUENCE).toBe('\x1b[1;5F')
  })
})

describe('resolveScrollToBottomAction', () => {
  it('hands Ctrl+End to the running program while the alternate screen is active', () => {
    expect(resolveScrollToBottomAction(ALTERNATE_SCREEN_BUFFER)).toBe(
      SCROLL_ACTION_SEND_END_KEY
    )
  })

  it('scrolls the terminal viewport itself in the normal screen buffer', () => {
    expect(resolveScrollToBottomAction(NORMAL_SCREEN_BUFFER)).toBe(
      SCROLL_ACTION_SCROLL_VIEWPORT
    )
  })

  it('falls back to scrolling the viewport when the buffer type is unknown', () => {
    expect(resolveScrollToBottomAction(undefined)).toBe(SCROLL_ACTION_SCROLL_VIEWPORT)
  })
})

describe('canScrollToBottom', () => {
  it('is false at the bottom of an ordinary shell, where a click could do nothing', () => {
    expect(
      canScrollToBottom({ bufferType: NORMAL_SCREEN_BUFFER, isScrolledUp: false })
    ).toBe(false)
  })

  it('is true once the ordinary shell has been scrolled up', () => {
    expect(
      canScrollToBottom({ bufferType: NORMAL_SCREEN_BUFFER, isScrolledUp: true })
    ).toBe(true)
  })

  it('is true throughout the alternate screen, whose scroll position we cannot see', () => {
    // A full-screen program keeps its own scroll position and never reports it to
    // the terminal, so the button has to stay available and let the program decide.
    expect(
      canScrollToBottom({ bufferType: ALTERNATE_SCREEN_BUFFER, isScrolledUp: false })
    ).toBe(true)
  })
})

describe('WHEEL_SCROLL_LINES_PER_NOTCH', () => {
  it('matches the three-line-per-notch rate vim and most terminals use', () => {
    // xterm.js defaults scrollSensitivity to 1, so one wheel notch moved a single
    // line — and in the alternate screen that is one arrow key handed to the running
    // program per notch, which is what made scrolling back through a long session
    // take minutes.
    expect(WHEEL_SCROLL_LINES_PER_NOTCH).toBe(3)
  })
})

describe('performScrollToBottom', () => {
  function makeFakeTerminal(bufferType) {
    return {
      buffer: { active: { type: bufferType } },
      input: vi.fn(),
      scrollToBottom: vi.fn(),
      focus: vi.fn(),
    }
  }

  function makeFakeViewport() {
    return { scrollTop: 0, scrollHeight: 4200 }
  }

  it('hands Ctrl+End to the running program in the alternate screen', () => {
    const terminal = makeFakeTerminal(ALTERNATE_SCREEN_BUFFER)
    const viewport = makeFakeViewport()

    const action = performScrollToBottom({ terminal, viewportElement: viewport })

    expect(action).toBe(SCROLL_ACTION_SEND_END_KEY)
    expect(terminal.input).toHaveBeenCalledWith(CTRL_END_KEY_SEQUENCE)
    expect(terminal.scrollToBottom).not.toHaveBeenCalled()
    // The viewport cannot move in this buffer; touching it would be misleading.
    expect(viewport.scrollTop).toBe(0)
    expect(terminal.focus).toHaveBeenCalled()
  })

  it('scrolls the terminal and its DOM viewport in an ordinary shell', () => {
    const terminal = makeFakeTerminal(NORMAL_SCREEN_BUFFER)
    const viewport = makeFakeViewport()

    const action = performScrollToBottom({ terminal, viewportElement: viewport })

    expect(action).toBe(SCROLL_ACTION_SCROLL_VIEWPORT)
    expect(terminal.scrollToBottom).toHaveBeenCalledTimes(1)
    expect(viewport.scrollTop).toBe(viewport.scrollHeight)
    expect(terminal.input).not.toHaveBeenCalled()
    expect(terminal.focus).toHaveBeenCalled()
  })

  it('does nothing and reports nothing when there is no terminal yet', () => {
    expect(performScrollToBottom({ terminal: null, viewportElement: null })).toBeNull()
  })

  it('still scrolls the terminal when the DOM viewport cannot be found', () => {
    const terminal = makeFakeTerminal(NORMAL_SCREEN_BUFFER)

    const action = performScrollToBottom({ terminal, viewportElement: null })

    expect(action).toBe(SCROLL_ACTION_SCROLL_VIEWPORT)
    expect(terminal.scrollToBottom).toHaveBeenCalledTimes(1)
  })
})
