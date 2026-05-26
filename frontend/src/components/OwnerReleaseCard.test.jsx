// OwnerReleaseCard tests protect release commands that are copied into external repositories.
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import OwnerReleaseCard from './OwnerReleaseCard'

const createJsonResponse = (responseBody) => Promise.resolve({
  ok: true,
  json: () => Promise.resolve(responseBody),
})

describe('OwnerReleaseCard', () => {
  beforeEach(() => {
    localStorage.clear()
    global.fetch = vi.fn((url) => {
      if (url === '/api/project/release-script') {
        return createJsonResponse({ exists: false })
      }

      return createJsonResponse({ version: 'v0.3.3' })
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses a conventional commit message for default external release commands', async () => {
    render(
      <OwnerReleaseCard
        cwd="C:\\ProjectsWin\\GitDiscord"
        onExecuteCommand={vi.fn()}
        onToast={vi.fn()}
        shellType="powershell"
      />
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /release v0\.3\.4/i })).not.toBeDisabled()
    })

    fireEvent.click(screen.getByRole('button', { name: /show command/i }))

    expect(screen.getByText(/git commit -m "chore: release v0\.3\.4"/i)).toBeInTheDocument()
    expect(screen.queryByText(/git commit -m "Release v0\.3\.4"/)).not.toBeInTheDocument()
  })
})
