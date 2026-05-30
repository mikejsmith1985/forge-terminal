// CommandModal tests cover the on/off toggle authoring path: enabling the
// toggle checkbox and entering a stop command must produce a saved card with
// cardType "toggle" and a nested toggle config, while a normal card must not.
import { fireEvent, render, screen } from '@testing-library/react'

import CommandModal from './CommandModal'

const renderModal = (onSave) =>
  render(
    <CommandModal
      isOpen={true}
      onClose={vi.fn()}
      onSave={onSave}
      initialData={null}
      commands={[]}
    />
  )

describe('CommandModal toggle authoring', () => {
  it('packs the flat toggle fields into a nested toggle config on save', () => {
    const saveCommand = vi.fn()
    renderModal(saveCommand)

    fireEvent.change(screen.getByPlaceholderText(/Run Claude Code/i), {
      target: { value: '🐳 DBAI POC' },
    })
    fireEvent.change(screen.getByPlaceholderText(/The command to execute/i), {
      target: { value: 'docker compose up -d' },
    })

    // Enable toggle mode, then fill in the stop command that appears.
    fireEvent.click(screen.getByRole('checkbox', { name: /On\/Off Toggle/i }))
    fireEvent.change(screen.getByPlaceholderText(/tears the service down/i), {
      target: { value: 'docker compose stop' },
    })

    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }))

    expect(saveCommand).toHaveBeenCalledTimes(1)
    const payload = saveCommand.mock.calls[0][0]
    expect(payload.cardType).toBe('toggle')
    expect(payload.command).toBe('docker compose up -d')
    expect(payload.toggle).toMatchObject({ offCommand: 'docker compose stop' })
    // The flat helper fields must not leak into the saved card.
    expect(payload.isToggle).toBeUndefined()
    expect(payload.offCommand).toBeUndefined()
  })

  it('saves a normal card with no toggle config when the box is unchecked', () => {
    const saveCommand = vi.fn()
    renderModal(saveCommand)

    fireEvent.change(screen.getByPlaceholderText(/Run Claude Code/i), {
      target: { value: 'Run Claude' },
    })
    fireEvent.change(screen.getByPlaceholderText(/The command to execute/i), {
      target: { value: 'claude' },
    })

    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }))

    const payload = saveCommand.mock.calls[0][0]
    expect(payload.cardType).toBe('')
    expect(payload.toggle).toBeNull()
  })
})

describe('CommandModal options section', () => {
  // The redesigned options section gives each toggle a one-line description so
  // the choices are self-explanatory (the old cramped checkbox row had none).
  it('renders a helper description under each option', () => {
    renderModal(vi.fn())
    expect(screen.getByText(/Send the text without pressing Enter/i)).toBeInTheDocument()
    expect(screen.getByText(/Pin this card to the top of the list/i)).toBeInTheDocument()
    expect(screen.getByText(/Add this card's text to every prompt you send/i)).toBeInTheDocument()
    expect(screen.getByText(/Show Start \+ Stop buttons instead of Run/i)).toBeInTheDocument()
  })

  // Restyling must not break the label/input wiring: every option stays an
  // accessible checkbox that toggles on click (handleChange keys off `name`).
  it('keeps every option an accessible, clickable checkbox', () => {
    renderModal(vi.fn())
    const optionNames = [/Paste Only/i, /Favorite/i, /Always Append/i, /On\/Off Toggle/i]
    for (const optionName of optionNames) {
      const checkbox = screen.getByRole('checkbox', { name: optionName })
      expect(checkbox).not.toBeChecked()
      fireEvent.click(checkbox)
      expect(checkbox).toBeChecked()
    }
  })
})
