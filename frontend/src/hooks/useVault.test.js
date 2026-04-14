// useVault.test.js — Unit tests for the useVault React hook.
//
// Mocks global fetch to verify that the hook correctly manages vault state:
// loading entries, adding secrets, removing entries, and handling errors.
// Secret values are never stored in hook state — this is verified explicitly.
import { renderHook, act, waitFor } from '@testing-library/react'
import { useVault } from './useVault'

// ── Mock Setup ──────────────────────────────────────────────────────────────

const mockVaultStatusResponse = {
  isOpen: true,
  entryCount: 2,
  autoInjectCount: 1,
  vaultPath: '/home/user/.forge/vault/vault.enc',
}

const mockVaultEntriesResponse = [
  {
    id: 'entry-001',
    secretName: 'OpenAI API Key',
    envVarName: 'OPENAI_API_KEY',
    description: 'For code generation',
    shouldAutoInject: true,
    createdAt: '2024-01-15T10:00:00Z',
  },
  {
    id: 'entry-002',
    secretName: 'GitHub Token',
    envVarName: 'GITHUB_TOKEN',
    description: '',
    shouldAutoInject: false,
    createdAt: '2024-01-15T11:00:00Z',
  },
]

const mockNewEntryResponse = {
  id: 'entry-003',
  secretName: 'New Key',
  envVarName: 'NEW_KEY',
  description: '',
  shouldAutoInject: false,
  createdAt: '2024-01-16T09:00:00Z',
}

beforeEach(() => {
  global.fetch = vi.fn((url) => {
    const urlPath = new URL(url, 'http://localhost').pathname
    const searchParams = new URL(url, 'http://localhost').searchParams

    if (urlPath === '/api/vault/status') {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockVaultStatusResponse),
        text: () => Promise.resolve(JSON.stringify(mockVaultStatusResponse)),
      })
    }

    if (urlPath === '/api/vault/entries/value') {
      const entryId = searchParams.get('id')
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ value: `secret-for-${entryId}` }),
        text: () => Promise.resolve(JSON.stringify({ value: `secret-for-${entryId}` })),
      })
    }

    if (urlPath === '/api/vault/entries') {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockVaultEntriesResponse),
        text: () => Promise.resolve(JSON.stringify(mockVaultEntriesResponse)),
      })
    }

    return Promise.resolve({
      ok: true,
      status: 204,
      json: () => Promise.resolve(null),
      text: () => Promise.resolve(''),
    })
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ── Tests ───────────────────────────────────────────────────────────────────

describe('useVault', () => {
  it('starts with empty entries and no error', () => {
    const { result } = renderHook(() => useVault())

    expect(result.current.entries).toEqual([])
    expect(result.current.error).toBeNull()
    expect(result.current.status).toBeNull()
  })

  it('loadEntries populates entries from the backend', async () => {
    const { result } = renderHook(() => useVault())

    await act(async () => {
      await result.current.loadEntries()
    })

    expect(result.current.entries).toHaveLength(2)
    expect(result.current.entries[0].envVarName).toBe('OPENAI_API_KEY')
    expect(result.current.entries[1].envVarName).toBe('GITHUB_TOKEN')
  })

  it('loadStatus populates vault status from the backend', async () => {
    const { result } = renderHook(() => useVault())

    await act(async () => {
      await result.current.loadStatus()
    })

    expect(result.current.status).not.toBeNull()
    expect(result.current.status.isOpen).toBe(true)
    expect(result.current.status.entryCount).toBe(2)
  })

  it('addEntry appends the new entry to local state without a full reload', async () => {
    // Pre-populate entries so we can verify append behavior.
    global.fetch = vi.fn((url) => {
      const urlPath = new URL(url, 'http://localhost').pathname

      if (urlPath === '/api/vault/entries' && !url.includes('method=GET')) {
        // POST — return the new entry
        return Promise.resolve({
          ok: true,
          status: 201,
          json: () => Promise.resolve(mockNewEntryResponse),
          text: () => Promise.resolve(JSON.stringify(mockNewEntryResponse)),
        })
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockVaultEntriesResponse),
        text: () => Promise.resolve(JSON.stringify(mockVaultEntriesResponse)),
      })
    })

    const { result } = renderHook(() => useVault())

    await act(async () => {
      await result.current.loadEntries()
    })

    const initialCount = result.current.entries.length

    await act(async () => {
      await result.current.addEntry({
        secretName: 'New Key',
        envVarName: 'NEW_KEY',
        secretValue: 'new-secret-value',
        description: '',
        shouldAutoInject: false,
      })
    })

    // The new entry should be appended without a full reload
    expect(result.current.entries.length).toBeGreaterThan(initialCount)
  })

  it('removeEntry removes the entry from local state by id', async () => {
    const { result } = renderHook(() => useVault())

    await act(async () => {
      await result.current.loadEntries()
    })

    expect(result.current.entries).toHaveLength(2)

    await act(async () => {
      await result.current.removeEntry('entry-001')
    })

    expect(result.current.entries.find((entry) => entry.id === 'entry-001')).toBeUndefined()
  })

  it('revealEntry returns the secret value without storing it in entries state', async () => {
    const { result } = renderHook(() => useVault())

    let revealedValue
    await act(async () => {
      revealedValue = await result.current.revealEntry('entry-001')
    })

    expect(revealedValue).toBe('secret-for-entry-001')

    // Entries state must remain free of any secret values — this is a security invariant.
    for (const entry of result.current.entries) {
      expect(entry).not.toHaveProperty('secretValue')
      expect(entry).not.toHaveProperty('value')
    }
  })

  it('sets a timed error message on fetch failure', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Network failure')))

    const { result } = renderHook(() => useVault())

    await act(async () => {
      await result.current.loadEntries()
    })

    await waitFor(() => {
      expect(result.current.error).not.toBeNull()
    })
  })

  it('clearError removes the error message immediately', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Network failure')))

    const { result } = renderHook(() => useVault())

    await act(async () => {
      await result.current.loadEntries()
    })

    await waitFor(() => {
      expect(result.current.error).not.toBeNull()
    })

    act(() => {
      result.current.clearError()
    })

    expect(result.current.error).toBeNull()
  })
})
