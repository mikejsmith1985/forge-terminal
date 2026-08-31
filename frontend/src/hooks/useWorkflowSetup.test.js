// Tests for the global-constitution-install action and the default-config
// parity with the Go backend (internal/workflow/types.go DefaultConfig).
import { act, renderHook, waitFor } from '@testing-library/react'

import { useWorkflowSetup } from './useWorkflowSetup'

describe('useWorkflowSetup — global constitution install', () => {
  beforeEach(() => {
    // Each test installs its own fetch mock.
    vi.restoreAllMocks()
  })

  it('POSTs to the global-install endpoint and returns the result', async () => {
    const fakeResult = {
      masterPath: '/home/user/.forge/constitution.md',
      targetsWritten: ['a/CLAUDE.md', 'b/copilot-instructions.md', 'c/GEMINI.md'],
    }
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => fakeResult,
    })

    const { result } = renderHook(() => useWorkflowSetup())

    let returned
    await act(async () => {
      returned = await result.current.installGlobalConstitution()
    })

    // It called the right endpoint with POST.
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [calledUrl, calledOptions] = fetchSpy.mock.calls[0]
    expect(calledUrl).toContain('/api/workflow/global-install')
    expect(calledOptions.method).toBe('POST')

    // It surfaced the parsed result and cleared the busy flag.
    expect(returned).toEqual(fakeResult)
    await waitFor(() => expect(result.current.isInstallingGlobal).toBe(false))
  })

  it('returns null and surfaces an error when the install fails', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'vault is not initialised',
    })

    const { result } = renderHook(() => useWorkflowSetup())

    let returned = 'unset'
    await act(async () => {
      returned = await result.current.installGlobalConstitution()
    })

    expect(returned).toBeNull()
    await waitFor(() => expect(result.current.error).toBeTruthy())
  })

  it('default config enables the SDD modules, matching the Go backend', () => {
    const { result } = renderHook(() => useWorkflowSetup())
    const enabled = result.current.config.enabledModules
    expect(enabled).toContain('constitution')
    expect(enabled).toContain('speckit-pipeline')
  })
})
