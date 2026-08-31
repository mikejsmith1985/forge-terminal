// Guards SC-004 of the tab-naming rebuild: the Tab Controls settings panel must
// expose ZERO tab-naming strategy options — naming is no longer configurable.
import { render, screen, waitFor } from '@testing-library/react'

import TabControlsPanel from './TabControlsPanel'

describe('TabControlsPanel — no tab-naming configuration', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders no tab-naming strategy options', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            perTab: {},
            globalPreset: 'auto-cycle',
            splitThemes: false,
            terminalTheme: { theme: 'molten', mode: 'dark' },
            controlRibbon: { theme: 'molten', mode: 'dark' },
          }),
      })
    )

    render(<TabControlsPanel onToast={vi.fn()} />)

    // Panel finished loading once a non-naming section renders.
    await waitFor(() => expect(screen.getByText('Global Presets')).toBeInTheDocument())

    // None of the old naming strategy UI may remain.
    expect(screen.queryByText('Tab Naming')).not.toBeInTheDocument()
    expect(screen.queryByText('Project Root')).not.toBeInTheDocument()
    expect(screen.queryByText('Current Directory')).not.toBeInTheDocument()
    expect(screen.queryByText('Parent / Child')).not.toBeInTheDocument()
  })
})
