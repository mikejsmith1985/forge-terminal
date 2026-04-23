// CompanionAccessCard.test.jsx — tests for the Cloudflare tunnel integration
// in the Companion PWA card.  TDD: these tests are written first, confirmed
// RED, then the implementation is added to make them GREEN.
//
// Scope: tunnel launch/stop/status polling and Step-2 URL auto-population.
// Pure URL helpers are tested in companionUrl.test.js.

import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import CompanionAccessCard from './CompanionAccessCard'

// ── Global fetch mock setup ───────────────────────────────────────────────────

// Returns a resolved fetch response with JSON body.
function mockFetchResponse(body, status = 200) {
  return Promise.resolve({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  })
}

// Map of URL → handler function for the global fetch mock.
let fetchHandlers = {}

beforeEach(() => {
  vi.useFakeTimers()

  fetchHandlers = {
    '/api/mobile/settings': () =>
      mockFetchResponse({
        mobile_access_enabled: true,
        mobile_token: 'test-token-abc123',
        token_path: '~/.forge/mobile-token',
      }),
    '/api/tunnel/status': () =>
      mockFetchResponse({ running: false, url: '', error: '' }),
    '/api/tunnel/start': () =>
      mockFetchResponse({ running: true, url: '', error: '' }),
    '/api/tunnel/stop': () =>
      mockFetchResponse({ status: 'stopped' }),
  }

  vi.stubGlobal(
    'fetch',
    vi.fn((url) => {
      const handler = fetchHandlers[url]
      if (handler) return handler()
      return Promise.reject(new Error(`Unmocked fetch: ${url}`))
    })
  )

  // Stub clipboard so copy buttons don't throw
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  })

  // Suppress QRCode canvas errors in jsdom
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  localStorage.clear()
})

// ── Helpers ───────────────────────────────────────────────────────────────────

async function renderExpanded() {
  const utils = render(<CompanionAccessCard />)
  // Wait for settings to load
  await act(async () => {
    await vi.runAllTimersAsync()
  })
  // Expand the card
  const header = utils.container.querySelector('.cac-header')
  fireEvent.click(header)
  // Wait for async state to settle
  await act(async () => {
    await vi.runAllTimersAsync()
  })
  return utils
}

// ── Tests: launch button presence ────────────────────────────────────────────

describe('CompanionAccessCard — tunnel integration', () => {
  it('renders a Launch Tunnel button when no tunnel is running', async () => {
    await renderExpanded()
    expect(screen.getByRole('button', { name: /launch tunnel/i })).toBeInTheDocument()
  })

  it('does NOT render a Stop Tunnel button when no tunnel is running', async () => {
    await renderExpanded()
    expect(screen.queryByRole('button', { name: /stop tunnel/i })).not.toBeInTheDocument()
  })

  // ── Tests: launching ───────────────────────────────────────────────────────

  it('calls POST /api/tunnel/start when Launch Tunnel is clicked', async () => {
    await renderExpanded()
    fireEvent.click(screen.getByRole('button', { name: /launch tunnel/i }))
    await act(async () => { await vi.runAllTimersAsync() })
    expect(fetch).toHaveBeenCalledWith('/api/tunnel/start', expect.objectContaining({ method: 'POST' }))
  })

  it('shows a launching/starting indicator after clicking Launch Tunnel', async () => {
    await renderExpanded()
    fireEvent.click(screen.getByRole('button', { name: /launch tunnel/i }))
    await act(async () => { await vi.runAllTimersAsync() })
    expect(screen.getByText(/starting|launching/i)).toBeInTheDocument()
  })

  // ── Tests: URL auto-population ────────────────────────────────────────────

  it('auto-populates Step 2 URL input when tunnel status returns a URL', async () => {
    // The first status poll returns no URL; the second returns the tunnel URL.
    let statusCallCount = 0
    fetchHandlers['/api/tunnel/status'] = () => {
      statusCallCount++
      if (statusCallCount >= 2) {
        return mockFetchResponse({ running: true, url: 'https://abc123.trycloudflare.com', error: '' })
      }
      return mockFetchResponse({ running: true, url: '', error: '' })
    }

    await renderExpanded()
    fireEvent.click(screen.getByRole('button', { name: /launch tunnel/i }))

    // Advance through polling intervals until URL appears
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000)
    })

    const urlInput = screen.getByPlaceholderText(/forge url|forge server url/i)
    expect(urlInput.value).toBe('https://abc123.trycloudflare.com')
  })

  it('pre-fills the URL input on mount when a tunnel is already running', async () => {
    fetchHandlers['/api/tunnel/status'] = () =>
      mockFetchResponse({ running: true, url: 'https://existing.trycloudflare.com', error: '' })

    await renderExpanded()

    await waitFor(() => {
      const urlInput = screen.getByPlaceholderText(/forge url|forge server url/i)
      expect(urlInput.value).toBe('https://existing.trycloudflare.com')
    })
  })

  // ── Tests: stop tunnel ────────────────────────────────────────────────────

  it('renders a Stop Tunnel button when tunnel is running', async () => {
    fetchHandlers['/api/tunnel/status'] = () =>
      mockFetchResponse({ running: true, url: 'https://abc.trycloudflare.com', error: '' })

    await renderExpanded()
    await act(async () => { await vi.runAllTimersAsync() })

    expect(screen.getByRole('button', { name: /stop tunnel/i })).toBeInTheDocument()
  })

  it('calls POST /api/tunnel/stop when Stop Tunnel is clicked', async () => {
    fetchHandlers['/api/tunnel/status'] = () =>
      mockFetchResponse({ running: true, url: 'https://abc.trycloudflare.com', error: '' })

    await renderExpanded()
    await act(async () => { await vi.runAllTimersAsync() })

    fireEvent.click(screen.getByRole('button', { name: /stop tunnel/i }))
    await act(async () => { await vi.runAllTimersAsync() })

    expect(fetch).toHaveBeenCalledWith('/api/tunnel/stop', expect.objectContaining({ method: 'POST' }))
  })

  // ── Tests: error handling ─────────────────────────────────────────────────

  it('shows an error message when the tunnel fails to start', async () => {
    fetchHandlers['/api/tunnel/start'] = () =>
      mockFetchResponse({ error: 'cloudflared not found — install it or use the Forge setup wizard' }, 500)

    await renderExpanded()
    fireEvent.click(screen.getByRole('button', { name: /launch tunnel/i }))
    await act(async () => { await vi.runAllTimersAsync() })

    expect(screen.getByText(/cloudflared not found/i)).toBeInTheDocument()
  })

  it('shows a download link when cloudflared is not installed', async () => {
    fetchHandlers['/api/tunnel/start'] = () =>
      mockFetchResponse({ error: 'cloudflared not found' }, 500)

    await renderExpanded()
    fireEvent.click(screen.getByRole('button', { name: /launch tunnel/i }))
    await act(async () => { await vi.runAllTimersAsync() })

    expect(screen.getByRole('link', { name: /download cloudflared/i })).toBeInTheDocument()
  })
})
