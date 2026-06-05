// Tests for useTabManager session restore + startup sync behaviour.
//
// Core invariant guarded here: when localStorage loses the user's naming
// strategy (e.g. cleared cache, fresh install), the session restore runs
// with the default 'project-root' strategy and re-derives any "Terminal N"
// saved titles into directory-based project names.  The startup sync
// (a useEffect in App.jsx that fetches /api/tab-defaults after sessionLoaded
// becomes true) corrects this by calling retitleAllTabsFromCwd with the
// server-authoritative strategy.
import { act, renderHook } from '@testing-library/react'
import { useTabManager } from './useTabManager'

const makeSession = (tabs) => ({
  tabs,
  activeTabId: tabs[0]?.id ?? null,
})

describe('useTabManager — session restore re-derivation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('re-derives "Terminal N" saved titles to project-root names when localStorage strategy is stale', async () => {
    // Arrange: session has numbered-style titles from a previous run under 'numbered'
    // strategy, but localStorage lost that key → useTabManager defaults to 'project-root'.
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

    const { result } = renderHook(() =>
      useTabManager({ shellType: 'powershell' }, 'auto-cycle', 'project-root', 'Dev', '')
    )

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Bug condition: 'Terminal 1' triggers re-derivation (title starts with 'Terminal '),
    // and project-root strategy converts the directory path to a project name.
    const tab = result.current.tabs.find((t) => t.id === 'tab-1')
    expect(tab?.title).toBe('3d-repos')
  })

  it('retitleAllTabsFromCwd with server strategy corrects project-root names back to numbered', async () => {
    // Same setup — tab lands on "3d-repos" after stale-strategy restore.
    const session = makeSession([
      {
        id: 'tab-1',
        title: 'Terminal 1',
        currentDirectory: 'C:/ProjectsWin/3d-repos',
        shellConfig: { shellType: 'powershell', wslDistro: '', wslHomePath: '' },
      },
      {
        id: 'tab-2',
        title: 'Terminal 2',
        currentDirectory: 'C:/ProjectsWin/3D-Printing',
        shellConfig: { shellType: 'powershell', wslDistro: '', wslHomePath: '' },
      },
    ])

    global.fetch = vi.fn((url) =>
      url === '/api/sessions'
        ? Promise.resolve({ ok: true, json: () => Promise.resolve(session) })
        : Promise.resolve({ ok: true, json: () => Promise.resolve(null) })
    )

    const { result } = renderHook(() =>
      useTabManager({ shellType: 'powershell' }, 'auto-cycle', 'project-root', 'Dev', '')
    )

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Startup sync fires: /api/tab-defaults returns 'numbered';
    // retitleAllTabsFromCwd is called with the correct server strategy.
    act(() => {
      result.current.retitleAllTabsFromCwd('numbered', 'Dev', '')
    })

    const tab1 = result.current.tabs.find((t) => t.id === 'tab-1')
    const tab2 = result.current.tabs.find((t) => t.id === 'tab-2')
    expect(tab1?.title).toBe('Terminal 1')
    expect(tab2?.title).toBe('Terminal 2')
  })

  it('retitleAllTabsFromCwd with shell-type strategy replaces project names with shell labels', async () => {
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

    const { result } = renderHook(() =>
      useTabManager({ shellType: 'powershell' }, 'auto-cycle', 'project-root', 'Dev', '')
    )

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    act(() => {
      result.current.retitleAllTabsFromCwd('shell-type', 'Dev', '')
    })

    const tab = result.current.tabs.find((t) => t.id === 'tab-1')
    expect(tab?.title).toBe('PowerShell 1')
  })
})
