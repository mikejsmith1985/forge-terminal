// useMCPStatus.test.js — Unit tests for the MCP status polling hook.
//
// Mocks global fetch to simulate backend responses. Validates that the hook
// correctly fetches status + tasks in parallel, handles errors, and cleans up.
// Uses real timers with waitFor to avoid infinite-loop issues with setInterval.
import { renderHook, act, waitFor } from '@testing-library/react'
import { useMCPStatus } from './useMCPStatus'

// ── Fetch Mock Setup ────────────────────────────────────────────────────────

const mockStatusResponse = {
  enabled: true,
  tokenHint: 'abc12345…wxyz',
  endpoint: '/api/mcp',
  protocol: 'MCP 2024-11-05 (JSON-RPC 2.0)',
  tools: ['terminal_sessions', 'file_read', 'task_submit'],
  taskCount: 1,
}

const mockTasksResponse = [
  {
    id: 'task-001',
    type: 'bug-report',
    payload: 'Fix the button',
    source: 'eztest',
    submittedAt: '2024-01-15T10:30:00Z',
    status: 'pending',
  },
]

const mockTokenResponse = { token: 'full-secret-token-value-here' }

let fetchResponses = {}

beforeEach(() => {
  fetchResponses = {
    '/api/mcp/status': mockStatusResponse,
    '/api/mcp/dashboard/tasks': mockTasksResponse,
    '/api/mcp/dashboard/token': mockTokenResponse,
  }

  global.fetch = vi.fn((url) => {
    const urlPath = new URL(url).pathname
    const responseBody = fetchResponses[urlPath]

    if (responseBody) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(responseBody),
        text: () => Promise.resolve(JSON.stringify(responseBody)),
      })
    }

    return Promise.resolve({
      ok: false,
      status: 404,
      text: () => Promise.resolve('Not found'),
    })
  })

  Storage.prototype.getItem = vi.fn(() => 'test-session-token')

  Object.assign(navigator, {
    clipboard: {
      writeText: vi.fn(() => Promise.resolve()),
    },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useMCPStatus', () => {
  // Use a very long poll interval so the interval doesn't fire during tests
  const LONG_POLL_INTERVAL = 999_999

  it('fetches status and tasks on mount', async () => {
    const { result } = renderHook(() => useMCPStatus(LONG_POLL_INTERVAL))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.serverStatus).toEqual(mockStatusResponse)
    expect(result.current.tasks).toEqual(mockTasksResponse)
    expect(result.current.error).toBeNull()
  })

  it('sets error when fetch fails', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      })
    )

    const { result } = renderHook(() => useMCPStatus(LONG_POLL_INTERVAL))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toContain('MCP status fetch failed')
  })

  it('copyToken fetches token and writes to clipboard', async () => {
    const { result } = renderHook(() => useMCPStatus(LONG_POLL_INTERVAL))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    let copyResult
    await act(async () => {
      copyResult = await result.current.copyToken()
    })

    expect(copyResult).toBe(true)
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('full-secret-token-value-here')
  })

  it('returns tasks as empty array when backend returns non-array', async () => {
    fetchResponses['/api/mcp/dashboard/tasks'] = null

    const { result } = renderHook(() => useMCPStatus(LONG_POLL_INTERVAL))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.tasks).toEqual([])
  })

  it('refresh function triggers a re-fetch', async () => {
    const { result } = renderHook(() => useMCPStatus(LONG_POLL_INTERVAL))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    global.fetch.mockClear()

    await act(async () => {
      await result.current.refresh()
    })

    // Should have made 2 fetch calls (status + tasks)
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })
})
