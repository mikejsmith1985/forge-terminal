// DirectoryCard.test.jsx verifies the Projects browser interactions.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import DirectoryCard from './DirectoryCard'

const MOCK_ROOT_PATH = 'C:\\ProjectsWin'
const MOCK_PROJECT_PATH = 'C:\\ProjectsWin\\DBAI'
const CONTEXT_MENU_CLIENT_X = 120
const CONTEXT_MENU_CLIENT_Y = 80

const mockFetch = vi.fn()
global.fetch = mockFetch

const mockClipboardWriteText = vi.fn()
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: mockClipboardWriteText },
  writable: true,
})

function renderLoadedDirectoryCard(props = {}) {
  localStorage.setItem('forge_directory_card_root', MOCK_ROOT_PATH)
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => [{ name: 'DBAI', path: MOCK_PROJECT_PATH }],
  })
  return render(<DirectoryCard {...props} />)
}

beforeEach(() => {
  localStorage.clear()
  mockFetch.mockReset()
  mockClipboardWriteText.mockReset()
  mockClipboardWriteText.mockResolvedValue(undefined)
})

describe('DirectoryCard folder context menu', () => {
  it('copies a project folder path from the right-click menu', async () => {
    const onToast = vi.fn()
    renderLoadedDirectoryCard({ onToast })

    const projectFolderButton = await screen.findByRole('button', { name: /DBAI/i })
    fireEvent.contextMenu(projectFolderButton, {
      clientX: CONTEXT_MENU_CLIENT_X,
      clientY: CONTEXT_MENU_CLIENT_Y,
    })
    const copyPathMenuItem = screen.getByRole('menuitem', { name: /copy path/i })
    fireEvent.mouseDown(copyPathMenuItem)
    fireEvent.click(copyPathMenuItem)

    await waitFor(() => expect(mockClipboardWriteText).toHaveBeenCalledWith(MOCK_PROJECT_PATH))
    expect(onToast).toHaveBeenCalledWith('Copied folder path', 'success', 1500)
  })

  it('shows an error toast when copying a project folder path fails', async () => {
    const onToast = vi.fn()
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockClipboardWriteText.mockRejectedValueOnce(new Error('Permission denied'))
    renderLoadedDirectoryCard({ onToast })

    const projectFolderButton = await screen.findByRole('button', { name: /DBAI/i })
    fireEvent.contextMenu(projectFolderButton, {
      clientX: CONTEXT_MENU_CLIENT_X,
      clientY: CONTEXT_MENU_CLIENT_Y,
    })
    const copyPathMenuItem = screen.getByRole('menuitem', { name: /copy path/i })
    fireEvent.mouseDown(copyPathMenuItem)
    fireEvent.click(copyPathMenuItem)

    await waitFor(() => {
      expect(onToast).toHaveBeenCalledWith('Failed to copy folder path', 'error', 2500)
    })
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[DirectoryCard] Failed to copy folder path:',
      expect.any(Error),
    )
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    consoleErrorSpy.mockRestore()
  })

  it('does not cd into a project when opening the right-click menu', async () => {
    const onExecute = vi.fn()
    renderLoadedDirectoryCard({ onExecute })

    const projectFolderButton = await screen.findByRole('button', { name: /DBAI/i })
    fireEvent.contextMenu(projectFolderButton, {
      clientX: CONTEXT_MENU_CLIENT_X,
      clientY: CONTEXT_MENU_CLIENT_Y,
    })

    expect(onExecute).not.toHaveBeenCalled()
  })
})
