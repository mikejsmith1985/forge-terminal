// Verifies the global-constitution-install button on the Forge Workflow card:
// it renders when the card is expanded, confirms via a styled in-app panel (NOT a
// native window.confirm), calls the install endpoint on confirm, and does nothing
// on cancel.
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import ForgeWorkflowCard from './ForgeWorkflowCard'

describe('ForgeWorkflowCard — global constitution install button', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('installs after the user confirms in the styled panel (no native confirm)', async () => {
    const installResult = {
      masterPath: '/home/user/.forge/constitution.md',
      targetsWritten: ['x/CLAUDE.md', 'y/copilot-instructions.md', 'z/GEMINI.md'],
    }
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => installResult,
    })
    const confirmSpy = vi.spyOn(window, 'confirm')
    const onToast = vi.fn()

    // No cwd → the card's status-check effects stay idle, isolating this test.
    render(<ForgeWorkflowCard onExecuteCommand={vi.fn()} onToast={onToast} cwd={undefined} />)

    // Expand the card, then click the trigger button.
    fireEvent.click(screen.getByText('Forge Workflow'))
    fireEvent.click(screen.getByRole('button', { name: /Install Constitution Globally/i }))

    // The styled in-app confirmation appears — and we never used window.confirm.
    const confirmButton = await screen.findByRole('button', { name: /^Install$/ })
    expect(confirmSpy).not.toHaveBeenCalled()

    fireEvent.click(confirmButton)

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/workflow/global-install'),
        expect.objectContaining({ method: 'POST' })
      )
    )
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(expect.stringContaining('3 CLI tool'), 'success')
    )
  })

  it('does not call the endpoint when the user cancels the confirmation', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({}) })

    render(<ForgeWorkflowCard onExecuteCommand={vi.fn()} onToast={vi.fn()} cwd={undefined} />)
    fireEvent.click(screen.getByText('Forge Workflow'))
    fireEvent.click(screen.getByRole('button', { name: /Install Constitution Globally/i }))

    const cancelButton = await screen.findByRole('button', { name: /^Cancel$/ })
    fireEvent.click(cancelButton)

    expect(fetchSpy).not.toHaveBeenCalled()
    // The confirmation is dismissed.
    expect(screen.queryByRole('button', { name: /^Install$/ })).not.toBeInTheDocument()
  })
})
