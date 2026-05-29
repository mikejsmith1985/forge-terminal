// ToggleCardFooter tests guard the on/off toggle card behavior: the start and
// stop buttons must execute the correct command, and the last-clicked side must
// stay visually highlighted so the user can see which action they triggered.
import { fireEvent, render, screen } from '@testing-library/react'

import ToggleCardFooter from './ToggleCardFooter'

const buildToggleCommand = (overrides = {}) => ({
  id: 900,
  description: '🐳 DBAI POC',
  command: 'docker compose up -d',
  macro_payload: '',
  macro_delay: 1500,
  delay: 0,
  cardType: 'toggle',
  toggle: {
    offCommand: 'docker compose stop',
    offMacroPayload: '',
    offMacroDelay: 1500,
    offDelay: 0,
  },
  ...overrides,
})

describe('ToggleCardFooter', () => {
  it('renders default Start and Stop labels', () => {
    render(<ToggleCardFooter command={buildToggleCommand()} onExecute={vi.fn()} />)

    expect(screen.getByRole('button', { name: /start/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument()
  })

  it('uses custom labels from the toggle config when provided', () => {
    const command = buildToggleCommand({
      toggle: { offCommand: 'docker compose stop', onLabel: 'Launch', offLabel: 'Tear Down' },
    })
    render(<ToggleCardFooter command={command} onExecute={vi.fn()} />)

    expect(screen.getByRole('button', { name: /launch/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /tear down/i })).toBeInTheDocument()
  })

  it('runs the start command when Start is clicked', () => {
    const executeCommand = vi.fn()
    render(<ToggleCardFooter command={buildToggleCommand()} onExecute={executeCommand} />)

    fireEvent.click(screen.getByRole('button', { name: /start/i }))

    expect(executeCommand).toHaveBeenCalledTimes(1)
    expect(executeCommand.mock.calls[0][0]).toMatchObject({ command: 'docker compose up -d' })
  })

  it('runs the off command (and its macro) when Stop is clicked', () => {
    const executeCommand = vi.fn()
    const command = buildToggleCommand({
      toggle: {
        offCommand: 'docker compose stop',
        offMacroPayload: 'echo stopped',
        offMacroDelay: 2000,
        offDelay: 100,
      },
    })
    render(<ToggleCardFooter command={command} onExecute={executeCommand} />)

    fireEvent.click(screen.getByRole('button', { name: /stop/i }))

    expect(executeCommand).toHaveBeenCalledTimes(1)
    expect(executeCommand.mock.calls[0][0]).toMatchObject({
      command: 'docker compose stop',
      macro_payload: 'echo stopped',
      macro_delay: 2000,
      delay: 100,
    })
  })

  it('highlights the last-clicked side as active', () => {
    render(<ToggleCardFooter command={buildToggleCommand()} onExecute={vi.fn()} />)
    const startButton = screen.getByRole('button', { name: /start/i })
    const stopButton = screen.getByRole('button', { name: /stop/i })

    // Nothing active before any click.
    expect(startButton.className).not.toMatch(/active/)
    expect(stopButton.className).not.toMatch(/active/)

    fireEvent.click(startButton)
    expect(startButton.className).toMatch(/active/)
    expect(stopButton.className).not.toMatch(/active/)

    fireEvent.click(stopButton)
    expect(stopButton.className).toMatch(/active/)
    expect(startButton.className).not.toMatch(/active/)
  })
})
