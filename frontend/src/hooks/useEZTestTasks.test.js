// useEZTestTasks.test.js — Unit tests for the EZTest task-polling hook.
// Verifies fetch triggering, interval polling, badge count, error handling,
// and the stop-when-closed behaviour.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useEZTestTasks } from './useEZTestTasks'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockFetch = vi.fn()
global.fetch = mockFetch

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns a resolved fetch response wrapping the given task array. */
function buildTasksResponse(tasks = []) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ tasks }),
  })
}

/** A minimal task object with the shape the hook expects. */
function buildTask(overrides = {}) {
  return {
    id: 'abc12345-0000-0000-0000-000000000000',
    type: 'bug-report',
    status: 'pending',
    source: 'eztest-mcp',
    payload: 'Fix the login button',
    submittedAt: new Date().toISOString(),
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers()
  mockFetch.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useEZTestTasks', () => {
  it('returns empty tasks and zero badge count when panel is closed', () => {
    const { result } = renderHook(() => useEZTestTasks(false))

    expect(result.current.tasks).toEqual([])
    expect(result.current.activeBadgeCount).toBe(0)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('fetches immediately when panel opens', async () => {
    const pendingTask = buildTask({ status: 'pending' })
    mockFetch.mockReturnValue(buildTasksResponse([pendingTask]))

    const { result } = renderHook(() => useEZTestTasks(true))

    await waitFor(() => expect(result.current.tasks).toHaveLength(1))
    expect(mockFetch).toHaveBeenCalledWith('/api/mcp/ui-tasks')
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('counts only pending and running tasks in activeBadgeCount', async () => {
    const tasks = [
      buildTask({ status: 'pending' }),
      buildTask({ status: 'running' }),
      buildTask({ status: 'done' }),
      buildTask({ status: 'failed' }),
    ]
    mockFetch.mockReturnValue(buildTasksResponse(tasks))

    const { result } = renderHook(() => useEZTestTasks(true))

    await waitFor(() => expect(result.current.tasks).toHaveLength(4))
    // Only pending + running count toward the badge.
    expect(result.current.activeBadgeCount).toBe(2)
  })

  it('polls again after POLLING_INTERVAL_MS', async () => {
    mockFetch.mockReturnValue(buildTasksResponse([buildTask()]))

    renderHook(() => useEZTestTasks(true))

    // Wait for the initial fetch.
    await act(async () => { await Promise.resolve() })
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // Advance past the 5-second interval.
    await act(async () => {
      vi.advanceTimersByTime(5001)
      await Promise.resolve()
    })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('stops polling when panel closes', async () => {
    mockFetch.mockReturnValue(buildTasksResponse([]))

    const { rerender } = renderHook(({ isOpen }) => useEZTestTasks(isOpen), {
      initialProps: { isOpen: true },
    })

    await act(async () => { await Promise.resolve() })
    const callCountAfterOpen = mockFetch.mock.calls.length

    // Close the panel — the interval should be cleared.
    rerender({ isOpen: false })

    await act(async () => {
      vi.advanceTimersByTime(10000)
      await Promise.resolve()
    })

    // No additional fetches after panel was closed.
    expect(mockFetch.mock.calls.length).toBe(callCountAfterOpen)
  })

  it('sets error when fetch returns a non-ok status', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 })

    const { result } = renderHook(() => useEZTestTasks(true))

    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.error).toContain('500')
    expect(result.current.isLoading).toBe(false)
  })

  it('sets error when fetch throws a network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useEZTestTasks(true))

    await waitFor(() => expect(result.current.error).toBe('Network error'))
  })

  it('clears error on a successful subsequent fetch', async () => {
    // First fetch fails, second succeeds.
    mockFetch
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockReturnValue(buildTasksResponse([buildTask()]))

    const { result } = renderHook(() => useEZTestTasks(true))

    await waitFor(() => expect(result.current.error).not.toBeNull())

    // Advance the polling interval to trigger the second (successful) fetch.
    await act(async () => {
      vi.advanceTimersByTime(5001)
      await Promise.resolve()
    })

    await waitFor(() => expect(result.current.error).toBeNull())
    expect(result.current.tasks).toHaveLength(1)
  })

  it('exposes a refresh function that re-fetches immediately', async () => {
    mockFetch.mockReturnValue(buildTasksResponse([]))

    const { result } = renderHook(() => useEZTestTasks(true))

    // Wait for the initial fetch to settle before counting.
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Reset the call count so we can assert exactly one additional call.
    mockFetch.mockClear()

    await act(async () => {
      result.current.refresh()
      await Promise.resolve()
    })

    // After calling refresh() once, there should be exactly one new fetch.
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
