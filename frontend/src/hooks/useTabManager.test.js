// Tests for useTabManager session-restore behaviour (tab naming rebuild).
//
// Core invariant: labels are write-once. On restore the saved label is kept,
// EXCEPT a legacy/corrupted one (empty, file-like, generic "Terminal N", or
// control-character-bearing) which self-heals once from the saved directory via
// computeTabLabel. There is no naming-strategy switching anymore.
import { act, renderHook } from '@testing-library/react'
import { useTabManager } from './useTabManager'

const makeSession = (tabs) => ({
  tabs,
  activeTabId: tabs[0]?.id ?? null,
})

describe('useTabManager — session restore', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('self-heals a legacy generic "Terminal N" title to the project-root name', async () => {
    const session = makeSession([
      {
        id: 'tab-1',
        title: 'Terminal 1',
        currentDirectory: 'C:/ProjectsWin/3d-repos',
        shellConfig: { shellType: 'powershell', wslDistro: '', wslHomePath: '' },
      },
    ])

    global.fetch = vi.fn((url) =>
      url === '/api/sessions'
        ? Promise.resolve({ ok: true, json: () => Promise.resolve(session) })
        : Promise.resolve({ ok: true, json: () => Promise.resolve(null) })
    )

    const { result } = renderHook(() => useTabManager({ shellType: 'powershell' }, 'auto-cycle'))

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const tab = result.current.tabs.find((t) => t.id === 'tab-1')
    expect(tab?.title).toBe('3d-repos')
  })

  it('keeps a real saved label untouched on restore (labels are write-once)', async () => {
    const session = makeSession([
      {
        id: 'tab-1',
        title: 'my-custom-name',
        currentDirectory: 'C:/ProjectsWin/3d-repos/frontend/src',
        shellConfig: { shellType: 'powershell', wslDistro: '', wslHomePath: '' },
      },
    ])

    global.fetch = vi.fn((url) =>
      url === '/api/sessions'
        ? Promise.resolve({ ok: true, json: () => Promise.resolve(session) })
        : Promise.resolve({ ok: true, json: () => Promise.resolve(null) })
    )

    const { result } = renderHook(() => useTabManager({ shellType: 'powershell' }, 'auto-cycle'))

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const tab = result.current.tabs.find((t) => t.id === 'tab-1')
    expect(tab?.title).toBe('my-custom-name')
  })
})
