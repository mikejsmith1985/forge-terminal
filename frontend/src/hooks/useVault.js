/**
 * useVault.js — React hook for the Forge Vault secret management feature.
 *
 * Mirrors the useTutorSession.js pattern: vaultFetch helper, useState/useCallback,
 * timed error clearing, and a clean public API surface.
 *
 * All communication goes to the /api/vault/* endpoints on the configured backend.
 * Secret values are NEVER stored in component state — the API never returns them.
 */

import { useState, useCallback, useRef } from 'react'
import { API_CONFIG } from '../config'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ERROR_AUTO_CLEAR_MS = 5000

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

/**
 * Thin fetch wrapper for Vault API calls.
 * Prepends the configured API base URL, sets JSON content type,
 * and throws a descriptive Error on any non-2xx response.
 *
 * @param {string} path - API path, e.g. '/api/vault/entries'
 * @param {RequestInit} [options] - Standard fetch options
 * @returns {Promise<any>} Parsed JSON response body
 */
const vaultFetch = async (path, options = {}) => {
  const baseUrl = API_CONFIG.base

  const requestHeaders = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: requestHeaders,
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '')
    throw new Error(errorBody || `Vault API error: ${response.status} ${response.statusText}`)
  }

  // DELETE and some POSTs return 204 No Content
  if (response.status === 204) return null

  return response.json()
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * React hook for managing Forge Vault entries.
 *
 * Provides full CRUD operations for vault secrets plus auto-inject toggling
 * and session injection. Secret values are never stored client-side.
 *
 * @returns {{
 *   entries: Array,
 *   status: object|null,
 *   isLoading: boolean,
 *   isAdding: boolean,
 *   error: string|null,
 *   loadEntries: () => Promise<void>,
 *   loadStatus: () => Promise<void>,
 *   addEntry: (request: object) => Promise<boolean>,
 *   removeEntry: (id: string) => Promise<void>,
 *   toggleAutoInject: (id: string, shouldAutoInject: boolean) => Promise<void>,
 *   injectEntries: (entryIds: string[]) => Promise<object|null>,
 *   clearError: () => void,
 * }}
 */
export function useVault() {
  const [entries, setEntries] = useState([])
  const [status, setStatus] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [error, setError] = useState(null)

  const errorTimerRef = useRef(null)

  // ---------------------------------------------------------------------------
  // Error helpers
  // ---------------------------------------------------------------------------

  /**
   * Sets the error message and schedules an automatic clear after 5 seconds.
   * Cancels any previously scheduled clear so timers don't stack.
   */
  const setTimedError = useCallback((message) => {
    setError(message)
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    errorTimerRef.current = setTimeout(() => setError(null), ERROR_AUTO_CLEAR_MS)
  }, [])

  /** Immediately clears the error and cancels any pending auto-clear timer. */
  const clearError = useCallback(() => {
    setError(null)
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current)
      errorTimerRef.current = null
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Read operations
  // ---------------------------------------------------------------------------

  /**
   * Loads all vault entries from the backend.
   * Entry objects contain metadata only — no secret values are returned.
   */
  const loadEntries = useCallback(async () => {
    setIsLoading(true)
    try {
      const responseData = await vaultFetch('/api/vault/entries')
      setEntries(Array.isArray(responseData) ? responseData : [])
    } catch (err) {
      console.error('[Vault] loadEntries error:', err)
      setTimedError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [setTimedError])

  /**
   * Loads the vault status summary (isOpen, entryCount, autoInjectCount, vaultPath).
   * Safe to call at any time; does not affect the entries list.
   */
  const loadStatus = useCallback(async () => {
    setIsLoading(true)
    try {
      const responseData = await vaultFetch('/api/vault/status')
      setStatus(responseData)
    } catch (err) {
      console.error('[Vault] loadStatus error:', err)
      setTimedError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [setTimedError])

  // ---------------------------------------------------------------------------
  // Write operations
  // ---------------------------------------------------------------------------

  /**
   * Stores a new secret in the vault.
   * The secret value is sent once and never returned by subsequent API calls.
   *
   * @param {{ secretName: string, envVarName: string, secretValue: string, description?: string, shouldAutoInject: boolean }} request
   * @returns {Promise<boolean>} True if the entry was created successfully
   */
  const addEntry = useCallback(async (request) => {
    setIsAdding(true)
    try {
      const createdEntry = await vaultFetch('/api/vault/entries', {
        method: 'POST',
        body: JSON.stringify(request),
      })
      // Append to local list so the UI updates without a full reload
      setEntries((previousEntries) => [...previousEntries, createdEntry])
      // Update status counts optimistically
      setStatus((previousStatus) =>
        previousStatus
          ? {
              ...previousStatus,
              entryCount: previousStatus.entryCount + 1,
              autoInjectCount: request.shouldAutoInject
                ? previousStatus.autoInjectCount + 1
                : previousStatus.autoInjectCount,
            }
          : previousStatus
      )
      return true
    } catch (err) {
      console.error('[Vault] addEntry error:', err)
      setTimedError(err.message)
      return false
    } finally {
      setIsAdding(false)
    }
  }, [setTimedError])

  /**
   * Permanently deletes a vault entry by its ID.
   * Updates local state immediately on success to keep the UI responsive.
   *
   * @param {string} entryId - The ID of the entry to delete
   */
  const removeEntry = useCallback(async (entryId) => {
    setIsLoading(true)
    try {
      await vaultFetch(`/api/vault/entries?id=${encodeURIComponent(entryId)}`, {
        method: 'DELETE',
      })
      setEntries((previousEntries) => previousEntries.filter((entry) => entry.id !== entryId))
      setStatus((previousStatus) =>
        previousStatus
          ? { ...previousStatus, entryCount: Math.max(0, previousStatus.entryCount - 1) }
          : previousStatus
      )
    } catch (err) {
      console.error('[Vault] removeEntry error:', err)
      setTimedError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [setTimedError])

  /**
   * Toggles whether an entry is automatically injected into new terminal sessions.
   * Updates local state optimistically for instant UI feedback.
   *
   * @param {string} entryId - The ID of the entry to update
   * @param {boolean} shouldAutoInject - The new auto-inject state
   */
  const toggleAutoInject = useCallback(async (entryId, shouldAutoInject) => {
    // Optimistic update — revert on failure
    setEntries((previousEntries) =>
      previousEntries.map((entry) =>
        entry.id === entryId ? { ...entry, shouldAutoInject } : entry
      )
    )
    try {
      await vaultFetch('/api/vault/auto-inject', {
        method: 'POST',
        body: JSON.stringify({ id: entryId, shouldAutoInject }),
      })
    } catch (err) {
      console.error('[Vault] toggleAutoInject error:', err)
      // Revert optimistic update on failure
      setEntries((previousEntries) =>
        previousEntries.map((entry) =>
          entry.id === entryId ? { ...entry, shouldAutoInject: !shouldAutoInject } : entry
        )
      )
      setTimedError(err.message)
    }
  }, [setTimedError])

  /**
   * Requests injection of selected vault entries into a terminal session.
   * Returns a scriptPath pointing to a temporary PS1 file the terminal can source.
   *
   * @param {string[]} entryIds - IDs of entries to inject
   * @returns {Promise<{ scriptPath: string }|null>}
   */
  const injectEntries = useCallback(async (entryIds) => {
    setIsLoading(true)
    try {
      const injectionResult = await vaultFetch('/api/vault/inject', {
        method: 'POST',
        body: JSON.stringify({ entryIds }),
      })
      return injectionResult
    } catch (err) {
      console.error('[Vault] injectEntries error:', err)
      setTimedError(err.message)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [setTimedError])

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  return {
    entries,
    status,
    isLoading,
    isAdding,
    error,
    loadEntries,
    loadStatus,
    addEntry,
    removeEntry,
    toggleAutoInject,
    injectEntries,
    clearError,
  }
}
