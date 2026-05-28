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
        cwd={'C:\\ProjectsWin\\GitDiscord'}
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

  it('starts local release scripts as background jobs instead of terminal commands', async () => {
    const executeCommand = vi.fn()
    const showToast = vi.fn()
    global.fetch = vi.fn((url, options = {}) => {
      if (url === '/api/project/release-script') {
        return createJsonResponse({ exists: true })
      }
      if (url === '/api/project/release-jobs' && options.method === 'POST') {
        return createJsonResponse({
          job_id: 'release-job-1',
          status: 'queued',
          job: { job_id: 'release-job-1', status: 'queued' },
        })
      }

      return createJsonResponse({ version: 'v0.3.3' })
    })

    render(
      <OwnerReleaseCard
        cwd={'C:\\ProjectsWin\\forge-terminal'}
        onExecuteCommand={executeCommand}
        onToast={showToast}
        shellType="powershell"
      />
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /release v0\.3\.4/i })).not.toBeDisabled()
    })

    fireEvent.click(screen.getByRole('button', { name: /release v0\.3\.4/i }))
    fireEvent.change(screen.getByLabelText(/release notes/i), {
      target: { value: 'Background release manager' },
    })
    fireEvent.click(screen.getByLabelText(/include uncommitted changes/i))
    fireEvent.click(screen.getByLabelText(/proceed despite warnings/i))
    fireEvent.click(screen.getByRole('button', { name: /start background release/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/project/release-jobs', expect.objectContaining({
        method: 'POST',
      }))
    })

    const releaseJobCall = global.fetch.mock.calls.find(([url]) => url === '/api/project/release-jobs')
    const payload = JSON.parse(releaseJobCall[1].body)
    expect(payload).toMatchObject({
      repoPath: 'C:\\ProjectsWin\\forge-terminal',
      version: '0.3.4',
      releaseNotes: 'Background release manager',
      includeUncommittedChanges: true,
      shouldProceedWithWarnings: true,
    })
    expect(executeCommand).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledWith('Release v0.3.4 started in the background', 'info', 3000)
  })
})
