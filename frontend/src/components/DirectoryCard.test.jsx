// DirectoryCard.test.jsx verifies the Projects card create-project workflow.
// It keeps backend failures readable so users can fix setup problems quickly.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import DirectoryCard from './DirectoryCard'

const mockFetch = vi.fn()
global.fetch = mockFetch

beforeEach(() => {
  mockFetch.mockReset()
  localStorage.clear()
})

describe('DirectoryCard — new project creation', () => {
  it('shows plain-text backend errors when project creation fails before JSON is returned', async () => {
    localStorage.setItem('forge_directory_card_root', 'C:\\ProjectsWin')
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'gh repo create failed: missing initial commit',
      })

    render(<DirectoryCard onExecute={vi.fn()} />)

    fireEvent.click(screen.getByTitle('New Project'))
    fireEvent.change(screen.getByPlaceholderText('Project name'), {
      target: { value: 'broken-github-project' },
    })
    fireEvent.click(screen.getByText('Create Project'))

    await waitFor(() => {
      expect(screen.getByText(/gh repo create failed: missing initial commit/)).toBeInTheDocument()
    })
  })
})
