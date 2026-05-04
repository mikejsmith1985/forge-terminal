// EZTestTaskPanel.test.jsx — Unit tests for the EZTest task-status panel.
// Verifies rendering states (empty, loading, error, task list) and
// user interactions (close, refresh, expand payload, copy task ID).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import EZTestTaskPanel from './EZTestTaskPanel'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockFetch = vi.fn()
global.fetch = mockFetch

const mockClipboardWriteText = vi.fn()
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: mockClipboardWriteText },
  writable: true,
})

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns a resolved fetch response wrapping the given task array. */
function buildTasksResponse(tasks = []) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ tasks }),
  })
}

/**
 * A minimal task object whose shape mirrors the Go TaskBroker output.
 * The `submittedAt` defaults to right now so relative-time rendering
 * shows "just now" — predictable in assertions.
 */
function buildTask(overrides = {}) {
  return {
    id: 'abc12345-dead-beef-cafe-000000000001',
    type: 'bug-report',
    status: 'pending',
    source: 'eztest-mcp',
    payload: 'The login button does not respond to clicks in Safari.',
    submittedAt: new Date().toISOString(),
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockFetch.mockReset()
  mockClipboardWriteText.mockReset()
})

describe('EZTestTaskPanel', () => {
  // ── Visibility ──────────────────────────────────────────────────────────────

  it('renders nothing when isOpen is false', () => {
    mockFetch.mockReturnValue(buildTasksResponse([]))
    const { container } = render(<EZTestTaskPanel isOpen={false} onClose={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the panel header when isOpen is true', async () => {
    mockFetch.mockReturnValue(buildTasksResponse([]))
    render(<EZTestTaskPanel isOpen={true} onClose={vi.fn()} />)

    expect(await screen.findByRole('dialog', { name: /eztest tasks/i })).toBeInTheDocument()
    expect(screen.getByText('EZTest Tasks')).toBeInTheDocument()
  })

  // ── Empty state ─────────────────────────────────────────────────────────────

  it('shows the empty state when there are no tasks', async () => {
    mockFetch.mockReturnValue(buildTasksResponse([]))
    render(<EZTestTaskPanel isOpen={true} onClose={vi.fn()} />)

    expect(await screen.findByText('No tasks yet')).toBeInTheDocument()
    expect(screen.getByText(/when eztest sends a bug report/i)).toBeInTheDocument()
  })

  // ── Task list ───────────────────────────────────────────────────────────────

  it('renders a task card with status, type, and source', async () => {
    const task = buildTask({ status: 'running', type: 'code-fix', source: 'copilot-chat' })
    mockFetch.mockReturnValue(buildTasksResponse([task]))

    render(<EZTestTaskPanel isOpen={true} onClose={vi.fn()} />)

    expect(await screen.findByText('running')).toBeInTheDocument()
    expect(screen.getByText('code fix')).toBeInTheDocument()     // hyphens replaced with spaces
    expect(screen.getByText('copilot-chat')).toBeInTheDocument()
  })

  it('shows the task count badge in the header when tasks exist', async () => {
    const tasks = [buildTask(), buildTask({ id: 'abc12345-dead-beef-cafe-000000000002' })]
    mockFetch.mockReturnValue(buildTasksResponse(tasks))

    render(<EZTestTaskPanel isOpen={true} onClose={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument())
  })

  it('renders the truncated payload preview for long payloads', async () => {
    const longPayload = 'A'.repeat(200)
    const task = buildTask({ payload: longPayload })
    mockFetch.mockReturnValue(buildTasksResponse([task]))

    render(<EZTestTaskPanel isOpen={true} onClose={vi.fn()} />)

    // The preview shows the first 120 chars followed by ellipsis.
    await waitFor(() => {
      const preview = screen.getByText(new RegExp(`^A{120}…$`))
      expect(preview).toBeInTheDocument()
    })
    expect(screen.getByText(/show full payload/i)).toBeInTheDocument()
  })

  it('expands the payload when the preview is clicked', async () => {
    const longPayload = 'B'.repeat(200)
    const task = buildTask({ payload: longPayload })
    mockFetch.mockReturnValue(buildTasksResponse([task]))

    render(<EZTestTaskPanel isOpen={true} onClose={vi.fn()} />)

    const expandHint = await screen.findByText(/show full payload/i)
    fireEvent.click(expandHint.closest('[role="button"]'))

    await waitFor(() => {
      expect(screen.getByText(longPayload)).toBeInTheDocument()
    })
    expect(screen.getByText(/collapse/i)).toBeInTheDocument()
  })

  // ── Copy task ID ────────────────────────────────────────────────────────────

  it('copies the task ID to clipboard when the ID button is clicked', async () => {
    mockClipboardWriteText.mockResolvedValue(undefined)
    const task = buildTask({ id: 'abc12345-dead-beef-cafe-000000000001' })
    mockFetch.mockReturnValue(buildTasksResponse([task]))

    render(<EZTestTaskPanel isOpen={true} onClose={vi.fn()} />)

    const copyBtn = await screen.findByRole('button', { name: /copy task id/i })
    fireEvent.click(copyBtn)

    await waitFor(() => {
      expect(mockClipboardWriteText).toHaveBeenCalledWith(task.id)
    })
  })

  // ── Error state ─────────────────────────────────────────────────────────────

  it('shows an error message when the fetch fails', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503 })

    render(<EZTestTaskPanel isOpen={true} onClose={vi.fn()} />)

    expect(await screen.findByText(/could not load tasks/i)).toBeInTheDocument()
    expect(screen.getByText(/503/)).toBeInTheDocument()
  })

  // ── Close / Refresh ─────────────────────────────────────────────────────────

  it('calls onClose when the close button is clicked', async () => {
    mockFetch.mockReturnValue(buildTasksResponse([]))
    const handleClose = vi.fn()

    render(<EZTestTaskPanel isOpen={true} onClose={handleClose} />)

    const closeBtn = await screen.findByRole('button', { name: /close eztest panel/i })
    fireEvent.click(closeBtn)

    expect(handleClose).toHaveBeenCalledOnce()
  })

  it('triggers a re-fetch when the refresh button is clicked', async () => {
    mockFetch.mockReturnValue(buildTasksResponse([]))

    render(<EZTestTaskPanel isOpen={true} onClose={vi.fn()} />)

    // Wait for the initial fetch to complete.
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

    const refreshBtn = screen.getByRole('button', { name: /refresh task list/i })
    fireEvent.click(refreshBtn)

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))
  })
})
