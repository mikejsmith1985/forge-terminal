// Verifies the global-constitution-install button on the Forge Workflow card:
// it renders when the card is expanded, confirms before acting, and calls the
// install endpoint, surfacing a success toast.
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import ForgeWorkflowCard from './ForgeWorkflowCard'

describe('ForgeWorkflowCard — global constitution install button', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the global install button when expanded and installs on confirm', async () => {
    const installResult = {
      masterPath: '/home/user/.forge/constitution.md',
      targetsWritten: ['x/CLAUDE.md', 'y/copilot-instructions.md', 'z/GEMINI.md'],
    }
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => installResult,
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onToast = vi.fn()

    // No cwd → the card's status-check effects stay idle, isolating this test
    // to the global action.
    render(<ForgeWorkflowCard onExecuteCommand={vi.fn()} onToast={onToast} cwd={undefined} />)

    // Expand the card.
    fireEvent.click(screen.getByText('Forge Workflow'))

    const installButton = screen.getByRole('button', { name: /Install Constitution Globally/i })
    expect(installButton).toBeInTheDocument()

    fireEvent.click(installButton)

    expect(window.confirm).toHaveBeenCalled()
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

  it('does not call the endpoint when the user cancels the confirm', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(<ForgeWorkflowCard onExecuteCommand={vi.fn()} onToast={vi.fn()} cwd={undefined} />)
    fireEvent.click(screen.getByText('Forge Workflow'))
    fireEvent.click(screen.getByRole('button', { name: /Install Constitution Globally/i }))

    expect(window.confirm).toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
