// useMCPStatus.js — React hook for fetching MCP server status and task queue.
//
// Polls /api/mcp/status at a configurable interval (default 10s) and provides
// the MCPPanel component with server state, tool list, and task queue data.
// Uses the standard session auth (cookie), not the MCP bearer token.
import { useState, useCallback, useRef, useEffect } from 'react'
import { API_CONFIG } from '../config'

// ── Constants ────────────────────────────────────────────────────────────────

const AUTH_TOKEN_KEY = 'forge-auth-token'
const DEFAULT_POLL_INTERVAL_MS = 10_000
const ERROR_AUTO_DISMISS_MS = 8_000

// ── Internal Fetch Helper ────────────────────────────────────────────────────

/** Authenticated fetch against the Forge backend using session cookie/token. */
const mcpFetch = async (urlPath, options = {}) => {
  const token = localStorage.getItem(AUTH_TOKEN_KEY)
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${API_CONFIG.base}${urlPath}`, { ...options, headers })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(body || `API error: ${response.status}`)
  }

  return response.json()
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useMCPStatus provides reactive MCP server state for the dashboard panel.
 *
 * Returns:
 *   serverStatus  — { enabled, tokenHint, endpoint, protocol, tools[], taskCount }
 *   tasks         — PendingTask[] from the broker
 *   isLoading     — true during the initial fetch
 *   error         — auto-dismissing error string (null when healthy)
 *   refresh       — manually trigger a re-fetch
 *   copyToken     — fetch the full token and copy to clipboard
 */
export function useMCPStatus(pollIntervalMs = DEFAULT_POLL_INTERVAL_MS) {
  const [serverStatus, setServerStatus] = useState(null)
  const [tasks, setTasks] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const errorTimerRef = useRef(null)
  const pollRef = useRef(null)
  const isMountedRef = useRef(true)

  // Auto-dismiss errors after a timeout so the panel self-heals
  const setErrorWithAutoDismiss = useCallback((errorMessage) => {
    setError(errorMessage)
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    errorTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) setError(null)
    }, ERROR_AUTO_DISMISS_MS)
  }, [])

  // ── Core fetch — status + tasks in parallel ─────────────────────────────
  const fetchMCPData = useCallback(async () => {
    try {
      const [statusResult, tasksResult] = await Promise.all([
        mcpFetch('/api/mcp/status'),
        mcpFetch('/api/mcp/dashboard/tasks'),
      ])

      if (!isMountedRef.current) return

      setServerStatus(statusResult)
      setTasks(Array.isArray(tasksResult) ? tasksResult : [])
      setError(null)
    } catch (fetchError) {
      if (!isMountedRef.current) return
      setErrorWithAutoDismiss(`MCP status fetch failed: ${fetchError.message}`)
    } finally {
      if (isMountedRef.current) setIsLoading(false)
    }
  }, [setErrorWithAutoDismiss])

  // ── Copy full token to clipboard ────────────────────────────────────────
  const copyToken = useCallback(async () => {
    try {
      const result = await mcpFetch('/api/mcp/dashboard/token')
      if (result?.token) {
        await navigator.clipboard.writeText(result.token)
        return true
      }
      return false
    } catch (fetchError) {
      setErrorWithAutoDismiss(`Token copy failed: ${fetchError.message}`)
      return false
    }
  }, [setErrorWithAutoDismiss])

  // ── Polling lifecycle ───────────────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true
    fetchMCPData()

    pollRef.current = setInterval(fetchMCPData, pollIntervalMs)

    return () => {
      isMountedRef.current = false
      if (pollRef.current) clearInterval(pollRef.current)
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    }
  }, [fetchMCPData, pollIntervalMs])

  return {
    serverStatus,
    tasks,
    isLoading,
    error,
    refresh: fetchMCPData,
    copyToken,
  }
}
