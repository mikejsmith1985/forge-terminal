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

  it('relabels a tab when the shell switches to a different project root', async () => {
    const session = makeSession([
      {
        id: 'tab-1',
        title: 'AzureWorkflow',
        currentDirectory: 'C:/ProjectsWin/AzureWorkflow/AzureWorkflowPOC',
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

    act(() => {
      result.current.updateTabDirectory('tab-1', 'C:/ProjectsWin/forge-terminal')
    })

    expect(result.current.tabs.find((t) => t.id === 'tab-1')?.title).toBe('forge-terminal')
  })

  it('does NOT relabel during deep navigation within the same project', async () => {
    const session = makeSession([
      {
        id: 'tab-1',
        title: 'forge-terminal',
        currentDirectory: 'C:/ProjectsWin/forge-terminal',
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

    act(() => {
      result.current.updateTabDirectory('tab-1', 'C:/ProjectsWin/forge-terminal/internal/commands')
    })

    expect(result.current.tabs.find((t) => t.id === 'tab-1')?.title).toBe('forge-terminal')
  })

  it('never relabels over a manual rename, even on a project switch', async () => {
    const session = makeSession([
      {
        id: 'tab-1',
        title: 'AzureWorkflow',
        currentDirectory: 'C:/ProjectsWin/AzureWorkflow/AzureWorkflowPOC',
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

    act(() => {
      result.current.updateTabTitle('tab-1', 'My Build')
    })
    act(() => {
      result.current.updateTabDirectory('tab-1', 'C:/ProjectsWin/forge-terminal')
    })

    expect(result.current.tabs.find((t) => t.id === 'tab-1')?.title).toBe('My Build')
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

  it('never mints a tab id that collides with a restored index (gapped session)', async () => {
    // A session whose indices have a gap (2 and 4) — the shape left behind when
    // an earlier tab was closed. The next created tab must take index 5, never
    // re-use the restored index 4. This is the root cause of the duplicate
    // "tab-5" sessions seen after an app update.
    const session = makeSession([
      {
        id: 'tab-2-aaa',
        title: 'forge-terminal',
        currentDirectory: 'C:/ProjectsWin/forge-terminal',
        shellConfig: { shellType: 'powershell', wslDistro: '', wslHomePath: '' },
      },
      {
        id: 'tab-4-bbb',
        title: 'AzureWorkflowPOC',
        currentDirectory: 'C:/ProjectsWin/AzureWorkflowPOC',
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

    act(() => {
      result.current.createTab({ shellType: 'powershell' }, 'C:/ProjectsWin/forge-terminal')
    })

    const allIds = result.current.tabs.map((tab) => tab.id)
    const allIndices = allIds.map((id) => parseInt(/^tab-(\d+)/.exec(id)[1], 10))
    // Every tab index is unique — no collision with a restored index.
    expect(new Set(allIndices).size).toBe(allIndices.length)
  })
})
